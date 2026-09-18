import { describe, expect, it } from 'vitest';
import { assertPlanStructure, type ItemRefs } from '../src/services/batch-plan.js';
import type { BatchContext } from '../src/services/batch-context.js';

/** Só campanhas/conjuntos importam aqui: conta e cliente não entram na regra. */
function ctxWith(input: {
  campaigns?: BatchContext['campaigns'];
  adsets?: BatchContext['adsets'];
}): BatchContext {
  return {
    account: {} as BatchContext['account'],
    client: {} as BatchContext['client'],
    eligiblePageIds: [],
    campaigns: input.campaigns ?? [],
    adsets: input.adsets ?? [],
  };
}

const novo: ItemRefs = {
  campaign_ref: { kind: 'new', key: 'c1' },
  adset_ref: { kind: 'new', key: 'a1' },
};
const existente: ItemRefs = {
  campaign_ref: { kind: 'existing', id: '120000000000001' },
  adset_ref: { kind: 'existing', id: '120000000000002' },
};

/** FR-021/Etapa 2: estrutura do item é cobrada na entrada, não na fila. */
describe('assertPlanStructure', () => {
  const contaCheia = ctxWith({
    campaigns: [{ id: '120000000000001', name: 'Vendas' }],
    adsets: [{ id: '120000000000002', name: 'Advantage+', campaign_id: '120000000000001' }],
  });

  it('aceita ref nova com especificação e ref existente da conta', () => {
    expect(() =>
      assertPlanStructure(
        {
          campaigns: [{ key: 'c1' }],
          adsets: [{ key: 'a1', campaign_key: 'c1' }],
          items: [novo, existente],
        },
        contaCheia,
      ),
    ).not.toThrow();
  });

  it('recusa ref nova sem especificação apontando a chave órfã', () => {
    expect(() => assertPlanStructure({ campaigns: [{ key: 'c1' }], items: [novo] }, contaCheia)).toThrow(
      /a1/,
    );
    expect(() =>
      assertPlanStructure({ adsets: [{ key: 'a1' }], items: [novo] }, contaCheia),
    ).toThrow(/c1/);
  });

  it('recusa conjunto novo que aponta campanha inexistente no plano', () => {
    expect(() =>
      assertPlanStructure(
        { campaigns: [], adsets: [{ key: 'a1', campaign_key: 'c9' }], items: [] },
        contaCheia,
      ),
    ).toThrow(/c9/);
  });

  it('recusa ref existente que não é da conta', () => {
    expect(() =>
      assertPlanStructure(
        { items: [{ ...existente, campaign_ref: { kind: 'existing', id: '999' } }] },
        contaCheia,
      ),
    ).toThrow(/999/);
  });

  it('cache vazio não bloqueia: sem sync não há o que julgar', () => {
    expect(() => assertPlanStructure({ items: [existente] }, ctxWith({}))).not.toThrow();
  });
});
