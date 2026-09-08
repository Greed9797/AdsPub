import { describe, expect, it, vi } from 'vitest';
import { AiClient } from '../src/client.js';
import { AiSchemaError, normalizePlan } from '../src/normalize.js';
import { renderPlanContext, type PlanContext } from '../src/context.js';
import { loadPrompt, PROMPT_VERSIONS } from '../src/prompts.js';
import type { AiInvoker } from '../src/invoker.js';

const IMG = '11111111-1111-4111-8111-111111111111';
const VID = '22222222-2222-4222-8222-222222222222';

const ctx = (over: Partial<PlanContext> = {}): PlanContext => ({
  briefing: 'Oferta de inverno 20% OFF até sexta. Link https://lojateste.com.br/inverno',
  copiesPerCreative: 3,
  account: {
    id: 'act_1',
    name: 'Loja Teste',
    currency: 'BRL',
    timezone: 'America/Sao_Paulo',
    default_page_id: '100',
    default_ig_user_id: '200',
    default_pixel_id: '300',
  },
  client: {
    name: 'Loja Teste',
    voice_profile: {
      tone: 'direto',
      audience: 'mulheres 25-45',
      forbidden_terms: ['barato'],
      allowed_claims: [],
      examples: ['Inverno com 20% OFF'],
    },
    naming_template: '{cliente}_{v}',
    default_utm: { utm_source: 'facebook' },
    landing_domains: ['lojateste.com.br'],
  },
  assets: [
    { id: IMG, filename: 'a.jpg', kind: 'image', aspect_ratio: '4:5' },
    { id: VID, filename: 'v.mp4', kind: 'video', aspect_ratio: '9:16', duration_ms: 20_000 },
  ],
  campaigns: [{ id: '23800001', name: 'campanha existente', objective: 'OUTCOME_SALES' }],
  adsets: [{ id: '23800002', name: 'conjunto existente', campaign_id: '23800001' }],
  ...over,
});

const validPlan = () => ({
  campaigns: [
    {
      key: 'inverno',
      name: 'loja_inverno',
      objective: 'OUTCOME_SALES',
      buying_type: 'AUCTION',
      special_ad_categories: [],
    },
  ],
  adsets: [
    {
      key: 'frio',
      name: 'frio-advantage',
      optimization_goal: 'OFFSITE_CONVERSIONS',
      billing_event: 'IMPRESSIONS',
      advantage_audience: true,
      campaign_key: 'inverno',
    },
  ],
  items: [
    {
      format: 'single_image',
      asset_ids: [IMG],
      campaign_ref: { kind: 'new', key: 'inverno' },
      adset_ref: { kind: 'new', key: 'frio' },
      copies: [
        {
          primary_text: 'Inverno com 20% OFF até sexta.',
          headline: 'Inverno em oferta',
          description: 'Frete grátis',
          cta: 'SHOP_NOW',
          link: 'https://lojateste.com.br/inverno',
        },
      ],
    },
  ],
  pending: [],
  notes: '',
});

const invoker = (input: unknown): AiInvoker =>
  vi.fn(async () => ({ input, inputTokens: 1200, outputTokens: 800 }));

describe('normalizePlan', () => {
  it('aceita plano válido', () => {
    const { plan, dropped } = normalizePlan(validPlan(), ctx());
    expect(plan.items).toHaveLength(1);
    expect(dropped).toEqual([]);
    expect(plan.pending).toEqual([]);
  });

  it('rejeita resposta fora do schema', () => {
    expect(() => normalizePlan({ items: 'não é lista' }, ctx())).toThrow(AiSchemaError);
  });

  it('rejeita objetivo legado no schema da campanha', () => {
    const raw = validPlan();
    raw.campaigns[0]!.objective = 'CONVERSIONS';
    expect(() => normalizePlan(raw, ctx())).toThrow(AiSchemaError);
  });

  it('descarta item com criativo inexistente e registra pendência', () => {
    const raw = validPlan();
    raw.items[0]!.asset_ids = ['33333333-3333-4333-8333-333333333333'];
    const { plan, dropped } = normalizePlan(raw, ctx());
    expect(plan.items).toHaveLength(0);
    expect(dropped[0]).toMatch(/criativo inexistente/);
    expect(plan.pending.map((p) => p.field)).toContain('asset_ids');
  });

  it('link ausente vira pendência sem inventar URL', () => {
    const raw = validPlan();
    raw.items[0]!.copies[0]!.link = '';
    const { plan } = normalizePlan(raw, ctx());
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]!.copies[0]!.link).toBe('');
    expect(plan.pending.find((p) => p.field === 'copy.link')?.reason).toMatch(/link/i);
  });

  it('campanha existente fora do cache é rejeitada', () => {
    const raw = validPlan();
    raw.items[0]!.campaign_ref = { kind: 'existing', id: '999' } as never;
    const { plan } = normalizePlan(raw, ctx());
    expect(plan.items).toHaveLength(0);
    expect(plan.pending.map((p) => p.field)).toContain('campaign_ref');
  });

  it('aceita campanha e conjunto existentes do cache', () => {
    const raw = validPlan();
    raw.items[0]!.campaign_ref = { kind: 'existing', id: '23800001' } as never;
    raw.items[0]!.adset_ref = { kind: 'existing', id: '23800002' } as never;
    const { plan } = normalizePlan(raw, ctx());
    expect(plan.items).toHaveLength(1);
  });

  it('conjunto novo sem spec é rejeitado', () => {
    const raw = validPlan();
    raw.items[0]!.adset_ref = { kind: 'new', key: 'inexistente' };
    const { plan } = normalizePlan(raw, ctx());
    expect(plan.items).toHaveLength(0);
    expect(plan.pending.map((p) => p.field)).toContain('adset_ref');
  });

  it('plano sem item aproveitável registra pendência de items', () => {
    const raw = validPlan();
    raw.items[0]!.asset_ids = ['33333333-3333-4333-8333-333333333333'];
    const { plan } = normalizePlan(raw, ctx());
    expect(plan.pending.map((p) => p.field)).toContain('items');
  });

  it('não duplica pendências iguais', () => {
    const raw = validPlan();
    raw.items[0]!.copies = [
      { ...raw.items[0]!.copies[0]!, link: '' },
      { ...raw.items[0]!.copies[0]!, link: '' },
    ];
    const { plan } = normalizePlan(raw, ctx());
    expect(plan.pending.filter((p) => p.field === 'copy.link')).toHaveLength(1);
  });
});

