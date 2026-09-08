import type { AdDraftStatus, PublishStep } from './enums.js';

/** Ordem das etapas do pipeline (R4). */
export const STEP_ORDER: readonly PublishStep[] = [
  'upload_media',
  'ensure_campaign',
  'ensure_adset',
  'create_creative',
  'create_ad',
  'done',
];

export const STEP_STATUS: Record<Exclude<PublishStep, 'done'>, AdDraftStatus> = {
  upload_media: 'uploading_media',
  ensure_campaign: 'ensuring_campaign',
  ensure_adset: 'ensuring_adset',
  create_creative: 'creating_creative',
  create_ad: 'creating_ad',
};

export function nextStep(step: PublishStep): PublishStep {
  const index = STEP_ORDER.indexOf(step);
  if (index < 0) throw new Error(`Etapa desconhecida: ${step}`);
  return STEP_ORDER[Math.min(index + 1, STEP_ORDER.length - 1)] as PublishStep;
}

export function statusForStep(step: PublishStep): AdDraftStatus {
  return step === 'done' ? 'published' : STEP_STATUS[step];
}

/**
 * R3/R4: reprocessar retoma na etapa salva em `publish_jobs.step` e uma falha
 * transiente (rate limit, 5xx, vídeo processando) volta para a mesma etapa.
 * Por isso `queued` alcança qualquer etapa e cada etapa permite reentrada em si
 * mesma - o que continua proibido é andar para trás e sair de `published`.
 */
const TRANSITIONS: Record<AdDraftStatus, readonly AdDraftStatus[]> = {
  draft: ['draft', 'ready', 'blocked'],
  blocked: ['blocked', 'ready', 'draft'],
  ready: ['ready', 'queued', 'draft', 'blocked'],
  queued: [
    'queued',
    'uploading_media',
    'ensuring_campaign',
    'ensuring_adset',
    'creating_creative',
    'creating_ad',
    'failed',
    'ready',
  ],
  uploading_media: ['uploading_media', 'ensuring_campaign', 'failed'],
  ensuring_campaign: ['ensuring_campaign', 'ensuring_adset', 'failed'],
  ensuring_adset: ['ensuring_adset', 'creating_creative', 'failed'],
  creating_creative: ['creating_creative', 'creating_ad', 'failed'],
  creating_ad: ['creating_ad', 'published', 'failed'],
  published: ['in_review', 'approved', 'disapproved', 'published'],
  in_review: ['in_review', 'approved', 'disapproved'],
  approved: ['approved', 'disapproved'],
  disapproved: ['disapproved', 'approved'],
  failed: ['failed', 'queued', 'draft', 'blocked', 'ready'],
};

export const PUBLISHED_STATUSES: readonly AdDraftStatus[] = [
  'published',
  'in_review',
  'approved',
  'disapproved',
];

export const IN_FLIGHT_STATUSES: readonly AdDraftStatus[] = [
  'queued',
  'uploading_media',
  'ensuring_campaign',
  'ensuring_adset',
  'creating_creative',
  'creating_ad',
];

export function canTransition(from: AdDraftStatus, to: AdDraftStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: AdDraftStatus, to: AdDraftStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Transição inválida: ${from} → ${to}`);
  }
}

/** Invariante: item publicado nunca volta para etapas anteriores. */
export function isPublished(status: AdDraftStatus): boolean {
  return PUBLISHED_STATUSES.includes(status);
}

export function isInFlight(status: AdDraftStatus): boolean {
  return IN_FLIGHT_STATUSES.includes(status);
}

/** Status do lote derivado dos itens (data-model: trigger equivalente). */
export function deriveBatchStatus(
  itemStatuses: readonly AdDraftStatus[],
): 'draft' | 'ready' | 'blocked' | 'publishing' | 'done' | 'partial' | 'failed' {
  if (itemStatuses.length === 0) return 'draft';
  const has = (s: AdDraftStatus) => itemStatuses.includes(s);
  const all = (fn: (s: AdDraftStatus) => boolean) => itemStatuses.every(fn);

  if (itemStatuses.some(isInFlight)) return 'publishing';
  if (all(isPublished)) return 'done';
  if (all((s) => s === 'failed')) return 'failed';
  if (has('failed')) return 'partial';
  if (has('blocked')) return 'blocked';
  if (all((s) => s === 'ready')) return 'ready';
  return 'draft';
}
