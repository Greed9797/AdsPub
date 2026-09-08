import { canAccessAccount, getBatch, type BatchRow } from '@adpub/db';
import type { SessionUser } from '@adpub/shared';
import { forbidden, notFound } from './problem.js';
import type { ApiDeps } from './deps.js';

/** RBAC por escopo de conta (FR-021). */
export async function assertAccountAccess(
  deps: ApiDeps,
  user: SessionUser,
  adAccountId: string,
): Promise<void> {
  const allowed = await canAccessAccount(deps.db, { userId: user.id, role: user.role }, adAccountId);
  if (!allowed) throw forbidden(`Você não tem acesso à conta ${adAccountId}.`);
}

export async function batchInScope(
  deps: ApiDeps,
  user: SessionUser,
  batchId: string,
): Promise<BatchRow> {
  const batch = await getBatch(deps.db, batchId);
  if (!batch) throw notFound(`Lote ${batchId} não encontrado.`);
  await assertAccountAccess(deps, user, batch.adAccountId);
  return batch;
}
