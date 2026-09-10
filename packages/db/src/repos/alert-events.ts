import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { alertEvents } from '../schema.js';
import type { Database } from '../client.js';

export type AlertEventRow = typeof alertEvents.$inferSelect;

/** Regras versionadas. Versão nova = fingerprint novo = realerta 1 vez. */
export const ALERT_RULES = {
  'sync-stale': 'sync-stale.v1',
  connection: 'connection.v1',
  'batch-failures': 'batch-failures.v1',
  reconciliation: 'reconciliation.v1',
  'insights-partial': 'insights-partial.v1',
  fatigue: 'fatigue.v1',
} as const;

export type AlertRule = keyof typeof ALERT_RULES;

export interface AlertInput {
  rule: AlertRule;
  adAccountId?: string | null;
  entity?: string;
  windowHours?: number;
  title: string;
  detail: string;
  severity: 'info' | 'warning' | 'critical';
  context?: Record<string, unknown>;
  now?: Date;
}

export type Alerter = (input: {
  title: string;
  detail: string;
  severity: 'info' | 'warning' | 'critical';
  context?: Record<string, unknown>;
}) => Promise<void>;

/**
 * T-009-1: abre alerta só sem `open` na janela. Retry do mesmo incidente
 * cai no dedup — nunca realerta.
 */
export async function dedupAlert(
  db: Database,
  alert: Alerter,
  input: AlertInput,
): Promise<{ alerted: boolean; id: string }> {
  const now = input.now ?? new Date();
  const windowHours = input.windowHours ?? 24;
  const windowStart = new Date(
    Math.floor(now.getTime() / (windowHours * 3600_000)) * windowHours * 3600_000,
  );
  const ruleVersion = ALERT_RULES[input.rule];
  const fingerprint = createHash('sha256')
    .update(`${input.rule}@${ruleVersion}|${input.adAccountId ?? ''}|${input.entity ?? ''}|${windowStart.toISOString()}`)
    .digest('hex');
  const [existing] = await db
    .select({ id: alertEvents.id })
    .from(alertEvents)
    .where(and(eq(alertEvents.fingerprint, fingerprint), eq(alertEvents.state, 'open')))
    .limit(1);
  if (existing) return { alerted: false, id: existing.id };
  const [row] = await db
    .insert(alertEvents)
    .values({
      rule: input.rule,
      ruleVersion,
      adAccountId: input.adAccountId ?? null,
      entity: input.entity ?? '',
      fingerprint,
      windowStart,
      state: 'open',
      detail: { title: input.title, detail: input.detail, context: input.context ?? {} },
    })
    .onConflictDoNothing()
    .returning({ id: alertEvents.id });
  if (!row) {
    const [winner] = await db
      .select({ id: alertEvents.id })
      .from(alertEvents)
      .where(eq(alertEvents.fingerprint, fingerprint))
      .limit(1);
    return { alerted: false, id: winner?.id ?? '' };
  }
  await alert({ title: input.title, detail: input.detail, severity: input.severity, context: input.context });
  return { alerted: true, id: row.id };
}

export async function ackAlert(db: Database, id: string): Promise<void> {
  await db.update(alertEvents).set({ state: 'acked' }).where(eq(alertEvents.id, id));
}

export async function resolveAlert(db: Database, id: string): Promise<void> {
  await db
    .update(alertEvents)
    .set({ state: 'resolved', resolvedAt: new Date() })
    .where(eq(alertEvents.id, id));
}
