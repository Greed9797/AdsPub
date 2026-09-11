import { randomUUID } from 'node:crypto';
import { OAuthError, OAuthErrorCode, type AuthInfo } from '@modelcontextprotocol/server';
import {
  consumeAuthorizationCode,
  getOAuthClient,
  getOAuthTokenByAccess,
  getOAuthTokenByRefresh,
  insertAuthorizationCode,
  insertOAuthToken,
  registerOAuthClient,
  revokeOAuthTokenByHash,
  revokeOAuthTokenFamily,
  rotateOAuthToken,
  touchOAuthClient,
  type Database,
  type OAuthClientRow,
} from '@adpub/db';
import { hashSecret, newSecret, pkceChallenge, safeEqual } from './hash.js';
import { normalizeScopes } from './scopes.js';

/** Tempos do fluxo: código curto, acesso de 1 h, refresh de 30 dias. */
export const ACCESS_TTL_SECONDS = 60 * 60;
export const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;
export const CODE_TTL_SECONDS = 10 * 60;

/** Erro de grant que vira resposta `{error, error_description}` no /token. */
export class GrantError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'GrantError';
  }
}

export interface IssuedTokens {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  scope: string;
}

async function issueTokens(
  db: Database,
  input: {
    familyId: string;
    clientId: string;
    userId: string;
    scopes: readonly string[];
    resource: string | null;
  },
): Promise<IssuedTokens> {
  const accessToken = newSecret('adpub_mcp');
  const refreshToken = newSecret('adpub_mcp_refresh');
  const now = Date.now();

  await insertOAuthToken(db, {
    familyId: input.familyId,
    clientId: input.clientId,
    userId: input.userId,
    accessTokenHash: hashSecret(accessToken),
    refreshTokenHash: hashSecret(refreshToken),
    scopes: input.scopes,
    resource: input.resource,
    accessExpiresAt: new Date(now + ACCESS_TTL_SECONDS * 1000),
    refreshExpiresAt: new Date(now + REFRESH_TTL_SECONDS * 1000),
  });

  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TTL_SECONDS,
    refresh_token: refreshToken,
    scope: input.scopes.join(' '),
  };
}

export async function createOAuthClientRecord(
  db: Database,
  input: { clientId: string; clientName: string; redirectUris: string[]; scopes: string[] },
): Promise<OAuthClientRow> {
  return registerOAuthClient(db, {
    clientId: input.clientId,
    clientName: input.clientName,
    redirectUris: input.redirectUris,
    grantTypes: ['authorization_code', 'refresh_token'],
    responseTypes: ['code'],
    scopes: input.scopes,
  });
}

export function loadOAuthClient(db: Database, clientId: string): Promise<OAuthClientRow | undefined> {
  return getOAuthClient(db, clientId);
}

/** Grava o código já hasheado e devolve o valor que vai na URL de retorno. */
export async function issueAuthorizationCode(
  db: Database,
  input: {
    clientId: string;
    userId: string;
    redirectUri: string;
    codeChallenge: string;
    scopes: readonly string[];
    resource: string | null;
  },
): Promise<string> {
  const code = newSecret('adpub_mcp_code');
  await insertAuthorizationCode(db, {
    codeHash: hashSecret(code),
    clientId: input.clientId,
    userId: input.userId,
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    scopes: input.scopes,
    resource: input.resource,
    expiresAt: new Date(Date.now() + CODE_TTL_SECONDS * 1000),
  });
  return code;
}

