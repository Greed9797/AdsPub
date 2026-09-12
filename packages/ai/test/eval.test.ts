import { describe, expect, it } from 'vitest';
import { checkPlan, type EvalCase } from '../src/eval.js';
import type { BatchPlan } from '@adpub/shared';

const testCase: EvalCase = {
  id: 'caso-1',
  title: 'Inverno com cupom',
  briefing: 'Vendas no site, 20% OFF, cupom INVERNO20.',
  copiesPerCreative: 2,
  forbiddenTerms: ['garantido', 'cura'],
  requiredMentions: ['20%'],
  maxHeadlineChars: 30,
  expectedFormat: 'single_image',
};

function plan(items: BatchPlan['items']): BatchPlan {
  return { items, notes: [] } as unknown as BatchPlan;
}

function item(copies: Array<{ primary_text: string; headline: string; description?: string }>) {
  return {
    format: 'single_image',
    asset_ids: ['11111111-1111-4111-8111-111111111111'],
    copies: copies.map((copy) => ({ ...copy, cta: 'SHOP_NOW', link: 'https://loja.com.br' })),
  } as unknown as BatchPlan['items'][number];
}

describe('checkPlan', () => {
  it('aprova plano que cumpre o briefing', () => {
    const result = checkPlan(
      plan([
        item([
          { primary_text: '20% OFF na coleção de inverno', headline: 'Inverno com 20% OFF' },
          { primary_text: 'Chegou o inverno: 20% OFF', headline: 'Cupom INVERNO20' },
        ]),
      ]),
      testCase,
    );
    expect(result).toEqual([]);
  });

  it('acusa termo proibido no texto', () => {
    const result = checkPlan(
      plan([item([{ primary_text: 'Resultado garantido!', headline: 'Inverno' }])]),
      testCase,
    );
    expect(result.map((v) => v.code)).toContain('plan.forbidden_term');
  });

  it('acusa oferta que não apareceu', () => {
    const result = checkPlan(
      plan([
        item([
          { primary_text: 'Coleção nova', headline: 'Inverno' },
          { primary_text: 'Coleção nova', headline: 'Inverno' },
        ]),
      ]),
      testCase,
    );
    expect(result.map((v) => v.code)).toContain('plan.missing_mention');
  });

  it('acusa contagem de copies diferente do pedido', () => {
    const result = checkPlan(plan([item([{ primary_text: '20% OFF', headline: 'Inverno' }])]), testCase);
    const codes = result.map((v) => v.code);
    expect(codes).toContain('plan.copies_per_creative');
    expect(codes).not.toContain('plan.missing_mention');
  });

  it('acusa título acima do teto e formato errado', () => {
    const longPlan = plan([
      item([
        { primary_text: '20% OFF', headline: 'Título absurdamente longo para o feed' },
        { primary_text: '20% OFF', headline: 'Ok' },
      ]),
    ]);
    longPlan.items[0]!.format = 'carousel';
    const codes = checkPlan(longPlan, testCase).map((v) => v.code);
    expect(codes).toContain('plan.headline_too_long');
    expect(codes).toContain('plan.format');
  });

  it('plano vazio é violação, não aprovação', () => {
    expect(checkPlan(plan([]), testCase)).toEqual([
      { code: 'plan.empty', detail: 'Plano sem itens.' },
    ]);
  });
});
