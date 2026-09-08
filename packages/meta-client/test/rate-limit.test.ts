import { describe, expect, it } from 'vitest';
import {
  decideConcurrency,
  pauseDurationMs,
  parseUsageHeaders,
  shouldThrottle,
} from '../src/rate-limit.js';

const headers = (init: Record<string, string>) => new Headers(init);

describe('parseUsageHeaders', () => {
  it('lê o maior percentual dos buckets de business use case', () => {
    const usage = parseUsageHeaders(
      headers({
        'x-business-use-case-usage': JSON.stringify({
          '99887766': [
            { type: 'ads_management', call_count: 40, total_cputime: 12, total_time: 80 },
          ],
        }),
      }),
    );
    expect(usage.maxPercent).toBe(80);
  });

  it('lê tempo estimado para liberar o acesso', () => {
    const usage = parseUsageHeaders(
      headers({
        'x-business-use-case-usage': JSON.stringify({
          '99887766': [{ type: 'ads_management', call_count: 100, estimated_time_to_regain_access: 12 }],
        }),
      }),
    );
    expect(usage.estimatedTimeToRegainAccessMs).toBe(12 * 60_000);
  });

  it('detecta tier a partir do header', () => {
    expect(
      parseUsageHeaders(
        headers({
          'x-ad-account-usage': JSON.stringify({
            acc_id_util_pct: 10,
            ads_api_access_tier: 'standard_access',
          }),
        }),
      ).tier,
    ).toBe('full');

    expect(
      parseUsageHeaders(
        headers({
          'x-business-use-case-usage': JSON.stringify({
            '1': [{ ads_api_access_tier: 'development_access', call_count: 1 }],
          }),
        }),
      ).tier,
    ).toBe('limited');
  });

  it('considera x-app-usage e x-ad-account-usage', () => {
    const usage = parseUsageHeaders(
      headers({
        'x-app-usage': JSON.stringify({ call_count: 20, total_time: 30, total_cputime: 5 }),
        'x-ad-account-usage': JSON.stringify({ acc_id_util_pct: 91 }),
      }),
    );
    expect(usage.maxPercent).toBe(91);
    expect(usage.raw['x-app-usage']).toBeDefined();
  });

  it('não quebra com header ausente ou inválido', () => {
    expect(parseUsageHeaders(headers({})).maxPercent).toBe(0);
    expect(parseUsageHeaders(headers({ 'x-app-usage': 'não é json' })).maxPercent).toBe(0);
  });
});

describe('decideConcurrency (R6)', () => {
  it('usa 3 no tier full e 1 no limited', () => {
    expect(decideConcurrency({ maxPercent: 10 }, 'full')).toBe(3);
    expect(decideConcurrency({ maxPercent: 10 }, 'limited')).toBe(1);
  });

  it('cai para 1 a partir de 75% de uso', () => {
    expect(decideConcurrency({ maxPercent: 74 }, 'full')).toBe(3);
    expect(decideConcurrency({ maxPercent: 75 }, 'full')).toBe(1);
    expect(shouldThrottle({ maxPercent: 75 })).toBe(true);
    expect(shouldThrottle({ maxPercent: 40 })).toBe(false);
  });
});

describe('pauseDurationMs', () => {
  it('respeita o tempo informado pela Meta', () => {
    expect(pauseDurationMs(9 * 60_000, 1)).toBe(9 * 60_000);
  });

  it('usa backoff crescente quando a Meta não informa', () => {
    expect(pauseDurationMs(undefined, 1)).toBe(60_000);
    expect(pauseDurationMs(undefined, 3)).toBe(240_000);
    expect(pauseDurationMs(undefined, 10)).toBe(30 * 60_000);
  });
});
