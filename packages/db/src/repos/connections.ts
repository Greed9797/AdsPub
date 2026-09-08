import { and, eq } from 'drizzle-orm';
import { getCipher } from '@adpub/crypto';
import type { ApiTier, ConnectionStatus } from '@adpub/shared';
import { adAccounts, metaConnections } from '../schema.js';
import type { Database } from '../client.js';
import type { MetaConnectionRow } from '../schema.js';

export type PublicConnection = Omit<MetaConnectionRow, 'tokenCiphertext' | 'tokenIv'>;

export function toPublicConnection(row: MetaConnectionRow): PublicConnection {
  const { tokenCiphertext: _c, tokenIv: _i, ...rest } = row;
  return rest;
}

export async function createConnection(
  db: Database,
  input: {
    businessId: string;
    label: string;
    token: string;
    scopes: string[];
    apiTier: ApiTier;
    tokenExpiresAt?: Date | null;
  },
): Promise<PublicConnection> {
  const sealed = getCipher().encrypt(input.token);
  const [row] = await db
    .insert(metaConnections)
    .values({
      businessId: input.businessId,
      label: input.label,
      tokenCiphertext: sealed.ciphertext,
      tokenIv: sealed.iv,
      scopes: input.scopes,
      apiTier: input.apiTier,
      status: 'active',
      tokenExpiresAt: input.tokenExpiresAt ?? null,
      lastCheckedAt: new Date(),
    })
    .returning();
  if (!row) throw new Error('Falha ao criar conexão.');
  return toPublicConnection(row);
}

export async function listConnections(db: Database): Promise<PublicConnection[]> {
  const rows = await db.select().from(metaConnections);
  return rows.map(toPublicConnection);
}

export async function getConnectionRow(
  db: Database,
  id: string,
): Promise<MetaConnectionRow | undefined> {
  const [row] = await db.select().from(metaConnections).where(eq(metaConnections.id, id));
  return row;
}

/** Devolve o token em claro — só para o pipeline/serviços, nunca para a UI. */
export async function getConnectionToken(db: Database, id: string): Promise<string> {
  const row = await getConnectionRow(db, id);
  if (!row) throw new Error(`Conexão ${id} não encontrada.`);
  return getCipher().decrypt({ ciphertext: row.tokenCiphertext, iv: row.tokenIv });
}

export async function getConnectionForAccount(
  db: Database,
  adAccountId: string,
): Promise<{ connection: MetaConnectionRow; token: string }> {
  const [row] = await db
    .select({ connection: metaConnections })
    .from(adAccounts)
    .innerJoin(metaConnections, eq(adAccounts.connectionId, metaConnections.id))
    .where(eq(adAccounts.id, adAccountId));
  if (!row) throw new Error(`Conta ${adAccountId} sem conexão.`);
  const token = getCipher().decrypt({
    ciphertext: row.connection.tokenCiphertext,
    iv: row.connection.tokenIv,
  });
  return { connection: row.connection, token };
}

export async function updateConnectionStatus(
  db: Database,
  id: string,
  patch: {
    status?: ConnectionStatus;
    apiTier?: ApiTier;
    lastError?: string | null;
    scopes?: string[];
    tokenExpiresAt?: Date | null;
  },
): Promise<PublicConnection | undefined> {
  const [row] = await db
    .update(metaConnections)
    .set({ ...patch, lastCheckedAt: new Date(), updatedAt: new Date() })
    .where(eq(metaConnections.id, id))
    .returning();
  return row ? toPublicConnection(row) : undefined;
}

export async function rotateConnectionToken(
  db: Database,
  id: string,
  token: string,
): Promise<void> {
  const sealed = getCipher().encrypt(token);
  await db
    .update(metaConnections)
    .set({
      tokenCiphertext: sealed.ciphertext,
      tokenIv: sealed.iv,
      status: 'active',
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(metaConnections.id, id));
}

/** US1 cenário 3: token inválido pausa as filas de todas as contas da conexão. */
export async function pauseAccountsOfConnection(
  db: Database,
  connectionId: string,
  until: Date,
): Promise<string[]> {
  const rows = await db
    .update(adAccounts)
    .set({ pausedUntil: until, updatedAt: new Date() })
    .where(eq(adAccounts.connectionId, connectionId))
    .returning({ id: adAccounts.id });
  return rows.map((r) => r.id);
}

export async function findConnectionByBusiness(
  db: Database,
  businessId: string,
  label: string,
): Promise<MetaConnectionRow | undefined> {
  const [row] = await db
    .select()
    .from(metaConnections)
    .where(and(eq(metaConnections.businessId, businessId), eq(metaConnections.label, label)));
  return row;
}
