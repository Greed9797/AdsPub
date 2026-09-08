import { CAROUSEL_CARDS, COPY_LIMITS } from '@adpub/config';
import {
  LEGACY_CAMPAIGN_TYPES,
  type AdDraftInput,
  type AssetKind,
  type CampaignSpec,
  type ItemValidation,
  type PolicyIssue,
  type PolicyMode,
  type ValidationIssue,
} from '@adpub/shared';
import { checkPolicy } from './policy.js';
import { matchesNamingTemplate, renderNamingTemplate } from './naming.js';
import { buildUrlTags, displayLinkFor, isAllowedDomain, mergeUrlTags, parseUrl } from './url.js';

export interface AssetRef {
  id: string;
  kind: AssetKind;
  aspect_ratio: string;
  validation_status: 'ok' | 'rejected';
  filename?: string;
}

export interface ValidateClientContext {
  name: string;
  landing_domains: readonly string[];
  naming_template: string;
  default_utm: Record<string, string>;
  policy_mode: PolicyMode;
  forbidden_terms: readonly string[];
}

export interface ValidateAccountContext {
  id: string;
  default_page_id?: string | null;
  default_ig_user_id?: string | null;
  eligible_page_ids?: readonly string[];
  has_instagram: boolean;
}

export interface ValidateContext {
  client: ValidateClientContext;
  account: ValidateAccountContext;
  assets: ReadonlyMap<string, AssetRef>;
  objective?: string;
  now?: Date;
  /** Índice da variação, para o token {v} da nomenclatura. */
  variant?: number;
}

const KIND_BY_FORMAT: Record<AdDraftInput['format'], AssetKind | 'any'> = {
  single_image: 'image',
  single_video: 'video',
  carousel: 'any',
};

function error(code: string, field: string, message: string, fix = ''): ValidationIssue {
  return { code, field, message, fix };
}

export function suggestedNameFor(draft: AdDraftInput, ctx: ValidateContext): string {
  const firstAsset = ctx.assets.get(draft.asset_ids[0] ?? '');
  return renderNamingTemplate(ctx.client.naming_template, {
    cliente: ctx.client.name,
    conta: ctx.account.id,
    objetivo: ctx.objective ?? '',
    criativo: firstAsset?.filename?.replace(/\.[^.]+$/, '') ?? firstAsset?.id.slice(0, 8) ?? '',
    formato: draft.format,
    v: ctx.variant ?? 1,
    data: ctx.now ?? new Date(),
  });
}

/**
 * US4 cenário 4: preenche UTM/display_link/nome quando faltam, devolvendo
 * a lista de campos preenchidos automaticamente.
 */
export function applyAutoFields(
  draft: AdDraftInput,
  ctx: ValidateContext,
): { draft: AdDraftInput; applied: string[] } {
  const applied: string[] = [];
  const next: AdDraftInput = { ...draft, copy: { ...draft.copy } };

  const defaults = buildUrlTags(ctx.client.default_utm, {
    cliente: ctx.client.name,
    conta: ctx.account.id,
    objetivo: ctx.objective ?? '',
    formato: draft.format,
  });
  if (defaults) {
    const merged = mergeUrlTags(next.copy.url_tags ?? '', defaults);
    if (merged !== (next.copy.url_tags ?? '')) {
      next.copy.url_tags = merged;
      applied.push('copy.url_tags');
    }
  }

  if (!next.copy.display_link && next.copy.link) {
    const display = displayLinkFor(next.copy.link);
    if (display) {
      next.copy.display_link = display;
      applied.push('copy.display_link');
    }
  }

  if (!next.page_id && ctx.account.default_page_id) {
    next.page_id = ctx.account.default_page_id;
    applied.push('page_id');
  }
  if (!next.ig_user_id && ctx.account.default_ig_user_id) {
    next.ig_user_id = ctx.account.default_ig_user_id;
    applied.push('ig_user_id');
  }
  if (!next.name) {
    next.name = suggestedNameFor(next, ctx);
    applied.push('name');
  }

  return { draft: next, applied };
}

