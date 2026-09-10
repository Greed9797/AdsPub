import { describe, expect, it } from 'vitest';
import { BRIEFING_TEMPLATE_VERSION, buildTestBriefing } from '../src/services/test-briefing.js';

/** T-008-1: briefing determinístico carrega variável, constantes e métrica. */
describe('buildTestBriefing', () => {
  it('monta briefing completo e versionado', () => {
    const briefing = buildTestBriefing({
      hypothesis: 'close esclarece o benefício',
      variable: 'abertura',
      keeps: ['oferta', 'duração'],
      goal: 'baixar CPA',
      metric: 'cpa',
      preconditions: ['ativar fora'],
    });
    expect(briefing).toContain('abertura');
    expect(briefing).toContain('oferta, duração');
    expect(briefing).toContain('cpa');
    expect(briefing).toContain(BRIEFING_TEMPLATE_VERSION);
    expect(briefing).toContain('Orçamento e público');
  });
});
