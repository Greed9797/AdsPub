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
