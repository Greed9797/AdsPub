import type { AdsetSpec, CampaignSpec } from '@adpub/shared';
import { actPath, type MetaClient } from '../client.js';
import { buildCreativePayload, type CreativePayloadInput } from './creative-payload.js';

/**
 * Constituição I: este módulo só pode ser importado por `apps/worker`
 * (garantido pela regra de lint `no-restricted-imports`).
 */

export { buildCreativePayload } from './creative-payload.js';
export type { CreativeMedia, CreativePayloadInput } from './creative-payload.js';

export interface IdResponse {
  id: string;
}

export interface UploadImageResponse {
  images: Record<string, { hash: string; url?: string }>;
}

export async function uploadImage(
  client: MetaClient,
  adAccountId: string,
  file: { filename: string; bytes: Uint8Array; mime: string },
): Promise<string> {
  const form = new FormData();
  const buffer = file.bytes.buffer.slice(
    file.bytes.byteOffset,
    file.bytes.byteOffset + file.bytes.byteLength,
  ) as ArrayBuffer;
  form.set('source', new Blob([buffer], { type: file.mime }), file.filename);
  const response = await client.postForm<UploadImageResponse>(
    actPath(adAccountId, 'adimages'),
    form,
  );
  const entry = Object.values(response.images ?? {})[0];
  if (!entry?.hash) throw new Error('Upload de imagem sem hash na resposta.');
  return entry.hash;
}

export interface VideoUploadStart {
  upload_session_id: string;
  video_id: string;
  start_offset: string;
  end_offset: string;
}

export interface VideoUploadTransfer {
  start_offset: string;
  end_offset: string;
}

export async function startVideoUpload(
  client: MetaClient,
  adAccountId: string,
  fileSize: number,
): Promise<VideoUploadStart> {
  return client.post<VideoUploadStart>(actPath(adAccountId, 'advideos'), {
    upload_phase: 'start',
    file_size: fileSize,
  });
}

export async function transferVideoChunk(
  client: MetaClient,
  adAccountId: string,
  input: { uploadSessionId: string; startOffset: string; chunk: Uint8Array },
): Promise<VideoUploadTransfer> {
  const form = new FormData();
  form.set('upload_phase', 'transfer');
  form.set('upload_session_id', input.uploadSessionId);
  form.set('start_offset', input.startOffset);
  const buffer = input.chunk.buffer.slice(
    input.chunk.byteOffset,
    input.chunk.byteOffset + input.chunk.byteLength,
  ) as ArrayBuffer;
  form.set('video_file_chunk', new Blob([buffer], { type: 'application/octet-stream' }), 'chunk');
  return client.postForm<VideoUploadTransfer>(actPath(adAccountId, 'advideos'), form);
}

export async function finishVideoUpload(
  client: MetaClient,
  adAccountId: string,
  input: { uploadSessionId: string; title?: string; description?: string },
): Promise<{ success: boolean }> {
  return client.post<{ success: boolean }>(actPath(adAccountId, 'advideos'), {
    upload_phase: 'finish',
    upload_session_id: input.uploadSessionId,
    ...(input.title ? { title: input.title } : {}),
    ...(input.description ? { description: input.description } : {}),
  });
}

export interface VideoStatus {
  id: string;
  status?: { video_status?: string; processing_progress?: number; error?: unknown };
}

export async function getVideoStatus(client: MetaClient, videoId: string): Promise<VideoStatus> {
  return client.get<VideoStatus>(videoId, { fields: 'status' });
}

