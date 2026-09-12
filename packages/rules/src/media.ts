import { MEDIA_SPECS, SUPPORTED_ASPECT_RATIOS, type AspectRatio } from '@adpub/config';
import type { AssetKind } from '@adpub/shared';

export interface MediaInput {
  kind: AssetKind;
  mime: string;
  width: number;
  height: number;
  durationMs?: number | null;
  sizeBytes: number;
  filename?: string;
  /** Lidos do ffprobe na ingestão (só vídeo). */
  videoCodec?: string;
  audioCodec?: string;
  frameRate?: number;
}

export interface MediaValidation {
  status: 'ok' | 'rejected';
  errors: string[];
  warnings: string[];
  aspect_ratio: AspectRatio;
}

const RATIO_VALUES: Record<(typeof SUPPORTED_ASPECT_RATIOS)[number], number> = {
  '1:1': 1,
  '4:5': 0.8,
  '9:16': 9 / 16,
  '16:9': 16 / 9,
  '1.91:1': 1.91,
};

/** Tolerância relativa de 2 % — cobre exportações tipo 1080×1349. */
const TOLERANCE = 0.02;

export function detectAspectRatio(width: number, height: number): AspectRatio {
  if (width <= 0 || height <= 0) return 'other';
  const ratio = width / height;
  let best: AspectRatio = 'other';
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const label of SUPPORTED_ASPECT_RATIOS) {
    const target = RATIO_VALUES[label];
    const delta = Math.abs(ratio - target) / target;
    if (delta <= TOLERANCE && delta < bestDelta) {
      best = label;
      bestDelta = delta;
    }
  }
  return best;
}

function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

/** "h264" → "H.264"; o resto vira maiúscula mesmo (hevc → HEVC). */
function codecLabel(codec: string): string {
  return codec === 'h264' ? 'H.264' : codec.toUpperCase();
}

/** FR-004: valida mídia contra a tabela de specs e explica como corrigir. */
export function validateMedia(input: MediaInput): MediaValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const spec = MEDIA_SPECS[input.kind];
  const aspect = detectAspectRatio(input.width, input.height);

  if (!(spec.mimes as readonly string[]).includes(input.mime)) {
    errors.push(
      `Formato de arquivo não suportado (${input.mime}). Use ${spec.mimes.join(', ')}.`,
    );
  }

  if (aspect === 'other') {
    errors.push(
      `Proporção não suportada (${input.width}×${input.height}). Reexporte em 1:1, 4:5, 9:16, 16:9 ou 1.91:1.`,
    );
  }

  if (input.width < spec.minWidth || input.height < spec.minHeight) {
    errors.push(
      `Dimensão abaixo do mínimo (${input.width}×${input.height}). Reexporte com pelo menos ${spec.minWidth} px em cada lado — ex.: 1080×1350.`,
    );
  }

  if (input.sizeBytes > spec.maxSizeBytes) {
    errors.push(
      `Arquivo maior que o limite de ${mb(spec.maxSizeBytes)} (${mb(input.sizeBytes)}). Comprima antes de subir.`,
    );
  }

  if (input.kind === 'video') {
    const videoSpec = MEDIA_SPECS.video;
    const duration = input.durationMs ?? 0;
    if (duration <= 0) {
      errors.push('Não foi possível ler a duração do vídeo. Reexporte em MP4 (H.264 + AAC).');
    } else if (duration < videoSpec.minDurationMs) {
      errors.push(
        `Vídeo curto demais (${(duration / 1000).toFixed(1)} s). O mínimo é ${videoSpec.minDurationMs / 1000} s.`,
      );
    } else if (duration > videoSpec.maxDurationMs) {
      errors.push(
        `Vídeo longo demais (${(duration / 1000).toFixed(0)} s). O limite configurado é ${videoSpec.maxDurationMs / 1000} s.`,
      );
    }

    // A Meta recusa codec fora do H.264 (H.265/HEVC/AV1/VP9) — melhor barrar aqui,
    // com o motivo, do que descobrir na publicação depois de gastar verba.
    const videoCodec = input.videoCodec?.toLowerCase();
    if (videoCodec && !(videoSpec.videoCodecs as readonly string[]).includes(videoCodec)) {
      errors.push(
        `Codec de vídeo ${codecLabel(videoCodec)} não é aceito pela Meta (use ${videoSpec.videoCodecs.map(codecLabel).join('/')}). Reexporte em MP4 H.264 + AAC.`,
      );
    }

    if (input.frameRate !== undefined && input.frameRate > videoSpec.maxFrameRate) {
      errors.push(
        `Vídeo a ${input.frameRate} fps; a Meta aceita até ${videoSpec.maxFrameRate} fps. Reexporte a 30 fps.`,
      );
    }

    const audioCodec = input.audioCodec?.toLowerCase();
    if (audioCodec && audioCodec !== videoSpec.preferredAudioCodec) {
      warnings.push(
        `Áudio em ${audioCodec.toUpperCase()}; a Meta prefere ${videoSpec.preferredAudioCodec.toUpperCase()} 128 kbps stereo.`,
      );
    }
  }

  if (input.kind === 'image' && aspect === '16:9') {
    warnings.push('16:9 não ocupa bem Reels/Stories. Prefira 4:5 ou 9:16 para feed e stories.');
  }

  return { status: errors.length > 0 ? 'rejected' : 'ok', errors, warnings, aspect_ratio: aspect };
}
