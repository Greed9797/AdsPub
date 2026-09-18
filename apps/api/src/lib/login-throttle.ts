import type { Redis } from 'ioredis';
import type { LoginThrottle } from './deps.js';

/**
 * Throttle de login por e-mail + IP no Redis: N falhas na janela → 429.
 * Fail-closed: qualquer erro do Redis lança, e a rota responde 429.
 */
export const LOGIN_MAX_FAILURES = 10;
export const LOGIN_WINDOW_SECONDS = 10 * 60;

export function redisLoginThrottle(redis: Redis): LoginThrottle {
  return {
    async failures(key: string): Promise<number> {
      const raw = await redis.get(key);
      return raw ? Number(raw) || 0 : 0;
    },
    async registerFailure(key: string, windowSeconds: number): Promise<number> {
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, windowSeconds);
      return count;
    },
    async clear(key: string): Promise<void> {
      await redis.del(key);
    },
  };
}

/** Throttle em memória (testes e harnesses sem Redis). Mesma semântica, sem rede. */
export function memoryLoginThrottle(): LoginThrottle {
  const counts = new Map<string, { count: number; expiresAt: number }>();
  return {
    async failures(key: string): Promise<number> {
      const entry = counts.get(key);
      if (!entry || entry.expiresAt <= Date.now()) return 0;
      return entry.count;
    },
    async registerFailure(key: string, windowSeconds: number): Promise<number> {
      const current = await this.failures(key);
      const count = current + 1;
      counts.set(key, { count, expiresAt: Date.now() + windowSeconds * 1000 });
      return count;
    },
    async clear(key: string): Promise<void> {
      counts.delete(key);
    },
  };
}

/** Chave do throttle: e-mail normalizado + IP. */
export function loginThrottleKey(email: string, ip: string): string {
  return `pwlogin:${email.toLowerCase()}:${ip || 'unknown'}`;
}
