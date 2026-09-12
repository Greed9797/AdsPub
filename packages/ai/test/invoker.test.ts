import { describe, expect, it } from 'vitest';
import { AI_MAX_TOKENS_BY_PURPOSE } from '@adpub/config';
import { assertResponseComplete, maxTokensFor } from '../src/invoker.js';

/**
 * Frente 6: teto de saída por finalidade e truncamento explícito. Limite baixo
 * demais precisa falhar dizendo isso, não como "schema inesperado".
 */
describe('maxTokensFor', () => {
  it('usa o teto da finalidade quando o pedido não define', () => {
    expect(maxTokensFor({ purpose: 'policy' })).toBe(AI_MAX_TOKENS_BY_PURPOSE.policy);
    expect(maxTokensFor({ purpose: 'plan' })).toBe(AI_MAX_TOKENS_BY_PURPOSE.plan);
    expect(maxTokensFor({})).toBe(AI_MAX_TOKENS_BY_PURPOSE.unknown);
  });

  it('respeita teto explícito do pedido', () => {
    expect(maxTokensFor({ purpose: 'policy', maxTokens: 500 })).toBe(500);
  });
});

describe('assertResponseComplete', () => {
  it('recusa resposta cortada pelo limite, nomeando a finalidade', () => {
    expect(() =>
      assertResponseComplete({
        stopReason: 'max_tokens',
        outputTokens: 2048,
        maxTokens: 2048,
        purpose: 'policy',
      }),
    ).toThrow(/truncada no limite de 2048 tokens \(finalidade policy/);
  });

  it('aceita resposta terminada normalmente', () => {
    expect(() =>
      assertResponseComplete({ stopReason: 'tool_use', outputTokens: 120, maxTokens: 2048 }),
    ).not.toThrow();
    expect(() =>
      assertResponseComplete({ stopReason: null, outputTokens: 1, maxTokens: 2048 }),
    ).not.toThrow();
  });
});
