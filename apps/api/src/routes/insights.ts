import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getSyncState, listObservations } from '@adpub/db';
import { INSIGHTS_SYNC } from '@adpub/config';
import { requireRole } from '../plugins/auth.js';
import { assertAccountAccess } from '../lib/scope.js';
import type { ApiDeps } from '../lib/deps.js';
import { requireFeature } from '../lib/features.js';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data YYYY-MM-DD.');

/** T-004-3: backfill 90d em janelas de 30d. */
function backfillWindows(today = new Date()): Array<{ since: string; until: string }> {
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 1));
  const windows: Array<{ since: string; until: string }> = [];
  let windowEnd = end;
  for (let i = 0; i < INSIGHTS_SYNC.backfillDays / INSIGHTS_SYNC.backfillWindowDays; i += 1) {
    const windowStart = new Date(windowEnd);
    windowStart.setUTCDate(windowStart.getUTCDate() - INSIGHTS_SYNC.backfillWindowDays + 1);
    windows.unshift({
      since: windowStart.toISOString().slice(0, 10),
      until: windowEnd.toISOString().slice(0, 10),
    });
    windowEnd = new Date(windowStart);
    windowEnd.setUTCDate(windowEnd.getUTCDate() - 1);
  }
  return windows;
}

/** T-004-3: sync de Insights só-leitura, com checkpoint por conta. */
export function insightsRoutes(app: FastifyInstance, deps: ApiDeps): void {
  app.post('/insights/sync-jobs', async (request, reply) => {
    const user = requireRole(request, ['admin', 'coordinator']);
    requireFeature(deps, 'featureInsights');
    const body = z
      .object({
        ad_account_id: z.string().min(1),
        since: dateSchema.optional(),
        until: dateSchema.optional(),
        backfill: z.boolean().default(false),
      })
      .strict()
      .parse(request.body);
    await assertAccountAccess(deps, user, body.ad_account_id);
    const windows =
      body.backfill || !body.since || !body.until
        ? backfillWindows()
        : [{ since: body.since, until: body.until }];
    const jobs = [];
    for (const window of windows) {
      jobs.push(
        await deps.queues.enqueueInsights({
          adAccountId: body.ad_account_id,
          since: window.since,
          until: window.until,
          ...(body.backfill ? { backfill: true as const } : {}),
        }),
      );
    }
    return reply.status(202).send({ jobs, windows });
  });

  app.get('/insights/sync-jobs', async (request) => {
    const user = requireRole(request, ['admin', 'coordinator']);
    const query = z.object({ ad_account_id: z.string().min(1) }).parse(request.query);
    await assertAccountAccess(deps, user, query.ad_account_id);
    const state = await getSyncState(deps.db, query.ad_account_id);
    return {
      ad_account_id: query.ad_account_id,
      last_daily_covered: state?.lastDailyCovered ?? null,
      moving_window: { start: state?.movingWindowStart ?? null, end: state?.movingWindowEnd ?? null },
      pending_report_run_id: state?.pendingReportRunId ?? null,
      consecutive_failures: state?.consecutiveFailures ?? 0,
    };
  });

  app.get('/observations', async (request) => {
    const user = requireRole(request, ['admin', 'coordinator']);
    const query = z
      .object({
        ad_account_id: z.string().min(1),
        source: z.enum(['file', 'api']).optional(),
        from: dateSchema.optional(),
        to: dateSchema.optional(),
      })
      .parse(request.query);
    await assertAccountAccess(deps, user, query.ad_account_id);
    const rows = await listObservations(deps.db, {
      adAccountId: query.ad_account_id,
      ...(query.source ? { source: query.source } : {}),
      ...(query.from ? { from: query.from } : {}),
      ...(query.to ? { to: query.to } : {}),
    });
    return rows.map((row) => ({
      id: row.id,
      source: row.source,
      snapshot_id: row.snapshotId,
      ad_id: row.adId,
      ad_name: row.adName,
      entity_level: row.entityLevel,
      date_start: row.dateStart,
      date_stop: row.dateStop,
      grain: row.grain,
      attribution: row.attribution,
      coverage: row.coverage,
      metrics: row.metrics,
      observed_at: row.observedAt?.toISOString() ?? null,
    }));
  });
}