/** Upload retomável completo (R8). */
export async function uploadVideo(
  client: MetaClient,
  adAccountId: string,
  file: { filename: string; bytes: Uint8Array },
  options: { chunkSizeBytes?: number } = {},
): Promise<string> {
  const start = await startVideoUpload(client, adAccountId, file.bytes.byteLength);
  const chunkSize = options.chunkSizeBytes ?? 4 * 1024 * 1024;
  let startOffset = Number(start.start_offset);
  let endOffset = Number(start.end_offset);

  while (startOffset < endOffset) {
    const sliceEnd = Math.min(endOffset, startOffset + chunkSize, file.bytes.byteLength);
    const chunk = file.bytes.subarray(startOffset, sliceEnd);
    const transfer = await transferVideoChunk(client, adAccountId, {
      uploadSessionId: start.upload_session_id,
      startOffset: String(startOffset),
      chunk,
    });
    const nextStart = Number(transfer.start_offset);
    endOffset = Number(transfer.end_offset);
    if (nextStart === startOffset) break;
    startOffset = nextStart;
  }

  await finishVideoUpload(client, adAccountId, {
    uploadSessionId: start.upload_session_id,
    title: file.filename,
  });
  return start.video_id;
}

/** Constituição II: campanha nasce PAUSED. */
export async function createCampaign(
  client: MetaClient,
  adAccountId: string,
  spec: CampaignSpec,
): Promise<string> {
  if (!spec.objective.startsWith('OUTCOME_')) {
    throw new Error(`Objetivo não permitido (FR-020): ${spec.objective}`);
  }
  const response = await client.post<IdResponse>(actPath(adAccountId, 'campaigns'), {
    name: spec.name,
    objective: spec.objective,
    status: 'PAUSED',
    buying_type: spec.buying_type,
    special_ad_categories: spec.special_ad_categories ?? [],
    ...(spec.daily_budget_cents ? { daily_budget: spec.daily_budget_cents } : {}),
    ...(spec.lifetime_budget_cents ? { lifetime_budget: spec.lifetime_budget_cents } : {}),
  });
  return response.id;
}

export async function createAdSet(
  client: MetaClient,
  adAccountId: string,
  input: { campaignId: string; spec: AdsetSpec; pixelId?: string | null },
): Promise<string> {
  const { spec } = input;
  const targeting = spec.targeting ?? {
    geo_locations: { countries: ['BR'] },
    targeting_automation: { advantage_audience: spec.advantage_audience ? 1 : 0 },
  };
  const response = await client.post<IdResponse>(actPath(adAccountId, 'adsets'), {
    name: spec.name,
    campaign_id: input.campaignId,
    status: 'PAUSED',
    optimization_goal: spec.optimization_goal,
    billing_event: spec.billing_event,
    targeting,
    ...(spec.daily_budget_cents ? { daily_budget: spec.daily_budget_cents } : {}),
    ...(spec.start_time ? { start_time: spec.start_time } : {}),
    ...(spec.end_time ? { end_time: spec.end_time } : {}),
    ...(spec.promoted_object
      ? { promoted_object: spec.promoted_object }
      : input.pixelId && spec.optimization_goal === 'OFFSITE_CONVERSIONS'
        ? { promoted_object: { pixel_id: input.pixelId, custom_event_type: 'PURCHASE' } }
        : {}),
  });
  return response.id;
}

export async function createAdCreative(
  client: MetaClient,
  adAccountId: string,
  input: CreativePayloadInput,
): Promise<string> {
  const payload = buildCreativePayload(input);
  const response = await client.post<IdResponse>(actPath(adAccountId, 'adcreatives'), {
    ...payload,
  });
  return response.id;
}

/** Constituição II: anúncio sempre nasce PAUSED, sem exceção. */
export async function createAd(
  client: MetaClient,
  adAccountId: string,
  input: { name: string; adsetId: string; creativeId: string },
): Promise<string> {
  const response = await client.post<IdResponse>(actPath(adAccountId, 'ads'), {
    name: input.name,
    adset_id: input.adsetId,
    creative: { creative_id: input.creativeId },
    status: 'PAUSED',
  });
  return response.id;
}

/** Usado apenas pela suíte de fumaça para limpar o que criou. */
export async function archiveAd(client: MetaClient, adId: string): Promise<void> {
  await client.post(adId, { status: 'ARCHIVED' });
}

export async function archiveCampaign(client: MetaClient, campaignId: string): Promise<void> {
  await client.post(campaignId, { status: 'ARCHIVED' });
}
