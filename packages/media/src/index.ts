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
  width?: number;
  height?: number;
  duration?: string;
}

/** R8/FR-004: dimensões e duração de vídeo via ffprobe. */
export async function probeVideo(
  bytes: Uint8Array,
  mime: string,
  filename = 'video.mp4',
): Promise<Probe> {
  const dir = await mkdtemp(join(tmpdir(), 'adpub-probe-'));
  const path = join(dir, filename.replace(/[^\w.-]/g, '_'));
  try {
    await writeFile(path, bytes);
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
    const durationSeconds = Number(parsed.format?.duration ?? video?.duration ?? 0);
    return {
      kind: 'video',
      width: video?.width ?? 0,
      height: video?.height ?? 0,
      durationMs: Number.isFinite(durationSeconds) ? Math.round(durationSeconds * 1000) : null,
      mime,
    };
  } catch (error) {
    if (isMissingBinary(error)) {
      throw new Error(
        'ffprobe não encontrado. Instale o ffmpeg para importar vídeos (brew install ffmpeg).',
        { cause: error },
      );
    }
    throw error;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
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

/** Extrai o primeiro segundo do vídeo como thumbnail (R8). */
export async function makeVideoThumbnail(
  bytes: Uint8Array,
  filename = 'video.mp4',
): Promise<Uint8Array> {
  const dir = await mkdtemp(join(tmpdir(), 'adpub-thumb-'));
  const input = join(dir, filename.replace(/[^\w.-]/g, '_'));
  const output = join(dir, 'thumb.jpg');
  try {
    await writeFile(input, bytes);
    await exec('ffmpeg', ['-y', '-ss', '1', '-i', input, '-frames:v', '1', '-q:v', '3', output]);
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
