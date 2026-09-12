import { describe, expect, it } from 'vitest';
import { SAMPLE_LIMITS, assertMediaWithinLimits } from '../src/sampler.js';

/**
 * A9: a API recusa cedo o que o worker recusaria depois de baixar. Os tetos
 * são os mesmos, então a mensagem é a mesma nas duas pontas.
 */
describe('assertMediaWithinLimits', () => {
  it('recusa acima do teto de bytes', () => {
    expect(() => assertMediaWithinLimits({ sizeBytes: SAMPLE_LIMITS.maxBytes + 1 })).toThrow(
      /excede o limite/,
    );
  });

  it('recusa vídeo acima do teto de duração', () => {
    expect(() =>
      assertMediaWithinLimits({ sizeBytes: 1024, durationMs: SAMPLE_LIMITS.maxDurationMs + 1 }),
    ).toThrow(/excede o limite/);
  });

  it('aceita dentro dos limites e vídeo sem duração conhecida', () => {
    expect(() => assertMediaWithinLimits({ sizeBytes: 1024, durationMs: 30_000 })).not.toThrow();
    expect(() => assertMediaWithinLimits({ sizeBytes: 1024, durationMs: null })).not.toThrow();
  });
});
