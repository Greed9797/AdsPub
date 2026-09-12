import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { loadServerEnv } from '@adpub/config';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface SealedSecret {
  /** ciphertext || authTag */
  ciphertext: Buffer;
  iv: Buffer;
}

export class TokenCipher {
  private readonly key: Buffer;

  constructor(key: Buffer | string) {
    const raw = typeof key === 'string' ? Buffer.from(key, 'base64') : key;
    if (raw.length !== 32) {
      throw new Error('Chave mestra inválida: são necessários 32 bytes (base64).');
    }
    this.key = raw;
  }

  encrypt(plaintext: string): SealedSecret {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGO, this.key, iv);
    const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return { ciphertext: Buffer.concat([body, cipher.getAuthTag()]), iv };
  }

  decrypt(sealed: SealedSecret): string {
    const { ciphertext, iv } = sealed;
    if (ciphertext.length <= TAG_BYTES) throw new Error('Ciphertext corrompido.');
    const body = ciphertext.subarray(0, ciphertext.length - TAG_BYTES);
    const tag = ciphertext.subarray(ciphertext.length - TAG_BYTES);
    const decipher = createDecipheriv(ALGO, this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
  }
}

let cached: TokenCipher | undefined;

/** Cifra padrão do processo, com a chave vinda de MASTER_KEY (fora do banco). */
export function getCipher(): TokenCipher {
  if (!cached) cached = new TokenCipher(loadServerEnv().MASTER_KEY);
  return cached;
}

export function resetCipherCache(): void {
  cached = undefined;
}

/** Mascara segredos para log/auditoria (Constituição IV). */
export function mask(secret: string | null | undefined): string {
  if (!secret) return '';
  if (secret.length <= 8) return '***';
  return `${secret.slice(0, 4)}…${secret.slice(-4)} (${secret.length} chars)`;
}

const SECRET_KEYS = [
  'access_token',
  'appsecret_proof',
  'authorization',
  'token',
  'client_secret',
  'master_key',
  'anthropic_api_key',
  'secret',
  'password',
];

/** Chaves que viajam na query string da Graph API e do Google. */
const QUERY_KEYS = ['access_token', 'appsecret_proof', 'token', 'client_secret', 'refresh_token'];

/**
 * A barra fica fora da classe de propósito: mascarar sobre uma linha JSON já
 * serializada não pode consumir o `\` de um `\"` — a aspa sobraria sem escape
 * e a linha inteira deixaria de fazer `JSON.parse`.
 */
const QUERY_PATTERN = new RegExp(`((?:^|[?&])(?:${QUERY_KEYS.join('|')})=)([^&\\s"'\\\\]+)`, 'gi');

/**
 * Token de System User / usuário da Meta. A Graph API **ecoa o token dentro da
 * mensagem de erro em texto livre** ("Malformed access token EAA…"), fora de
 * qualquer `chave=valor` — daí um padrão para o formato do próprio token.
 */
const META_TOKEN_PATTERN = /EAA[A-Za-z0-9_-]{6,}/g;

/**
 * Mascara segredo dentro de texto: URL completa, query string solta, mensagem
 * de erro da Meta, stack. Mascarar por chave não alcança nada disso.
 */
export function maskText(text: string): string {
  return text.replace(QUERY_PATTERN, '$1[redacted]').replace(META_TOKEN_PATTERN, '[redacted]');
}

/** Remove segredos de objetos que vão para log/auditoria. */
export function redact<T>(value: T): T {
  return redactUnknown(value, 0) as T;
}

function redactUnknown(value: unknown, depth: number): unknown {
  if (depth > 8) return '[profundidade máxima]';
  if (typeof value === 'string') return maskText(value);
  if (Array.isArray(value)) return value.map((v) => redactUnknown(v, depth + 1));
  if (value && typeof value === 'object') {
    if (Buffer.isBuffer(value)) return `[buffer ${value.length}B]`;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEYS.includes(k.toLowerCase())) {
        out[k] = typeof v === 'string' ? mask(v) : '***';
      } else {
        out[k] = redactUnknown(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}

export function sha256Hex(input: Buffer | string): string {
  return createHash('sha256').update(input).digest('hex');
}

/** SHA-256 de um arquivo em disco, lido em pedaços (vídeo não cabe na memória). */
export async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

/** Hash estável (chaves ordenadas) para cache de IA e idempotência. */
export function stableHash(value: unknown): string {
  return sha256Hex(stableStringify(value));
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(',')}}`;
}

/**
 * Chave de idempotência determinística do item (Constituição III).
 * `hash(batch_id, position, creative_id, copy_hash)`
 */
export function idempotencyKey(input: {
  batchId: string;
  position: number;
  assetIds: readonly string[];
  copy: unknown;
}): string {
  return sha256Hex(
    stableStringify({
      b: input.batchId,
      p: input.position,
      a: [...input.assetIds],
      c: stableHash(input.copy),
    }),
  );
}

export function appsecretProof(token: string, appSecret: string): string {
  return createHmac('sha256', appSecret).update(token).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
