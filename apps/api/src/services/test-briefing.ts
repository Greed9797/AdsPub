/** T-008-1: briefing determinístico de teste. Template versionado, sem IA. */
export const BRIEFING_TEMPLATE_VERSION = 'briefing_template.v1';

export interface BriefingInput {
  hypothesis: string;
  variable: string;
  keeps: string[];
  goal: string;
  metric: string;
  preconditions: string[];
}

export function buildTestBriefing(input: BriefingInput): string {
  const keeps = input.keeps.length > 0 ? input.keeps.join(', ') : 'demais elementos';
  const pres = input.preconditions.length > 0 ? `\nPré-condições: ${input.preconditions.join('; ')}.` : '';
  return [
    `Teste criativo (${BRIEFING_TEMPLATE_VERSION}).`,
    `Hipótese: ${input.hypothesis}`,
    `Variável a testar: ${input.variable}.`,
    `Manter constante: ${keeps}.`,
    `Objetivo: ${input.goal}. Métrica primária: ${input.metric}.${pres}`,
    'Orçamento e público quem define é o gestor, fora deste rascunho.',
  ].join('\n');
}
