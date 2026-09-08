import {
  audit,
  createConnection,
  getConnectionRow,
  listConnections,
  pauseAccountsOfConnection,
  toPublicConnection,
  updateConnectionStatus,
  type PublicConnection,
} from '@adpub/db';
import { MetaApiError, getMe, listOwnedAdAccounts } from '@adpub/meta-client';
import type { ApiTier, SessionUser } from '@adpub/shared';
import { unprocessable } from '../lib/problem.js';
import type { ApiDeps } from '../lib/deps.js';

export interface ConnectionTestResult {
  ok: boolean;
  businessName?: string;
  accounts: number;
  tier: ApiTier;
  detail?: string;
}

/** US1 cenário 1: testa o token antes de cifrar e salvar. */
export async function testToken(
  deps: ApiDeps,
  input: { businessId: string; token: string },
): Promise<ConnectionTestResult> {
  const client = deps.metaClientForToken(input.token);
  try {
    const me = await getMe(client);
    const accounts = await listOwnedAdAccounts(client, input.businessId);
    const tier: ApiTier = client.lastUsage?.tier ?? 'unknown';
    return {
      ok: true,
      ...(me.name ? { businessName: me.name } : {}),
      accounts: accounts.length,
      tier,
    };
  } catch (error) {
    if (error instanceof MetaApiError) {
      return {
        ok: false,
        accounts: 0,
        tier: 'unknown',
        detail: `${error.translated.title} ${error.translated.action}`.trim(),
      };
    }
    throw error;
  }
}

export async function createAndTestConnection(
  deps: ApiDeps,
  actor: SessionUser,
  input: { businessId: string; label: string; token: string },
): Promise<PublicConnection> {
  const test = await testToken(deps, input);
  if (!test.ok) {
    throw unprocessable(test.detail ?? 'Token recusado pela Meta.');
  }
  const connection = await createConnection(deps.db, {
    businessId: input.businessId,
    label: input.label,
    token: input.token,
    scopes: ['ads_management', 'business_management', 'pages_read_engagement', 'pages_manage_ads'],
    apiTier: test.tier,
  });
  await audit(deps.db, {
    actor: { id: actor.id, email: actor.email },
    action: 'connection.create',
    entityType: 'meta_connection',
    entityId: connection.id,
    after: { business_id: input.businessId, label: input.label, api_tier: test.tier },
  });
  return connection;
}

export async function retestConnection(
  deps: ApiDeps,
  actor: SessionUser,
  connectionId: string,
): Promise<PublicConnection> {
  const row = await getConnectionRow(deps.db, connectionId);
  if (!row) throw unprocessable(`Conexão ${connectionId} não encontrada.`);
  const client = await deps.metaClientFor(connectionId);

  try {
    await getMe(client);
    const accounts = await listOwnedAdAccounts(client, row.businessId);
    const updated = await updateConnectionStatus(deps.db, connectionId, {
      status: 'active',
      apiTier: client.lastUsage?.tier ?? row.apiTier,
      lastError: null,
    });
    await audit(deps.db, {
      actor: { id: actor.id, email: actor.email },
      action: 'connection.test',
      entityType: 'meta_connection',
      entityId: connectionId,
      after: { ok: true, accounts: accounts.length },
    });
    return updated ?? toPublicConnection(row);
  } catch (error) {
    const detail =
      error instanceof MetaApiError
        ? `${error.translated.title} ${error.translated.action}`.trim()
        : 'Falha ao falar com a Meta.';
    const updated = await markNeedsAttention(deps, connectionId, detail, {
      id: actor.id,
      email: actor.email,
    });
    return updated ?? toPublicConnection(row);
  }
}

/** US1 cenário 3: token inválido pausa filas de todas as contas e alerta. */
export async function markNeedsAttention(
  deps: ApiDeps,
  connectionId: string,
  detail: string,
  actor: { id?: string | null; email?: string | null } = {},
): Promise<PublicConnection | undefined> {
  const updated = await updateConnectionStatus(deps.db, connectionId, {
    status: 'needs_attention',
    lastError: detail,
  });
  const pausedUntil = new Date(Date.now() + 60 * 60 * 1000);
  const paused = await pauseAccountsOfConnection(deps.db, connectionId, pausedUntil);
  await audit(deps.db, {
    actor,
    action: 'connection.needs_attention',
    entityType: 'meta_connection',
    entityId: connectionId,
    after: { detail, paused_accounts: paused, paused_until: pausedUntil.toISOString() },
  });
  return updated;
}

export async function listAllConnections(deps: ApiDeps): Promise<PublicConnection[]> {
  return listConnections(deps.db);
}