/** FR-020: nunca criar campanha de tipo legado ASC/AAC. */
export function validateCampaignSpec(spec: CampaignSpec): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!spec.objective.startsWith('OUTCOME_')) {
    issues.push(
      error(
        'campaign.legacy_objective',
        'campaign_ref.spec.objective',
        `Objetivo legado "${spec.objective}" não é permitido.`,
        'Use OUTCOME_SALES, OUTCOME_LEADS, OUTCOME_TRAFFIC ou OUTCOME_ENGAGEMENT.',
      ),
    );
  }
  if ((LEGACY_CAMPAIGN_TYPES as readonly string[]).includes(spec.objective)) {
    issues.push(
      error(
        'campaign.legacy_type',
        'campaign_ref.spec.objective',
        'Tipo legado de campanha (Advantage+ Shopping/App) bloqueado pela Meta.',
        'Recrie no fluxo unificado com objetivo OUTCOME_*.',
      ),
    );
  }
  return issues;
}

/** FR-009: validação completa de um item. */
export function validateItem(draft: AdDraftInput, ctx: ValidateContext): ItemValidation {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // --- criativos ---
  const kindWanted = KIND_BY_FORMAT[draft.format];
  const assets = draft.asset_ids.map((id) => ({ id, asset: ctx.assets.get(id) }));
  for (const { id, asset } of assets) {
    if (!asset) {
      errors.push(
        error('asset.missing', 'asset_ids', `Criativo ${id} não está na biblioteca.`, 'Selecione outro criativo.'),
      );
      continue;
    }
    if (asset.validation_status === 'rejected') {
      errors.push(
        error(
          'asset.rejected',
          'asset_ids',
          `Criativo "${asset.filename ?? asset.id}" foi rejeitado na validação de mídia.`,
          'Reexporte o arquivo dentro das especificações e importe de novo.',
        ),
      );
    }
    if (kindWanted !== 'any' && asset.kind !== kindWanted) {
      errors.push(
        error(
          'asset.kind_mismatch',
          'format',
          `Formato ${draft.format} exige ${kindWanted}, mas o criativo é ${asset.kind}.`,
          'Troque o criativo ou o formato do item.',
        ),
      );
    }
  }

  if (draft.format === 'carousel') {
    if (draft.asset_ids.length < CAROUSEL_CARDS.min || draft.asset_ids.length > CAROUSEL_CARDS.max) {
      errors.push(
        error(
          'carousel.cards',
          'asset_ids',
          `Carrossel precisa de ${CAROUSEL_CARDS.min} a ${CAROUSEL_CARDS.max} cartões (tem ${draft.asset_ids.length}).`,
          'Ajuste a quantidade de criativos do item.',
        ),
      );
    }
    const cards = draft.copy.cards ?? [];
    if (cards.length > 0 && cards.length !== draft.asset_ids.length) {
      errors.push(
        error(
          'carousel.cards_mismatch',
          'copy.cards',
          'Quantidade de cartões de copy diferente da quantidade de criativos.',
          'Gere um cartão por criativo.',
        ),
      );
    }
  } else if (draft.asset_ids.length !== 1) {
    errors.push(
      error('asset.count', 'asset_ids', `Formato ${draft.format} aceita exatamente 1 criativo.`, 'Remova os criativos extras.'),
    );
  }

  // --- copy e link ---
  if (!draft.copy.primary_text.trim()) {
    errors.push(error('copy.primary_text', 'copy.primary_text', 'Texto principal vazio.', 'Escreva ou gere o texto principal.'));
  }
  if (!draft.copy.link.trim()) {
    errors.push(
      error('copy.link', 'copy.link', 'Link de destino pendente.', 'Informe a URL de destino do anúncio.'),
    );
  } else {
    const url = parseUrl(draft.copy.link);
    if (!url) {
      errors.push(error('copy.link_invalid', 'copy.link', `URL inválida: ${draft.copy.link}`, 'Use uma URL http(s) completa.'));
    } else {
      if (url.protocol === 'http:') {
        warnings.push(error('copy.link_http', 'copy.link', 'Link sem HTTPS.', 'Prefira https para não perder conversão.'));
      }
      if (!isAllowedDomain(draft.copy.link, ctx.client.landing_domains)) {
        errors.push(
          error(
            'copy.link_domain',
            'copy.link',
            `Domínio "${url.hostname}" não está na lista permitida do cliente.`,
            `Use um dos domínios: ${ctx.client.landing_domains.join(', ')}`,
          ),
        );
      }
    }
  }

  for (const [field, limit] of Object.entries(COPY_LIMITS)) {
    const value = String((draft.copy as unknown as Record<string, unknown>)[field] ?? '');
    if (value.length > limit) {
      warnings.push(
        error(
          `copy.${field}_length`,
          `copy.${field}`,
          `${field} com ${value.length} caracteres (recomendado até ${limit}).`,
          'Pode publicar, mas a Meta talvez trunque o texto.',
        ),
      );
    }
  }

  const missingUtm = Object.keys(ctx.client.default_utm).filter(
    (key) => !new RegExp(`(^|&)${key}=`).test(draft.copy.url_tags ?? ''),
  );
  if (missingUtm.length > 0) {
    warnings.push(
      error(
        'copy.url_tags',
        'copy.url_tags',
        `UTM padrão incompleto: falta ${missingUtm.join(', ')}.`,
        'Clique em "aplicar UTM padrão".',
      ),
    );
  }

  // --- página / instagram ---
  if (!draft.page_id) {
    errors.push(
      error('page.missing', 'page_id', 'Anúncio sem página do Facebook.', 'Defina a página padrão da conta em Contas.'),
    );
  } else if (
    ctx.account.eligible_page_ids &&
    ctx.account.eligible_page_ids.length > 0 &&
    ctx.account.eligible_page_ids.includes(draft.page_id) === false
  ) {
    errors.push(
      error(
        'page.not_eligible',
        'page_id',
        'A página escolhida não está disponível para esta conta de anúncio.',
        'Escolha uma página vinculada à conta ou peça acesso na BM.',
      ),
    );
  }
  if (!draft.ig_user_id) {
    warnings.push(
      error(
        'instagram.missing',
        'ig_user_id',
        ctx.account.has_instagram
          ? 'Item sem conta do Instagram — o anúncio roda só no Facebook.'
          : 'Conta sem Instagram vinculado — o anúncio roda só no Facebook.',
        'Vincule o Instagram na BM para posicionamentos do IG.',
      ),
    );
  }

  // --- refs de campanha/conjunto ---
  if (draft.campaign_ref.kind === 'new' && !draft.campaign_ref.key) {
    errors.push(error('campaign_ref.key', 'campaign_ref', 'Campanha nova sem chave de agrupamento.', ''));
  }
  if (draft.adset_ref.kind === 'new' && !draft.adset_ref.key) {
    errors.push(error('adset_ref.key', 'adset_ref', 'Conjunto novo sem chave de agrupamento.', ''));
  }

  // --- nomenclatura ---
  const suggested = suggestedNameFor(draft, ctx);
  let suggestedName: string | undefined;
  if (!draft.name.trim()) {
    errors.push(error('name.missing', 'name', 'Nome do anúncio vazio.', `Sugestão: ${suggested}`));
    suggestedName = suggested;
  } else if (!matchesNamingTemplate(draft.name, ctx.client.naming_template)) {
    warnings.push(
      error(
        'name.template',
        'name',
        `Nome fora do padrão do cliente (${ctx.client.naming_template}).`,
        `Sugestão: ${suggested}`,
      ),
    );
    suggestedName = suggested;
  }

  // --- política ---
  const policyText = [
    draft.copy.primary_text,
    draft.copy.headline,
    draft.copy.description,
    ...(draft.copy.cards ?? []).flatMap((c) => [c.headline, c.description]),
  ]
    .filter(Boolean)
    .join('\n');

  const policy: PolicyIssue[] = checkPolicy(policyText, {
    forbiddenTerms: ctx.client.forbidden_terms,
  });

  for (const issue of policy) {
    const blocking =
      issue.severity === 'error' || (ctx.client.policy_mode === 'block' && issue.severity === 'warning');
    const asIssue = error(
      `policy.${issue.category}`,
      'copy',
      `Política (${issue.category}): "${issue.excerpt}"`,
      issue.severity === 'error'
        ? 'Remova o termo proibido pelo cliente.'
        : 'Reescreva o trecho para reduzir risco de reprovação.',
    );
    if (blocking) errors.push(asIssue);
    else warnings.push(asIssue);
  }

  return {
    errors,
    warnings,
    policy,
    ...(suggestedName ? { suggested_name: suggestedName } : {}),
  };
}

export function statusFromValidation(validation: ItemValidation): 'ready' | 'blocked' {
  return validation.errors.length > 0 ? 'blocked' : 'ready';
}
