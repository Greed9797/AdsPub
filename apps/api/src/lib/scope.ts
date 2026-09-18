import { canAccessAccount, getBatch, getClient, listVisibleAccounts, type BatchRow } from '@adpub/db';
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

/**
 * Etapa 2: cliente é o universo de contas visíveis. admin/coordinator
 * administram cliente sem conta; manager/viewer precisam de ao menos uma
 * conta desse cliente. Não cria ACL nova: reusa escopo de conta (FR-021).
 */
export async function assertClientAccess(
  deps: ApiDeps,
  user: SessionUser,
  clientId: string,
): Promise<void> {
  const client = await getClient(deps.db, clientId);
  if (!client) throw notFound(`Cliente ${clientId} não encontrado.`);
  if (user.role === 'admin' || user.role === 'coordinator') return;
  const visible = await listVisibleAccounts(
    deps.db,
    { userId: user.id, role: user.role },
    { clientId },
  );
  if (visible.length === 0) throw forbidden('Você não tem acesso a este cliente.');
}