export async function exchangeAuthorizationCode(
  db: Database,
  input: {
    clientId: string;
    code: string;
    redirectUri: string;
    codeVerifier: string;
    resource: string | null;
  },
): Promise<IssuedTokens> {
  if (input.codeVerifier.length < 43 || input.codeVerifier.length > 128) {
    throw new GrantError('invalid_request', 'code_verifier fora do tamanho do RFC 7636.');
  }

  const row = await consumeAuthorizationCode(db, hashSecret(input.code));
  if (!row) throw new GrantError('invalid_grant', 'Código inválido, vencido ou já usado.');
  if (row.clientId !== input.clientId) {
    throw new GrantError('invalid_grant', 'Código emitido para outro cliente.');
  }
  if (row.redirectUri !== input.redirectUri) {
    throw new GrantError('invalid_grant', 'redirect_uri diferente do usado na autorização.');
  }
  if (!safeEqual(pkceChallenge(input.codeVerifier), row.codeChallenge)) {
    throw new GrantError('invalid_grant', 'code_verifier não confere com o desafio PKCE.');
  }
  if (input.resource && row.resource && input.resource !== row.resource) {
    throw new GrantError('invalid_target', 'resource diferente do autorizado.');
  }

  await touchOAuthClient(db, row.clientId);
  return issueTokens(db, {
    familyId: randomUUID(),
    clientId: row.clientId,
    userId: row.userId,
    scopes: row.scopes,
    resource: input.resource ?? row.resource,
  });
}

export async function refreshGrant(
  db: Database,
  input: { clientId: string; refreshToken: string; scope?: string; resource: string | null },
): Promise<IssuedTokens> {
  const row = await getOAuthTokenByRefresh(db, hashSecret(input.refreshToken));
  if (!row || row.clientId !== input.clientId) {
    throw new GrantError('invalid_grant', 'Refresh token desconhecido para este cliente.');
  }
  if (row.revokedAt) {
    // Replay de um refresh já trocado: derruba a corrente inteira.
    await revokeOAuthTokenFamily(db, row.familyId);
    throw new GrantError('invalid_grant', 'Refresh token reutilizado; a conexão foi revogada.');
  }
  if (!row.refreshExpiresAt || row.refreshExpiresAt.getTime() <= Date.now()) {
    throw new GrantError('invalid_grant', 'Refresh token vencido.');
  }

  const requested = input.scope ? normalizeScopes(input.scope.split(/\s+/)) : row.scopes;
  const scopes = requested.filter((scope) => row.scopes.includes(scope));
  if (scopes.length === 0) {
    throw new GrantError('invalid_scope', 'Nenhum escopo pedido foi autorizado antes.');
  }

  const next = {
    familyId: row.familyId,
    clientId: row.clientId,
    userId: row.userId,
    scopes,
    resource: input.resource ?? row.resource,
  };
  const accessToken = newSecret('adpub_mcp');
  const refreshToken = newSecret('adpub_mcp_refresh');
  const now = Date.now();

  try {
    await rotateOAuthToken(db, row.id, {
      ...next,
      accessTokenHash: hashSecret(accessToken),
      refreshTokenHash: hashSecret(refreshToken),
      accessExpiresAt: new Date(now + ACCESS_TTL_SECONDS * 1000),
      refreshExpiresAt: new Date(now + REFRESH_TTL_SECONDS * 1000),
    });
  } catch {
    // Corrida entre duas trocas do mesmo refresh: quem perdeu recebe o mesmo erro do replay.
    await revokeOAuthTokenFamily(db, row.familyId);
    throw new GrantError('invalid_grant', 'Refresh token reutilizado; a conexão foi revogada.');
  }

  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TTL_SECONDS,
    refresh_token: refreshToken,
    scope: scopes.join(' '),
  };
}

/** Verificação do token no `/mcp`: o `AuthInfo` carrega o usuário que consentiu. */
export async function verifyAccessToken(
  db: Database,
  resourceUrl: URL,
  token: string,
): Promise<AuthInfo> {
  const row = await getOAuthTokenByAccess(db, hashSecret(token));
  if (!row || row.revokedAt || row.accessExpiresAt.getTime() <= Date.now()) {
    throw new OAuthError(OAuthErrorCode.InvalidToken, 'Token expirado, revogado ou desconhecido.');
  }
  if (row.resource && row.resource !== resourceUrl.href) {
    throw new OAuthError(OAuthErrorCode.InvalidToken, 'Token emitido para outro recurso.');
  }
  return {
    token,
    clientId: row.clientId,
    scopes: [...row.scopes],
    expiresAt: Math.floor(row.accessExpiresAt.getTime() / 1000),
    resource: resourceUrl,
    extra: { userId: row.userId },
  };
}

export function revokeToken(db: Database, token: string): Promise<boolean> {
  return revokeOAuthTokenByHash(db, hashSecret(token));
}
