import { and, eq, gt, isNull, lt, or } from 'drizzle-orm';
import { oauthAuthorizationCodes, oauthClients, oauthTokens } from '../schema.js';
import type { OAuthAuthorizationCodeRow, OAuthClientRow, OAuthTokenRow } from '../schema.js';
import type { Database } from '../client.js';

/**
 * Persistência do servidor de autorização do MCP. Tokens e códigos entram
 * sempre como hash: o valor que o cliente guarda nunca é gravado.
 */

export interface OAuthClientInput {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  grantTypes: string[];
  responseTypes: string[];
  scopes: string[];
}

export async function registerOAuthClient(
  db: Database,
  input: OAuthClientInput,
): Promise<OAuthClientRow> {
  const [row] = await db
    .insert(oauthClients)
    .values({
      clientId: input.clientId,
      clientName: input.clientName,
      redirectUris: input.redirectUris,
      grantTypes: input.grantTypes,
      responseTypes: input.responseTypes,
      scopes: input.scopes,
    })
    .returning();
  if (!row) throw new Error('Falha ao registrar cliente OAuth.');
  return row;
}

export async function getOAuthClient(
  db: Database,
  clientId: string,
): Promise<OAuthClientRow | undefined> {
  const [row] = await db.select().from(oauthClients).where(eq(oauthClients.clientId, clientId));
  return row;
}

export async function touchOAuthClient(db: Database, clientId: string): Promise<void> {
  await db.update(oauthClients).set({ lastUsedAt: new Date() }).where(eq(oauthClients.clientId, clientId));
}

export interface AuthorizationCodeInput {
  codeHash: string;
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: readonly string[];
  resource: string | null;
  expiresAt: Date;
}

export async function insertAuthorizationCode(
  db: Database,
  input: AuthorizationCodeInput,
): Promise<void> {
  await db.insert(oauthAuthorizationCodes).values({
    codeHash: input.codeHash,
    clientId: input.clientId,
    userId: input.userId,
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    scopes: [...input.scopes],
    resource: input.resource,
    expiresAt: input.expiresAt,
  });
}

/**
 * Consome o código em um único UPDATE condicional: quem chega depois (replay
 * ou corrida) não encontra linha e recebe `invalid_grant`.
 */
export async function consumeAuthorizationCode(
  db: Database,
  codeHash: string,
): Promise<OAuthAuthorizationCodeRow | undefined> {
  const [row] = await db
    .update(oauthAuthorizationCodes)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(oauthAuthorizationCodes.codeHash, codeHash),
        isNull(oauthAuthorizationCodes.consumedAt),
        gt(oauthAuthorizationCodes.expiresAt, new Date()),
      ),
    )
    .returning();
  return row;
}

export interface OAuthTokenInput {
  familyId: string;
  clientId: string;
  userId: string;
  accessTokenHash: string;
  refreshTokenHash: string;
  scopes: readonly string[];
  resource: string | null;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
}

export async function insertOAuthToken(db: Database, input: OAuthTokenInput): Promise<OAuthTokenRow> {
  const [row] = await db
    .insert(oauthTokens)
    .values({
      familyId: input.familyId,
      clientId: input.clientId,
      userId: input.userId,
      accessTokenHash: input.accessTokenHash,
      refreshTokenHash: input.refreshTokenHash,
      scopes: [...input.scopes],
      resource: input.resource,
      accessExpiresAt: input.accessExpiresAt,
      refreshExpiresAt: input.refreshExpiresAt,
    })
    .returning();
  if (!row) throw new Error('Falha ao emitir token OAuth.');
  return row;
}

export async function getOAuthTokenByAccess(
  db: Database,
  accessTokenHash: string,
): Promise<OAuthTokenRow | undefined> {
  const [row] = await db
    .select()
    .from(oauthTokens)
    .where(eq(oauthTokens.accessTokenHash, accessTokenHash));
  return row;
}

export async function getOAuthTokenByRefresh(
  db: Database,
  refreshTokenHash: string,
): Promise<OAuthTokenRow | undefined> {
  const [row] = await db
    .select()
    .from(oauthTokens)
    .where(eq(oauthTokens.refreshTokenHash, refreshTokenHash));
  return row;
}

/** Revoga o token trocado e emite o próximo da mesma corrente, numa transação. */
export async function rotateOAuthToken(
  db: Database,
  consumedId: string,
  next: OAuthTokenInput,
): Promise<OAuthTokenRow> {
  return db.transaction(async (tx) => {
    const [revoked] = await tx
      .update(oauthTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(oauthTokens.id, consumedId), isNull(oauthTokens.revokedAt)))
      .returning({ id: oauthTokens.id });
    if (!revoked) throw new Error('Refresh token já usado.');

    const [row] = await tx
      .insert(oauthTokens)
      .values({
        familyId: next.familyId,
        clientId: next.clientId,
        userId: next.userId,
        accessTokenHash: next.accessTokenHash,
        refreshTokenHash: next.refreshTokenHash,
        scopes: [...next.scopes],
        resource: next.resource,
        accessExpiresAt: next.accessExpiresAt,
        refreshExpiresAt: next.refreshExpiresAt,
      })
      .returning();
    if (!row) throw new Error('Falha ao rotacionar token OAuth.');
    return row;
  });
}

/**
 * Replay de refresh token derruba a corrente inteira: quem tem o token roubado
 * e quem o usa de verdade perdem acesso, e o dono reconecta.
 */
export async function revokeOAuthTokenFamily(db: Database, familyId: string): Promise<number> {
  const rows = await db
    .update(oauthTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(oauthTokens.familyId, familyId), isNull(oauthTokens.revokedAt)))
    .returning({ id: oauthTokens.id });
  return rows.length;
}

export async function revokeOAuthTokenByHash(db: Database, tokenHash: string): Promise<boolean> {
  const rows = await db
    .update(oauthTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        or(
          eq(oauthTokens.accessTokenHash, tokenHash),
          eq(oauthTokens.refreshTokenHash, tokenHash),
        ),
        isNull(oauthTokens.revokedAt),
      ),
    )
    .returning({ id: oauthTokens.id });
  return rows.length > 0;
}

/** Limpeza preguiçosa: códigos vencidos e tokens mortos há mais de 30 dias. */
export async function pruneOAuth(db: Database): Promise<void> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  await db.delete(oauthAuthorizationCodes).where(lt(oauthAuthorizationCodes.expiresAt, cutoff));
  await db
    .delete(oauthTokens)
    .where(
      and(
        lt(oauthTokens.accessExpiresAt, cutoff),
        or(isNull(oauthTokens.refreshExpiresAt), lt(oauthTokens.refreshExpiresAt, cutoff)),
      ),
    );
}
