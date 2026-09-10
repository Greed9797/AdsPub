import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** T-006-1: tetos anti-abuso para mídia não confiável. */
export const SAMPLE_LIMITS = {
  maxBytes: 50 * 1024 * 1024,
  maxDurationMs: 60_000,
  maxFrames: 12,
  frameWidth: 640,
} as const;

export interface Frame {
  /** Segundos desde o início, com 1 casa. */
  t: number;
  jpeg: Uint8Array;
}

export interface Sample {
  durationMs: number;
  frames: Frame[];
  /** Intervalos observados em segundos; resto = não-inspecionado. */
  observed: Array<[number, number]>;
  audioWav: Uint8Array | null;
}

function run(binary: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(binary, args, { timeout: 60_000 }, (error, stdout, stderr) => {
      if (error) {
        const missing =
          (error as NodeJS.ErrnoException).code === 'ENOENT' ||
          /not found|No such file/i.test(String(stderr));
        reject(
          new Error(
            missing
              ? `${binary} não encontrado. Instale o ffmpeg.`
              : `${binary} falhou: ${String(stderr).slice(0, 300)}`,
            { cause: error },
          ),
        );
        return;
      }
      resolve(stdout);
    });
  });
}

/**
 * Grade de amostragem pura (testável sem ffmpeg): abertura densa + resto +
 * CTA. Duração em ms, retorno em segundos.
 */
export function sampleTimestamps(durationMs: number, maxFrames: number = SAMPLE_LIMITS.maxFrames): number[] {
  const total = durationMs / 1000;
  const points = new Set<number>();
  for (const t of [0, 0.5, 1, 1.5, 2, 3]) {
    if (t < total) points.add(Math.round(t * 10) / 10);
  }
  const rest = Math.max(0, maxFrames - points.size - 1);
  for (let i = 1; i <= rest; i += 1) {
    const t = 3 + ((total - 3 - 0.5) * i) / (rest + 1);
    if (t < total - 0.25) points.add(Math.round(t * 10) / 10);
  }
  if (total > 0.5) points.add(Math.round((total - 0.25) * 10) / 10);
  return [...points].sort((a, b) => a - b).slice(0, maxFrames);
}

/** Duração via ffprobe (ms). */
export async function probeDurationMs(bytes: Uint8Array, filename: string): Promise<number> {
  const dir = await mkdtemp(join(tmpdir(), 'adpub-dur-'));
  const input = join(dir, filename.replace(/[^\w.-]/g, '_'));
  try {
    await writeFile(input, bytes);
    const stdout = await run('ffprobe', [
      '-v', 'error', '-print_format', 'json', '-show_format', input,
    ]);
    const parsed = JSON.parse(stdout) as { format?: { duration?: string } };
    return Math.round(Number(parsed.format?.duration ?? 0) * 1000);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Frames + áudio. Imagem estática = 1 frame em t=0 (sem estatística de vídeo). */
export async function sampleVideo(
  bytes: Uint8Array,
  filename: string,
  opts: { maxFrames?: number } = {},
): Promise<Sample> {
  if (bytes.length > SAMPLE_LIMITS.maxBytes) {
    throw new Error(`Mídia excede ${SAMPLE_LIMITS.maxBytes} bytes.`);
  }
  const durationMs = await probeDurationMs(bytes, filename);
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error('Duração ilegível.');
  if (durationMs > SAMPLE_LIMITS.maxDurationMs) {
    throw new Error(`Vídeo excede ${SAMPLE_LIMITS.maxDurationMs / 1000}s para análise.`);
  }
  const timestamps = sampleTimestamps(durationMs, opts.maxFrames);
  const dir = await mkdtemp(join(tmpdir(), 'adpub-sample-'));
  const input = join(dir, filename.replace(/[^\w.-]/g, '_'));
  try {
    await writeFile(input, bytes);
    const frames: Frame[] = [];
    for (const t of timestamps) {
      const output = join(dir, `f-${String(t).replace('.', '_')}.jpg`);
      await run('ffmpeg', [
        '-y', '-v', 'error', '-ss', String(t), '-i', input,
        '-frames:v', '1', '-vf', `scale=${SAMPLE_LIMITS.frameWidth}:-1`, '-q:v', '4', output,
      ]);
      frames.push({ t, jpeg: new Uint8Array(await readFile(output)) });
    }
    let audioWav: Uint8Array | null = null;
    try {
      const audioOut = join(dir, 'audio.wav');
      await run('ffmpeg', ['-y', '-v', 'error', '-i', input, '-vn', '-ar', '16000', '-ac', '1', audioOut]);
      audioWav = new Uint8Array(await readFile(audioOut));
    } catch {
      audioWav = null;
    }
    const observed: Array<[number, number]> = timestamps.map((t) => [t, Math.min(t + 0.5, durationMs / 1000)]);
    return { durationMs, frames, observed, audioWav };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
