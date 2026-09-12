import { describe, expect, it } from 'vitest';
import { assertAnalysisEligible, expectedAnalysisTimestamps } from '../src/services/analyses.js';

/**
 * A5: elegibilidade e identidade da análise decididas por metadado, antes de
 * baixar o original ou acordar o ffmpeg.
 */
describe('assertAnalysisEligible', () => {
  it('recusa arquivo acima do teto de bytes antes do download', () => {
    expect(() => assertAnalysisEligible({ sizeBytes: 50 * 1024 * 1024 + 1 })).toThrow(/excede o limite/);
  });

  it('recusa vídeo acima do teto de duração', () => {
    expect(() => assertAnalysisEligible({ sizeBytes: 1024, durationMs: 61_000 })).toThrow(/excede o limite/);
  });

  it('aceita dentro dos limites e vídeo sem duração conhecida', () => {
    expect(() => assertAnalysisEligible({ sizeBytes: 1024, durationMs: 30_000 })).not.toThrow();
    expect(() => assertAnalysisEligible({ sizeBytes: 1024, durationMs: null })).not.toThrow();
  });
});

describe('expectedAnalysisTimestamps', () => {
  it('imagem estática observa um frame em t=0', () => {
    expect(expectedAnalysisTimestamps({ kind: 'image', durationMs: null })).toEqual([0]);
  });

  it('vídeo com duração conhecida dá a mesma grade da amostragem', () => {
    const timestamps = expectedAnalysisTimestamps({ kind: 'video', durationMs: 18_000 });
    expect(timestamps).not.toBeNull();
    expect(timestamps!.length).toBeGreaterThan(1);
    expect(timestamps).toEqual([...timestamps!].sort((a, b) => a - b));
    expect(timestamps![0]).toBe(0);
    expect(Math.max(...timestamps!)).toBeLessThan(18);
  });

  it('vídeo sem duração conhecida não tem grade previsível', () => {
    expect(expectedAnalysisTimestamps({ kind: 'video', durationMs: 0 })).toBeNull();
  });
});
