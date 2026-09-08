import { describe, expect, it } from 'vitest';
import type { AdDraftInput } from '@adpub/shared';
import {
  applyAutoFields,
  statusFromValidation,
  validateCampaignSpec,
  validateItem,
  type AssetRef,
  type ValidateContext,
} from '../src/validate.js';

const IMG = '11111111-1111-4111-8111-111111111111';
const IMG2 = '22222222-2222-4222-8222-222222222222';
const VID = '33333333-3333-4333-8333-333333333333';
const BAD = '44444444-4444-4444-8444-444444444444';

const assets = new Map<string, AssetRef>([
  [IMG, { id: IMG, kind: 'image', aspect_ratio: '4:5', validation_status: 'ok', filename: 'a.jpg' }],
  [IMG2, { id: IMG2, kind: 'image', aspect_ratio: '1:1', validation_status: 'ok', filename: 'b.jpg' }],
  [VID, { id: VID, kind: 'video', aspect_ratio: '9:16', validation_status: 'ok', filename: 'v.mp4' }],
  [BAD, { id: BAD, kind: 'image', aspect_ratio: 'other', validation_status: 'rejected', filename: 'x.png' }],
]);

const ctx = (over: Partial<ValidateContext> = {}): ValidateContext => ({
  client: {
    name: 'Loja Teste',
    landing_domains: ['lojateste.com.br'],
    naming_template: '{cliente}_{objetivo}_{data:YYYYMMDD}_{criativo}_{formato}_{v}',
    default_utm: { utm_source: 'facebook', utm_medium: 'paid' },
    policy_mode: 'warn',
    forbidden_terms: ['barato'],
  },
  account: {
    id: 'act_1',
    default_page_id: '100',
    default_ig_user_id: '200',
    eligible_page_ids: ['100'],
    has_instagram: true,
  },
  assets,
  objective: 'OUTCOME_SALES',
  now: new Date('2026-09-08T00:00:00Z'),
  variant: 1,
  ...over,
});

const draft = (over: Partial<AdDraftInput> = {}): AdDraftInput => ({
  format: 'single_image',
  asset_ids: [IMG],
  copy: {
    primary_text: 'Coleção de inverno com 20% OFF até sexta.',
    headline: 'Inverno em oferta',
    description: 'Frete grátis',
    cta: 'SHOP_NOW',
    link: 'https://lojateste.com.br/inverno',
    display_link: 'lojateste.com.br',
    url_tags: 'utm_source=facebook&utm_medium=paid',
  },
  name: 'loja-teste_outcome-sales_20260908_a_single-image_1',
  campaign_ref: { kind: 'new', key: 'campanha-inverno' },
  adset_ref: { kind: 'new', key: 'frio' },
  page_id: '100',
  ig_user_id: '200',
  ...over,
});

describe('validateItem — caminho feliz', () => {
  it('item completo fica ready sem erros', () => {
    const result = validateItem(draft(), ctx());
    expect(result.errors).toEqual([]);
    expect(statusFromValidation(result)).toBe('ready');
  });
});

