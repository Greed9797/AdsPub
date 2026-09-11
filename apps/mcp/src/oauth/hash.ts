import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Segredos do fluxo OAuth: nada é gravado em claro. O banco guarda só o
 * SHA-256 do código e dos tokens.
 */
export function hashSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function newSecret(prefix: string): string {
  return `${prefix}_${randomBytes(32).toString('base64url')}`;
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** PKCE S256: `base64url(sha256(verifier))`. */
export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}
