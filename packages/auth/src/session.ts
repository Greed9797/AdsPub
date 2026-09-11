import { SignJWT, jwtVerify } from 'jose';
import { sessionUserSchema, type SessionUser } from '@adpub/shared';

const ISSUER = 'adpub-web';
const AUDIENCE = 'adpub-api';

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

/** A UI (BFF) assina; a API valida. Nenhum token da Meta trafega aqui. */
export async function mintSessionToken(
  user: SessionUser,
  secret: string,
  ttlSeconds = 8 * 60 * 60,
): Promise<string> {
  return new SignJWT({ email: user.email, name: user.name, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(key(secret));
}

export async function verifySessionToken(token: string, secret: string): Promise<SessionUser> {
  const { payload } = await jwtVerify(token, key(secret), {
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  return sessionUserSchema.parse({
    id: payload.sub,
    email: payload.email,
    name: payload.name ?? '',
    role: payload.role,
  });
}

/** Cookie da sessão do navegador (assinado do mesmo jeito). */
export const SESSION_COOKIE = 'adpub_session';
export const OAUTH_STATE_COOKIE = 'adpub_oauth';
/** Para onde voltar depois do login (ex.: a tela de consentimento do MCP). */
export const NEXT_COOKIE = 'adpub_next';

/**
 * Caminho interno de retorno pós-login, ou `undefined` quando não é seguro.
 * Só aceita caminho absoluto do próprio site: `//host` e URLs completas caem
 * fora, senão o login viraria redirecionamento aberto.
 */
export function safeNextPath(value: string | null | undefined): string | undefined {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return undefined;
  return value;
}
