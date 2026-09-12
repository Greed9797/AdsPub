import type { BatchPlan } from '@adpub/shared';

/**
 * A12: avaliação offline de geração. O caso descreve o briefing e o que se
 * espera do plano; as checagens são determinísticas para que uma mudança de
 * prompt possa ser julgada com números, não com impressão.
 */
export interface EvalCase {
  id: string;
  title: string;
  briefing: string;
  copiesPerCreative: number;
  /** Termos que não podem aparecer em nenhum texto gerado. */
  forbiddenTerms: string[];
  /** Trechos que precisam aparecer em pelo menos uma copy (oferta, cupom). */
  requiredMentions: string[];
  /** Teto de caracteres do título, quando o caso exigir. */
  maxHeadlineChars?: number;
  /** Formato esperado por item, quando o caso exigir. */
  expectedFormat?: string;
}

export interface EvalViolation {
  code: string;
  detail: string;
  itemIndex?: number;
}

function textsOf(plan: BatchPlan, itemIndex: number): string[] {
  const item = plan.items[itemIndex];
  if (!item) return [];
  return item.copies.flatMap((copy) => [copy.primary_text, copy.headline, copy.description ?? '']);
}

/** Compara o plano com o esperado do caso; lista vazia = conforme. */
export function checkPlan(plan: BatchPlan, testCase: EvalCase): EvalViolation[] {
  const violations: EvalViolation[] = [];
  const items = plan.items;

  if (items.length === 0) {
    violations.push({ code: 'plan.empty', detail: 'Plano sem itens.' });
    return violations;
  }

  items.forEach((item, index) => {
    if (item.copies.length !== testCase.copiesPerCreative) {
      violations.push({
        code: 'plan.copies_per_creative',
        detail: `Item com ${item.copies.length} copies; briefing pediu ${testCase.copiesPerCreative}.`,
        itemIndex: index,
      });
    }
    if (testCase.expectedFormat && item.format !== testCase.expectedFormat) {
      violations.push({
        code: 'plan.format',
        detail: `Formato ${item.format}; esperado ${testCase.expectedFormat}.`,
        itemIndex: index,
      });
    }
  });

  const allTexts = items.flatMap((_, index) => textsOf(plan, index));
  const normalized = allTexts.map((text) => text.toLowerCase());

  for (const term of testCase.forbiddenTerms) {
    const hit = normalized.findIndex((text) => text.includes(term.toLowerCase()));
    if (hit >= 0) {
      violations.push({
        code: 'plan.forbidden_term',
        detail: `Termo proibido "${term}" apareceu: "${allTexts[hit]?.slice(0, 120)}".`,
      });
    }
  }

  for (const mention of testCase.requiredMentions) {
    if (!normalized.some((text) => text.includes(mention.toLowerCase()))) {
      violations.push({
        code: 'plan.missing_mention',
        detail: `Nenhuma copy citou "${mention}".`,
      });
    }
  }

  if (testCase.maxHeadlineChars !== undefined) {
    items.forEach((item, index) => {
      for (const copy of item.copies) {
        if (copy.headline.length > testCase.maxHeadlineChars!) {
          violations.push({
            code: 'plan.headline_too_long',
            detail: `Título com ${copy.headline.length} caracteres (teto ${testCase.maxHeadlineChars}).`,
            itemIndex: index,
          });
        }
      }
    });
  }

  return violations;
}
