import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import type { AssetKind } from '@adpub/shared';

const exec = promisify(execFile);

export interface Probe {
  kind: AssetKind;
  width: number;
  height: number;
  durationMs: number | null;
  mime: string;
  /** Só em vídeo: codec do vídeo (ex.: h264) e do áudio (ex.: aac). */
  videoCodec?: string;
  audioCodec?: string;
  /** Quadros por segundo (média do arquivo). */
  frameRate?: number;
}

export function kindForMime(mime: string): AssetKind | null {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  return null;
}

export function mimeForFilename(filename: string): string {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.') + 1);
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    m4v: 'video/mp4',
  };
  return map[ext] ?? 'application/octet-stream';
}

export async function probeImage(bytes: Uint8Array, mime: string): Promise<Probe> {
  const metadata = await sharp(bytes).metadata();
  return {
    kind: 'image',
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    durationMs: null,
    mime,
  };
}

export interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  duration?: string;
  avg_frame_rate?: string;
  r_frame_rate?: string;
}

/** "30000/1001" → 29.97; "0/0" → undefined. */
function parseFrameRate(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const [numerator, denominator] = value.split('/').map(Number);
  if (!numerator || !denominator) return undefined;
  return Math.round((numerator / denominator) * 100) / 100;
}

/**
 * R8/FR-004: dimensões, duração e codecs de vídeo via ffprobe. Recebe um
 * arquivo em disco — vídeo de 500 MB não passa pela memória.
 */
export async function probeVideoFile(
  path: string,
  mime: string,
): Promise<Probe> {
  try {
    const { stdout } = await exec('ffprobe', [
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      path,
    ]);
    const parsed = JSON.parse(stdout) as {
      streams?: FfprobeStream[];
      format?: { duration?: string };
    };
    const video = parsed.streams?.find((s) => s.codec_type === 'video');
    const audio = parsed.streams?.find((s) => s.codec_type === 'audio');
    const durationSeconds = Number(parsed.format?.duration ?? video?.duration ?? 0);
    return {
      kind: 'video',
      width: video?.width ?? 0,
      height: video?.height ?? 0,
      durationMs: Number.isFinite(durationSeconds) ? Math.round(durationSeconds * 1000) : null,
      mime,
      ...(video?.codec_name ? { videoCodec: video.codec_name } : {}),
      ...(audio?.codec_name ? { audioCodec: audio.codec_name } : {}),
      ...(parseFrameRate(video?.avg_frame_rate ?? video?.r_frame_rate) !== undefined
        ? { frameRate: parseFrameRate(video?.avg_frame_rate ?? video?.r_frame_rate) }
        : {}),
    };
  } catch (error) {
    if (isMissingBinary(error)) {
      throw new Error(
        'ffprobe não encontrado. Instale o ffmpeg para importar vídeos (brew install ffmpeg).',
        { cause: error },
      );
    }
    throw error;
  }
}

