import { and, eq, sql } from 'drizzle-orm';
import type { PublishStep } from '@adpub/shared';
import { publishJobs } from '../schema.js';
import type { PublishJobRow } from '../schema.js';
import type { Database } from '../client.js';

export async function upsertPublishJob(
  db: Database,
  input: {
    adDraftId: string;
    queue: string;
    bullJobId?: string | null;
    step: PublishStep;
    state?: PublishJobRow['state'];
    attempts?: number;
    nextRunAt?: Date | null;
    lastError?: Record<string, unknown> | null;
  },
): Promise<PublishJobRow> {
  const existing = await currentJob(db, input.adDraftId);
  if (!existing) {
    const [row] = await db
      .insert(publishJobs)
      .values({
        adDraftId: input.adDraftId,
        queue: input.queue,
        bullJobId: input.bullJobId ?? null,
        step: input.step,
        state: input.state ?? 'waiting',
        attempts: input.attempts ?? 0,
        nextRunAt: input.nextRunAt ?? null,
        lastError: input.lastError ?? null,
        startedAt: input.state === 'active' ? new Date() : null,
      })
      .returning();
    if (!row) throw new Error('Falha ao registrar job de publicação.');
    return row;
  }
  const [row] = await db
    .update(publishJobs)
    .set({
      queue: input.queue,
      bullJobId: input.bullJobId ?? existing.bullJobId,
      step: input.step,
      state: input.state ?? existing.state,
      attempts: input.attempts ?? existing.attempts,
      nextRunAt: input.nextRunAt ?? null,
      lastError: input.lastError === undefined ? existing.lastError : input.lastError,
      startedAt: input.state === 'active' ? new Date() : existing.startedAt,
      finishedAt:
        input.state === 'completed' || input.state === 'failed' ? new Date() : existing.finishedAt,
      updatedAt: new Date(),
    })
    .where(eq(publishJobs.id, existing.id))
    .returning();
  if (!row) throw new Error('Falha ao atualizar job de publicação.');
  return row;
}

export async function currentJob(
  db: Database,
  adDraftId: string,
): Promise<PublishJobRow | undefined> {
  const [row] = await db
    .select()
    .from(publishJobs)
    .where(eq(publishJobs.adDraftId, adDraftId))
    .orderBy(sql`${publishJobs.createdAt} desc`)
    .limit(1);
  return row;
}

export async function countPendingJobs(db: Database, adAccountId: string): Promise<number> {
  const [row] = await db.execute<{ total: number }>(sql`
    select count(*)::int as total
    from publish_jobs j
    join ad_drafts d on d.id = j.ad_draft_id
    join batches b on b.id = d.batch_id
    where b.ad_account_id = ${adAccountId}
      and j.state in ('waiting', 'active', 'delayed')
  `);
  return row?.total ?? 0;
}

export async function jobsInState(
  db: Database,
  state: PublishJobRow['state'],
): Promise<PublishJobRow[]> {
  return db.select().from(publishJobs).where(eq(publishJobs.state, state));
}

export async function markJobState(
  db: Database,
  id: string,
  state: PublishJobRow['state'],
  lastError?: Record<string, unknown> | null,
): Promise<void> {
  await db
    .update(publishJobs)
    .set({
      state,
      lastError: lastError ?? null,
      finishedAt: state === 'completed' || state === 'failed' ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(and(eq(publishJobs.id, id)));
}
