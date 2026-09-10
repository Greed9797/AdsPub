/** Limites recomendados pela Meta para copy (spec FR-007). */
export const COPY_LIMITS = {
  primary_text: 125,
  headline: 40,
  description: 30,
} as const;

export type CopyField = keyof typeof COPY_LIMITS;

/** Proporções aceitas no MVP. */
export const SUPPORTED_ASPECT_RATIOS = ['1:1', '4:5', '9:16', '16:9', '1.91:1'] as const;
export type AspectRatio = (typeof SUPPORTED_ASPECT_RATIOS)[number] | 'other';

/** Especificações de mídia configuráveis (FR-004). */
export const MEDIA_SPECS = {
  image: {
    minWidth: 600,
    minHeight: 600,
    maxSizeBytes: 30 * 1024 * 1024,
    mimes: ['image/jpeg', 'image/png', 'image/webp'],
  },
  video: {
    minWidth: 600,
    minHeight: 600,
    maxSizeBytes: 500 * 1024 * 1024,
    minDurationMs: 1_000,
    maxDurationMs: 90_000,
    mimes: ['video/mp4', 'video/quicktime'],
  },
} as const;

/** Constituição II: teto padrão de anúncios por conta/dia. */
export const DEFAULT_DAILY_AD_CAP = 200;

/** Maior arquivo aceito no upload direto (vídeo). */
export const MAX_UPLOAD_BYTES = MEDIA_SPECS.video.maxSizeBytes;

/** Carrossel: 2 a 10 cartões. */
export const CAROUSEL_CARDS = { min: 2, max: 10 } as const;

/** Batch da Graph API aceita até 50 requisições. */
export const GRAPH_BATCH_MAX = 50;

/** Concorrência por conta conforme tier (R6). */
export const CONCURRENCY_BY_TIER = { limited: 1, full: 3 } as const;

/** A partir deste uso de rate limit a conta cai para concorrência 1. */
export const RATE_LIMIT_THROTTLE_PERCENT = 75;

/** Timeout do processamento de vídeo na Meta antes de falhar (R8). */
export const VIDEO_READY_TIMEOUT_MS = 20 * 60 * 1000;
export const VIDEO_POLL_INTERVAL_MS = 15_000;

/** Retry (FR-011). */
export const RETRY = {
  maxAttempts: 6,
  baseDelayMs: 2_000,
  maxDelayMs: 5 * 60 * 1000,
  jitterRatio: 0.25,
} as const;

/** Poller de status de revisão (R11). */
export const STATUS_POLL = {
  everyMs: 10 * 60 * 1000,
  windowDays: 7,
} as const;

export const SYNC_EVERY_MS = 6 * 60 * 60 * 1000;

/** T-004-3: sync de Insights — 2h por conta + janela móvel por atribuição. */
export const INSIGHTS_SYNC = {
  everyMs: 2 * 60 * 60 * 1000,
  backfillDays: 90,
  backfillWindowDays: 30,
  attributionDays: 7,
  windowMarginDays: 3,
} as const;

/** Preço por milhão de tokens, para custo estimado das gerações. */
export const AI_PRICING_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  default: { input: 3, output: 15 },
  'claude-haiku-4-6': { input: 1, output: 5 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
};

export function adsManagerUrl(adAccountId: string, adId?: string): string {
  const act = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  const base = `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${act.replace('act_', '')}`;
  return adId ? `${base}&selected_ad_ids=${adId}` : base;
}

/** Nomes de fila compartilhados entre API (produtor) e worker (consumidor). */
export const QUEUES = {
  publish: 'adpub.publish',
  sync: 'adpub.sync',
  driveImport: 'adpub.drive-import',
  statusPoll: 'adpub.status-poll',
  insightsSync: 'adpub.insights-sync',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