/** Variante em memória (arquivos pequenos e testes): grava num temporário. */
export async function probeVideo(
  bytes: Uint8Array,
  mime: string,
  filename = 'video.mp4',
): Promise<Probe> {
  const dir = await mkdtemp(join(tmpdir(), 'adpub-probe-'));
  const path = join(dir, filename.replace(/[^\w.-]/g, '_'));
  try {
    await writeFile(path, bytes);
    return await probeVideoFile(path, mime);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Prova a partir de um arquivo em disco (imagem ou vídeo). */
export async function probeFile(path: string, filename: string, mime?: string): Promise<Probe> {
  const resolvedMime = mime ?? mimeForFilename(filename);
  const kind = kindForMime(resolvedMime);
  if (kind === 'image') {
    const metadata = await sharp(path).metadata();
    return {
      kind: 'image',
      width: metadata.width ?? 0,
      height: metadata.height ?? 0,
      durationMs: null,
      mime: resolvedMime,
    };
  }
  if (kind === 'video') return probeVideoFile(path, resolvedMime);
  throw new Error(`Tipo de arquivo não suportado: ${resolvedMime}`);
}

export async function probe(bytes: Uint8Array, filename: string, mime?: string): Promise<Probe> {
  const resolvedMime = mime ?? mimeForFilename(filename);
  const kind = kindForMime(resolvedMime);
  if (kind === 'image') return probeImage(bytes, resolvedMime);
  if (kind === 'video') return probeVideo(bytes, resolvedMime, filename);
  throw new Error(`Tipo de arquivo não suportado: ${resolvedMime}`);
}

export async function makeImageThumbnail(bytes: Uint8Array, size = 480): Promise<Uint8Array> {
  const out = await sharp(bytes)
    .resize({ width: size, height: size, fit: 'inside' })
    .jpeg({ quality: 78 })
    .toBuffer();
  return new Uint8Array(out);
}

/** Extrai um frame do vídeo como thumbnail (R8) — direto do arquivo. */
export async function makeVideoThumbnailFile(path: string, atSeconds = 1): Promise<Uint8Array> {
  const dir = await mkdtemp(join(tmpdir(), 'adpub-thumb-'));
  const output = join(dir, 'thumb.jpg');
  const grab = (seek: number) =>
    exec('ffmpeg', ['-y', '-ss', String(seek), '-i', path, '-frames:v', '1', '-q:v', '3', output]);
  try {
    try {
      await grab(atSeconds);
    } catch (error) {
      // Vídeo mais curto que o segundo pedido: ffmpeg sai sem frame nenhum.
      if (atSeconds === 0) throw error;
      await grab(0);
    }
    const { readFile } = await import('node:fs/promises');
    return new Uint8Array(await readFile(output));
  } catch (error) {
    if (isMissingBinary(error)) {
      throw new Error('ffmpeg não encontrado. Instale o ffmpeg para gerar thumbnail de vídeo.', {
        cause: error,
      });
    }
    throw error;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Frame para o provedor de visão: sempre JPEG e com o maior lado limitado.
 * Formato fora do aceito pelo provedor quebrava a chamada; imagem gigante
 * pagava token por pixel que o modelo reduz sozinho.
 */
export async function makeVisionFrame(bytes: Uint8Array, maxEdge = 1568): Promise<Uint8Array> {
  const out = await sharp(bytes)
    .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
  return new Uint8Array(out);
}

/** Miniatura de imagem lida do disco. */
export async function makeImageThumbnailFile(path: string, size = 480): Promise<Uint8Array> {
  const out = await sharp(path).resize({ width: size, height: size, fit: 'inside' }).jpeg({ quality: 78 }).toBuffer();
  return new Uint8Array(out);
}

/** Miniatura a partir do arquivo em disco; `null` quando não dá para gerar. */
export async function makeThumbnailFile(
  path: string,
  kind: AssetKind,
  atSeconds?: number,
): Promise<Uint8Array | null> {
  try {
    return kind === 'image'
      ? await makeImageThumbnailFile(path)
      : await makeVideoThumbnailFile(path, atSeconds);
  } catch {
    return null;
  }
}

/** Variante em memória (arquivos pequenos e testes). */
export async function makeVideoThumbnail(
  bytes: Uint8Array,
  filename = 'video.mp4',
): Promise<Uint8Array> {
  const dir = await mkdtemp(join(tmpdir(), 'adpub-thumb-'));
  const input = join(dir, filename.replace(/[^\w.-]/g, '_'));
  try {
    await writeFile(input, bytes);
    return await makeVideoThumbnailFile(input);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function makeThumbnail(
  bytes: Uint8Array,
  kind: AssetKind,
  filename: string,
): Promise<Uint8Array | null> {
  try {
    return kind === 'image'
      ? await makeImageThumbnail(bytes)
      : await makeVideoThumbnail(bytes, filename);
  } catch {
    return null;
  }
}

function isMissingBinary(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'ENOENT',
  );
}