describe('validateItem — bloqueios (US4 cenário 1)', () => {
  it('bloqueia item sem link', () => {
    const result = validateItem(draft({ copy: { ...draft().copy, link: '' } }), ctx());
    expect(result.errors.map((e) => e.code)).toContain('copy.link');
    expect(statusFromValidation(result)).toBe('blocked');
  });

  it('bloqueia item sem página', () => {
    const result = validateItem(draft({ page_id: '' }), ctx());
    expect(result.errors.map((e) => e.code)).toContain('page.missing');
  });

  it('bloqueia criativo rejeitado', () => {
    const result = validateItem(draft({ asset_ids: [BAD] }), ctx());
    expect(result.errors.map((e) => e.code)).toContain('asset.rejected');
  });

  it('bloqueia domínio fora da lista do cliente', () => {
    const result = validateItem(
      draft({ copy: { ...draft().copy, link: 'https://outrodominio.com/x' } }),
      ctx(),
    );
    const issue = result.errors.find((e) => e.code === 'copy.link_domain');
    expect(issue?.fix).toContain('lojateste.com.br');
  });

  it('aceita subdomínio do domínio permitido', () => {
    const result = validateItem(
      draft({ copy: { ...draft().copy, link: 'https://loja.lojateste.com.br/x' } }),
      ctx(),
    );
    expect(result.errors.map((e) => e.code)).not.toContain('copy.link_domain');
  });

  it('bloqueia URL inválida', () => {
    const result = validateItem(draft({ copy: { ...draft().copy, link: 'lojateste' } }), ctx());
    expect(result.errors.map((e) => e.code)).toContain('copy.link_invalid');
  });

  it('bloqueia página não elegível para a conta', () => {
    const result = validateItem(draft({ page_id: '999' }), ctx());
    expect(result.errors.map((e) => e.code)).toContain('page.not_eligible');
  });

  it('bloqueia criativo inexistente na biblioteca', () => {
    const result = validateItem(draft({ asset_ids: ['55555555-5555-4555-8555-555555555555'] }), ctx());
    expect(result.errors.map((e) => e.code)).toContain('asset.missing');
  });
});

describe('validateItem — formato e carrossel', () => {
  it('exige vídeo em single_video', () => {
    const result = validateItem(draft({ format: 'single_video' }), ctx());
    expect(result.errors.map((e) => e.code)).toContain('asset.kind_mismatch');
  });

  it('aceita carrossel com 2 cartões', () => {
    const result = validateItem(
      draft({
        format: 'carousel',
        asset_ids: [IMG, IMG2],
        copy: {
          ...draft().copy,
          cards: [
            { asset_id: IMG, headline: 'A', description: '', link: 'https://lojateste.com.br/a' },
            { asset_id: IMG2, headline: 'B', description: '', link: 'https://lojateste.com.br/b' },
          ],
        },
      }),
      ctx(),
    );
    expect(result.errors).toEqual([]);
  });

  it('bloqueia carrossel com 1 cartão', () => {
    const result = validateItem(draft({ format: 'carousel', asset_ids: [IMG] }), ctx());
    expect(result.errors.map((e) => e.code)).toContain('carousel.cards');
  });

  it('bloqueia carrossel com cartões de copy em número diferente', () => {
    const result = validateItem(
      draft({
        format: 'carousel',
        asset_ids: [IMG, IMG2],
        copy: {
          ...draft().copy,
          cards: [{ asset_id: IMG, headline: 'A', description: '', link: 'https://lojateste.com.br/a' }],
        },
      }),
      ctx(),
    );
    expect(result.errors.map((e) => e.code)).toContain('carousel.cards_mismatch');
  });

  it('bloqueia single_image com 2 criativos', () => {
    const result = validateItem(draft({ asset_ids: [IMG, IMG2] }), ctx());
    expect(result.errors.map((e) => e.code)).toContain('asset.count');
  });
});

describe('validateItem — avisos', () => {
  it('avisa quando o texto passa do limite recomendado', () => {
    const result = validateItem(
      draft({ copy: { ...draft().copy, primary_text: 'a'.repeat(200) } }),
      ctx(),
    );
    expect(result.warnings.map((w) => w.code)).toContain('copy.primary_text_length');
    expect(statusFromValidation(result)).toBe('ready');
  });

  it('avisa e sugere nome quando fora do template (US4 cenário 3)', () => {
    const result = validateItem(draft({ name: 'meu anuncio' }), ctx());
    expect(result.warnings.map((w) => w.code)).toContain('name.template');
    expect(result.suggested_name).toBe('loja-teste_outcome-sales_20260908_a_single-image_1');
  });

  it('avisa quando falta UTM padrão', () => {
    const result = validateItem(draft({ copy: { ...draft().copy, url_tags: 'utm_source=facebook' } }), ctx());
    const warning = result.warnings.find((w) => w.code === 'copy.url_tags');
    expect(warning?.message).toContain('utm_medium');
  });

  it('avisa quando a conta não tem Instagram', () => {
    const result = validateItem(
      draft({ ig_user_id: null }),
      ctx({
        account: { id: 'act_1', default_page_id: '100', eligible_page_ids: ['100'], has_instagram: false },
      }),
    );
    const warning = result.warnings.find((w) => w.code === 'instagram.missing');
    expect(warning?.message).toContain('só no Facebook');
    expect(statusFromValidation(result)).toBe('ready');
  });
});

