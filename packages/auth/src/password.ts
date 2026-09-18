import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Auth nativa por e-mail + senha (substitui o login Google).
 *
 * - scrypt (`node:crypto`, zero deps) com salt por usuário;
 * - comparação em tempo constante;
 * - mensagem de falha única e genérica (sem enumeração);
 * - `AUTH_ALLOWED_DOMAIN` continua valendo para todo usuário.
 */

/** Tamanho mínimo aceito ao definir uma senha. */
export const PASSWORD_MIN_LENGTH = 12;

/** Única mensagem de falha do login: vale para desconhecido, inativo e senha errada. */
export const LOGIN_FAILED_MESSAGE = 'E-mail ou senha inválidos.';

const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

/** US6 cenário 3: e-mail fora do domínio corporativo não entra. */
export function isAllowedDomain(email: string, allowedDomain: string): boolean {
  const domain = allowedDomain.trim().toLowerCase().replace(/^@/, '');
  if (!domain) return false;
  return email.toLowerCase().endsWith(`@${domain}`);
}

/** Gera `scrypt$N$r$p$sal$hash` com salt aleatório por usuário. */
export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES);
  const hash = scryptSync(password, salt, KEY_LENGTH, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/** Confere a senha em tempo constante; formato irreconhecível é só `false`. */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltHex, hashHex] = parts as [string, string, string, string, string, string];
  const cost = { N: Number(n), r: Number(r), p: Number(p) };
  if (!Number.isInteger(cost.N) || !Number.isInteger(cost.r) || !Number.isInteger(cost.p)) {
    return false;
  }
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltHex, 'hex');
    expected = Buffer.from(hashHex, 'hex');
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;
  let actual: Buffer;
  try {
    actual = scryptSync(password, salt, expected.length, cost);
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
