import { describe, expect, it } from 'vitest';
import { expectedAnalysisTimestamps } from '../src/analysis/run.js';

/**
 * A5: a grade de instantes derivada do metadado é o que permite decidir cache
 * hit antes de baixar o original. Sem duração conhecida a grade não existe.
 */
describe('expectedAnalysisTimestamps', () => {
  it('imagem estática observa um frame em t=0', () => {
    expect(expectedAnalysisTimestamps({ kind: 'image', durationMs: null })).toEqual([0]);
  });

  it('vídeo com duração conhecida dá grade ordenada dentro do vídeo', () => {
    const timestamps = expectedAnalysisTimestamps({ kind: 'video', durationMs: 18_000 });
    expect(timestamps).not.toBeNull();
    expect(timestamps![0]).toBe(0);
    expect(timestamps!.length).toBeGreaterThan(1);
    expect(timestamps).toEqual([...timestamps!].sort((a, b) => a - b));
    expect(Math.max(...timestamps!)).toBeLessThan(18);
  });

  it('vídeo sem duração conhecida não tem grade previsível', () => {
    expect(expectedAnalysisTimestamps({ kind: 'video', durationMs: 0 })).toBeNull();
  });
});