describe('validateItem — política', () => {
  it('termo proibido bloqueia mesmo em policy_mode=warn', () => {
    const result = validateItem(
      draft({ copy: { ...draft().copy, primary_text: 'O mais barato da cidade' } }),
      ctx(),
    );
    expect(result.errors.map((e) => e.code)).toContain('policy.termo_proibido');
  });

  it('aviso de política bloqueia quando policy_mode=block', () => {
    const warned = validateItem(
      draft({ copy: { ...draft().copy, primary_text: 'Você tem insônia? Resolvemos.' } }),
      ctx(),
    );
    expect(statusFromValidation(warned)).toBe('ready');

    const blocked = validateItem(
      draft({ copy: { ...draft().copy, primary_text: 'Você tem insônia? Resolvemos.' } }),
      ctx({
        client: { ...ctx().client, policy_mode: 'block' },
      }),
    );
    expect(statusFromValidation(blocked)).toBe('blocked');
  });

  it('reporta a categoria e o trecho no relatório', () => {
    const result = validateItem(
      draft({ copy: { ...draft().copy, primary_text: 'Veja o antes e depois' } }),
      ctx(),
    );
    expect(result.policy[0]?.category).toBe('antes_e_depois');
    expect(result.policy[0]?.excerpt).toBe('antes e depois');
  });
});

describe('applyAutoFields', () => {
  it('preenche UTM, display_link, página, IG e nome', () => {
    const bare = draft({
      copy: { ...draft().copy, url_tags: '', display_link: '' },
      page_id: '',
      ig_user_id: null,
      name: '',
    });
    const { draft: filled, applied } = applyAutoFields(bare, ctx());
    expect(filled.copy.url_tags).toBe('utm_source=facebook&utm_medium=paid');
    expect(filled.copy.display_link).toBe('lojateste.com.br');
    expect(filled.page_id).toBe('100');
    expect(filled.ig_user_id).toBe('200');
    expect(filled.name).toBe('loja-teste_outcome-sales_20260908_a_single-image_1');
    expect(applied).toEqual(
      expect.arrayContaining(['copy.url_tags', 'copy.display_link', 'page_id', 'ig_user_id', 'name']),
    );
  });

  it('não sobrescreve UTM manual do gestor', () => {
    const manual = draft({ copy: { ...draft().copy, url_tags: 'utm_source=meu&utm_medium=paid' } });
    const { draft: filled } = applyAutoFields(manual, ctx());
    expect(filled.copy.url_tags).toContain('utm_source=meu');
  });

  it('não muda nada quando já está completo', () => {
    const { applied } = applyAutoFields(draft(), ctx());
    expect(applied).toEqual([]);
  });
});

describe('validateCampaignSpec (FR-020)', () => {
  it('aceita OUTCOME_SALES', () => {
    expect(
      validateCampaignSpec({
        name: 'c',
        objective: 'OUTCOME_SALES',
        buying_type: 'AUCTION',
        special_ad_categories: [],
      }),
    ).toEqual([]);
  });

  it('rejeita objetivo legado', () => {
    const issues = validateCampaignSpec({
      name: 'c',
      // objetivo legado chega por payload não confiável
      objective: 'CONVERSIONS' as unknown as 'OUTCOME_SALES',
      buying_type: 'AUCTION',
      special_ad_categories: [],
    });
    expect(issues.map((i) => i.code)).toContain('campaign.legacy_objective');
    expect(issues.map((i) => i.code)).toContain('campaign.legacy_type');
  });
});
