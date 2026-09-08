import { redact } from '@adpub/crypto';
import { auditLog } from '../schema.js';
import type { Database } from '../client.js';

export interface AuditActor {
  id?: string | null;
  email?: string | null;
  ip?: string | null;
}

export interface AuditInput {
  actor?: AuditActor | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  metaRequest?: unknown;
  metaResponse?: unknown;
}

/**
 * FR-015 / Constituição IV: toda escrita registrada, com payload mascarado.
 * Auditoria nunca deve derrubar a operação principal.
 */
export async function audit(db: Database, input: AuditInput): Promise<void> {
  await db.insert(auditLog).values({
    actorId: input.actor?.id ?? null,
    actorEmail: input.actor?.email ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    before: input.before === undefined ? null : redact(input.before),
    after: input.after === undefined ? null : redact(input.after),
    metaRequest: input.metaRequest === undefined ? null : redact(input.metaRequest),
    metaResponse: input.metaResponse === undefined ? null : redact(input.metaResponse),
    ip: input.actor?.ip ?? null,
  });
}

export interface AuditQuery {
  entityType?: string;
  entityId?: string;
  actorId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}

export async function listAudit(db: Database, query: AuditQuery) {
  const { and, desc, eq, gte, lte } = await import('drizzle-orm');
  const filters = [
    query.entityType ? eq(auditLog.entityType, query.entityType) : undefined,
    query.entityId ? eq(auditLog.entityId, query.entityId) : undefined,
    query.actorId ? eq(auditLog.actorId, query.actorId) : undefined,
    query.from ? gte(auditLog.createdAt, query.from) : undefined,
    query.to ? lte(auditLog.createdAt, query.to) : undefined,
  ].filter((f): f is Exclude<typeof f, undefined> => f !== undefined);

  return db
    .select()
    .from(auditLog)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(auditLog.createdAt))
    .limit(Math.min(query.limit ?? 100, 500));
}
