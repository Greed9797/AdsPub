import { describe, expect, it } from 'vitest';
import { detectAspectRatio, validateMedia, type MediaInput } from '../src/media.js';

const image = (over: Partial<MediaInput> = {}): MediaInput => ({
  kind: 'image',
  mime: 'image/jpeg',
  width: 1080,
  height: 1350,
  sizeBytes: 2_000_000,
  filename: 'inverno-01.jpg',
  ...over,
});

const video = (over: Partial<MediaInput> = {}): MediaInput => ({
  kind: 'video',
  mime: 'video/mp4',
  width: 1080,
  height: 1920,
  durationMs: 20_000,
  sizeBytes: 30_000_000,
  filename: 'reel.mp4',
  ...over,
});

describe('detectAspectRatio', () => {
  it.each([
    [1080, 1080, '1:1'],
    [1080, 1350, '4:5'],
    [1080, 1920, '9:16'],
    [1920, 1080, '16:9'],
    [1200, 628, '1.91:1'],
    [800, 600, 'other'],
    [0, 100, 'other'],
  ])('%i×%i → %s', (w, h, expected) => {
    expect(detectAspectRatio(w, h)).toBe(expected);
  });

  it('tolera arredondamento de exportação (1080×1349)', () => {
    expect(detectAspectRatio(1080, 1349)).toBe('4:5');
  });
});

describe('validateMedia — imagem', () => {
  it('aceita 1080×1350 jpeg', () => {
    const result = validateMedia(image());
    expect(result.status).toBe('ok');
    expect(result.errors).toEqual([]);
    expect(result.aspect_ratio).toBe('4:5');
  });

  it('rejeita 800×600 com motivo de proporção', () => {
    const result = validateMedia(image({ width: 800, height: 600 }));
    expect(result.status).toBe('rejected');
    expect(result.errors.join(' ')).toMatch(/Propor[çc][ãa]o não suportada/);
  });

  it('rejeita imagem menor que 600 px sugerindo reexportar', () => {
    const result = validateMedia(image({ width: 480, height: 480 }));
    expect(result.status).toBe('rejected');
    expect(result.errors.join(' ')).toContain('1080×1350');
  });

  it('rejeita mime não suportado', () => {
    const result = validateMedia(image({ mime: 'image/gif' }));
    expect(result.errors.join(' ')).toMatch(/não suportado/);
  });

  it('rejeita arquivo acima do limite de tamanho', () => {
    const result = validateMedia(image({ sizeBytes: 40 * 1024 * 1024 }));
    expect(result.errors.join(' ')).toMatch(/maior que o limite/);
  });

  it('avisa sobre 16:9 sem rejeitar', () => {
    const result = validateMedia(image({ width: 1920, height: 1080 }));
    expect(result.status).toBe('ok');
    expect(result.warnings.join(' ')).toMatch(/Reels\/Stories/);
  });
});

describe('validateMedia — vídeo', () => {
  it('aceita 9:16 de 20 s', () => {
    expect(validateMedia(video()).status).toBe('ok');
  });

  it('rejeita vídeo acima do limite configurado', () => {
    const result = validateMedia(video({ durationMs: 120_000 }));
    expect(result.errors.join(' ')).toMatch(/longo demais/);
  });

  it('rejeita vídeo sem duração legível', () => {
    const result = validateMedia(video({ durationMs: null }));
    expect(result.errors.join(' ')).toMatch(/duração/);
  });

  it('rejeita vídeo acima de 500 MB', () => {
    const result = validateMedia(video({ sizeBytes: 600 * 1024 * 1024 }));
    expect(result.errors.join(' ')).toMatch(/maior que o limite/);
  });

  it('rejeita codec fora do H.264 (a Meta não transcodifica HEVC)', () => {
    const result = validateMedia(video({ videoCodec: 'hevc' }));
    expect(result.status).toBe('rejected');
    expect(result.errors.join(' ')).toMatch(/HEVC não é aceito pela Meta/);
  });

  it('aceita H.264 com áudio AAC sem avisar', () => {
    const result = validateMedia(video({ videoCodec: 'h264', audioCodec: 'aac', frameRate: 30 }));
    expect(result.status).toBe('ok');
    expect(result.warnings).toHaveLength(0);
  });

  it('rejeita vídeo acima de 60 fps', () => {
    const result = validateMedia(video({ videoCodec: 'h264', frameRate: 120 }));
    expect(result.errors.join(' ')).toMatch(/até 60 fps/);
  });

  it('avisa sobre áudio fora do AAC sem rejeitar', () => {
    const result = validateMedia(video({ videoCodec: 'h264', audioCodec: 'mp3' }));
    expect(result.status).toBe('ok');
    expect(result.warnings.join(' ')).toMatch(/prefere AAC/);
  });

  it('não opina quando o probe não trouxe codec', () => {
    const result = validateMedia(video());
    expect(result.status).toBe('ok');
    expect(result.errors).toHaveLength(0);
  });
});