describe('renderPlanContext', () => {
  it('lista criativos, campanhas e termos proibidos', () => {
    const rendered = renderPlanContext(ctx());
    expect(rendered).toContain(IMG);
    expect(rendered).toContain('23800001');
    expect(rendered).toContain('barato');
    expect(rendered).toContain('copies_per_creative: 3');
  });

  it('avisa quando o briefing está vazio', () => {
    expect(renderPlanContext(ctx({ briefing: '   ' }))).toContain('briefing vazio');
  });
});

describe('AiClient.generatePlan', () => {
  it('força tool use com o schema do BatchPlan e devolve custo', async () => {
    const invoke = invoker(validPlan());
    const client = new AiClient({
      invoke,
      models: { generation: 'claude-sonnet-4-6', classify: 'claude-haiku-4-6' },
    });
    const { plan, meta } = await client.generatePlan(ctx());
    expect(plan.items).toHaveLength(1);
    expect(meta.promptVersion).toBe(PROMPT_VERSIONS.plan);
    expect(meta.cached).toBe(false);
    expect(meta.costUsd).toBeCloseTo((1200 * 3 + 800 * 15) / 1_000_000, 9);

    const request = (invoke as unknown as { mock: { calls: [Record<string, unknown>][] } }).mock
      .calls[0]![0];
    expect(request.toolName).toBe('submit_batch_plan');
    expect((request.inputSchema as Record<string, unknown>).type).toBe('object');
    expect(String(request.system)).toContain('submit_batch_plan');
  });

  it('usa o cache quando o hash de entrada repete', async () => {
    const invoke = invoker(validPlan());
    const store = new Map<string, Record<string, unknown>>();
    const cache = {
      find: async (purpose: string, version: string, hash: string) => {
        const found = store.get(`${purpose}|${version}|${hash}`);
        return found ? { output: found } : undefined;
      },
      save: async (input: { purpose: string; promptVersion: string; inputHash: string; output: Record<string, unknown> }) => {
        store.set(`${input.purpose}|${input.promptVersion}|${input.inputHash}`, input.output);
      },
    };
    const client = new AiClient({
      invoke,
      models: { generation: 'claude-sonnet-4-6', classify: 'claude-haiku-4-6' },
      cache,
    });
    await client.generatePlan(ctx());
    const second = await client.generatePlan(ctx());
    expect(second.meta.cached).toBe(true);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('propaga erro de schema quando a IA responde errado', async () => {
    const client = new AiClient({
      invoke: invoker({ foo: 'bar' }),
      models: { generation: 'g', classify: 'c' },
    });
    await expect(client.generatePlan(ctx())).rejects.toBeInstanceOf(AiSchemaError);
  });
});

describe('AiClient.generateCopies e classifyPolicy', () => {
  it('gera no máximo o número de variações pedidas', async () => {
    const copy = {
      primary_text: 'texto',
      headline: 'titulo',
      description: 'desc',
      cta: 'SHOP_NOW',
      link: 'https://lojateste.com.br',
    };
    const client = new AiClient({
      invoke: invoker({ copies: [copy, copy, copy, copy] }),
      models: { generation: 'g', classify: 'c' },
    });
    const { copies } = await client.generateCopies({
      client: { name: 'Loja', voice_profile: ctx().client.voice_profile },
      asset: ctx().assets[0]!,
      format: 'single_image',
      cta: 'SHOP_NOW',
      link: 'https://lojateste.com.br',
      url_tags: 'utm_source=facebook',
      variations: 2,
    });
    expect(copies).toHaveLength(2);
    expect(copies[0]!.url_tags).toBe('');
  });

  it('classifica política marcando a origem como ai', async () => {
    const client = new AiClient({
      invoke: invoker({
        issues: [{ category: 'promessa_de_resultado', excerpt: 'resultado garantido', severity: 'warning' }],
      }),
      models: { generation: 'g', classify: 'haiku' },
    });
    const { issues, meta } = await client.classifyPolicy('resultado garantido em 7 dias');
    expect(issues[0]!.source).toBe('ai');
    expect(meta.model).toBe('haiku');
  });

  it('rejeita classificação fora do schema', async () => {
    const client = new AiClient({
      invoke: invoker({ issues: [{ category: 'x', severity: 'muito-ruim' }] }),
      models: { generation: 'g', classify: 'c' },
    });
    await expect(client.classifyPolicy('texto')).rejects.toBeInstanceOf(AiSchemaError);
  });
});

describe('prompts versionados', () => {
  it('carrega os três prompts do disco', () => {
    expect(loadPrompt('plan')).toContain('submit_batch_plan');
    expect(loadPrompt('copy')).toContain('submit_copies');
    expect(loadPrompt('policy')).toContain('submit_policy_review');
  });
});
