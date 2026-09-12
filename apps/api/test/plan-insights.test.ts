import { describe, expect, it } from 'vitest';
import { insightsByAsset, learningRefs } from '../src/services/batch-plan.js';

const analysis = (over: Partial<Parameters<typeof insightsByAsset>[0][number]> = {}) => ({
  assetId: 'asset-1',
  revision: 1,
  createdAt: new Date('2026-09-01T12:00:00Z'),
  findings: {
    observations: [{ texto: 'casaco verde sobre fundo claro' }, { texto: '  ' }],
    limitations: ['sem áudio analisado'],
  },
  coverage: { transcript: 'unavailable' },
  ...over,
});

/** A1: o plano recebe o que foi observado, com origem e limites. */
describe('insightsByAsset', () => {
  it('converte observações em texto, descartando vazias', () => {
    const insights = insightsByAsset([analysis()]);
    const insight = insights.get('asset-1');
    expect(insight).toBeDefined();
    expect(insight!.observations).toEqual(['casaco verde sobre fundo claro']);
    expect(insight!.limitations).toEqual(['sem áudio analisado']);
    expect(insight!.analyzed_at).toBe('2026-09-01');
    expect(insight!.transcript).toBe('unavailable');
  });

  it('entre múltiplas análises não substituídas, fica a de maior revisão', () => {
    const insights = insightsByAsset([
      analysis({ revision: 1, findings: { observations: [{ texto: 'antiga' }] } }),
      analysis({
        revision: 3,
        createdAt: new Date('2026-09-05T12:00:00Z'),
        findings: { observations: [{ texto: 'corrigida por pessoa' }] },
      }),
    ]);
    expect(insights.get('asset-1')!.revision).toBe(3);
    expect(insights.get('asset-1')!.observations).toEqual(['corrigida por pessoa']);
  });

  it('análise sem observação não vira insight (a ausência é dita no contexto)', () => {
    const insights = insightsByAsset([analysis({ findings: { observations: [] } })]);
    expect(insights.size).toBe(0);
  });

  it('não mistura criativos diferentes', () => {
    const insights = insightsByAsset([
      analysis(),
      analysis({ assetId: 'asset-2', findings: { observations: [{ texto: 'outro criativo' }] } }),
    ]);
    expect(insights.get('asset-2')!.observations).toEqual(['outro criativo']);
    expect(insights.size).toBe(2);
  });
});

/** A12: aprendizado entra por força de evidência e preserva limitações. */
describe('learningRefs', () => {
  const row = (level: string, hypothesis: string) => ({
    hypothesis,
    evidenceLevel: level,
    limitations: ['amostra pequena'],
    outcome: null,
  });

  it('ordena do mais forte para o mais fraco e mantém o nível junto', () => {
    const refs = learningRefs([
      row('hypothesis', 'hipótese solta'),
      row('controlled_test', 'teste controlado'),
      row('consistent_observation', 'observação repetida'),
    ]);
    expect(refs.map((ref) => ref.evidence_level)).toEqual([
      'controlled_test',
      'consistent_observation',
      'hypothesis',
    ]);
    expect(refs[0]!.limitations).toEqual(['amostra pequena']);
  });

  it('resultado negativo permanece no contexto', () => {
    const refs = learningRefs([{ ...row('controlled_test', 'gancho com preço'), outcome: 'CPA subiu 8%' }]);
    expect(refs[0]!.outcome).toBe('CPA subiu 8%');
  });
});
