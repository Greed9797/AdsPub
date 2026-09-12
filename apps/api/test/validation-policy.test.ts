import { describe, expect, it, vi } from 'vitest';
import { POLICY_AI_CONCURRENCY } from '@adpub/config';
import {
  applyPolicyOutcome,
  classifyUniqueTexts,
  dedupeKey,
  mapLimited,
} from '../src/services/validation.js';
import type { ApiDeps } from '../src/lib/deps.js';

const baseValidation = { errors: [], warnings: [], policy: [] };

/** A10: lote grande não abre uma chamada por item nem serializa tudo. */
describe('mapLimited', () => {
  it('nunca passa do teto pedido e preserva a ordem do resultado', async () => {
    let inFlight = 0;
    let peak = 0;
    // Portão compartilhado: os três primeiros entram e param. Sem timer — a
    // espera é pela condição, não por um tempo chutado.
    const { promise: gate, resolve: release } = Promise.withResolvers<void>();
    const running = mapLimited([1, 2, 3, 4, 5, 6, 7], 3, async (item) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await gate;
      inFlight -= 1;
      return item * 2;
    });

    await vi.waitFor(() => expect(inFlight).toBe(3));
    release();
    expect(await running).toEqual([2, 4, 6, 8, 10, 12, 14]);
    expect(peak).toBe(3);
  });

  it('lista vazia devolve lista vazia', async () => {
    expect(await mapLimited([], 3, async (item) => item)).toEqual([]);
  });
});

describe('dedupeKey', () => {
  it('espaço e quebra de linha não fazem texto diferente', () => {
    expect(dedupeKey(`  mesmo   texto${'\n'}`)).toBe('mesmo texto');
  });
});

describe('classifyUniqueTexts', () => {
  const deps = (classifyPolicy: ReturnType<typeof vi.fn>) =>
    ({ ai: { classifyPolicy } }) as unknown as ApiDeps;

  it('classifica uma vez cada texto distinto, mesmo repetido no lote', async () => {
    const classifyPolicy = vi.fn(async () => ({ issues: [] }));
    const outcome = await classifyUniqueTexts(
      deps(classifyPolicy),
      ['copy repetida', 'copy repetida ', 'outra copy'],
      { forbiddenTerms: [], clientId: 'cliente', batchId: 'lote' },
    );
    expect(classifyPolicy).toHaveBeenCalledTimes(2);
    expect(outcome.get('copy repetida')).toEqual({ issues: [] });
    expect(outcome.get('outra copy')).toEqual({ issues: [] });
  });

  it('indisponibilidade fica registrada em vez de virar "sem achado"', async () => {
    const classifyPolicy = vi.fn(async () => {
      throw new Error('provedor fora');
    });
    const outcome = await classifyUniqueTexts(deps(classifyPolicy), ['texto'], {
      forbiddenTerms: [],
      clientId: 'cliente',
      batchId: 'lote',
    });
    expect(outcome.get('texto')).toEqual({ unavailable: true });
  });

  it('não estoura o teto de chamadas simultâneas', async () => {
    let inFlight = 0;
    let peak = 0;
    const classifyPolicy = vi.fn(async ({ text }: { text?: string } = {}) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      void text;
      return { issues: [] };
    });
    const texts = Array.from({ length: 12 }, (_, index) => `copy ${index}`);
    await classifyUniqueTexts(deps(classifyPolicy), texts, {
      forbiddenTerms: [],
      clientId: 'cliente',
      batchId: 'lote',
    });
    expect(classifyPolicy).toHaveBeenCalledTimes(12);
    expect(peak).toBeLessThanOrEqual(POLICY_AI_CONCURRENCY);
  });

  it('sem IA configurada não classifica nada', async () => {
    const outcome = await classifyUniqueTexts({} as ApiDeps, ['texto'], {
      forbiddenTerms: [],
      clientId: 'cliente',
      batchId: 'lote',
    });
    expect(outcome.size).toBe(0);
  });
});

describe('applyPolicyOutcome', () => {
  const issue = (severity: 'info' | 'warning' | 'error') => ({
    category: 'saude',
    excerpt: 'sem dor',
    severity,
    source: 'ai' as const,
  });

  it('modo block transforma aviso em erro; info não vira nada', () => {
    const validation = applyPolicyOutcome(
      baseValidation,
      { issues: [issue('warning'), issue('info')] },
      { policyMode: 'block' },
    );
    expect(validation.errors).toHaveLength(1);
    expect(validation.warnings).toHaveLength(0);
    expect(validation.policy).toHaveLength(2);
  });

  it('modo warn mantém aviso como aviso', () => {
    const validation = applyPolicyOutcome(
      baseValidation,
      { issues: [issue('warning')] },
      { policyMode: 'warn' },
    );
    expect(validation.errors).toHaveLength(0);
    expect(validation.warnings[0]!.code).toBe('policy.ai.saude');
  });

  it('bloqueia o item quando o classificador cai em modo block', () => {
    const validation = applyPolicyOutcome(baseValidation, { unavailable: true }, { policyMode: 'block' });
    expect(validation.errors[0]!.code).toBe('policy.ai_unavailable');
    expect(validation.errors[0]!.message).toContain('revisão humana');
  });

  it('em modo warn, indisponibilidade é aviso', () => {
    const validation = applyPolicyOutcome(baseValidation, { unavailable: true }, { policyMode: 'warn' });
    expect(validation.warnings[0]!.code).toBe('policy.ai_unavailable');
    expect(validation.errors).toHaveLength(0);
  });

  it('sem resultado para o texto, validação segue intacta', () => {
    expect(applyPolicyOutcome(baseValidation, undefined, { policyMode: 'block' })).toBe(baseValidation);
  });
});
