import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { redactingLogger } from '../src/index.js';

const TOKEN = 'EAAsegredo';

function capture(): { stream: PassThrough; lines: () => string } {
  const stream = new PassThrough();
  const chunks: string[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));
  return { stream, lines: () => chunks.join('') };
}

describe('redactingLogger (Constituição VI / SC-006)', () => {
  it('mascara token por chave, em qualquer profundidade', () => {
    const { stream, lines } = capture();
    const log = redactingLogger('info', stream);

    log.error({ connection: { token: TOKEN }, access_token: TOKEN, label: 'BM' }, 'falhou');

    expect(lines()).not.toContain(TOKEN);
    expect(lines()).toContain('[redacted]');
    expect(lines()).toContain('BM');
  });

  it('mascara token que vem na query da URL, não só por chave', () => {
    const { stream, lines } = capture();
    const log = redactingLogger('info', stream);

    log.error(
      { url: `https://graph.facebook.com/v25.0/me?access_token=${TOKEN}&appsecret_proof=abc` },
      'graph 400',
    );

    expect(lines()).not.toContain(TOKEN);
    expect(lines()).toContain('access_token=[redacted]');
  });

  it('mascara token dentro da mensagem e do erro serializado', () => {
    const { stream, lines } = capture();
    const log = redactingLogger('info', stream);

    log.error(
      { err: new Error(`Graph 400: GET /me?access_token=${TOKEN}`) },
      `falha em /me?access_token=${TOKEN}`,
    );

    expect(lines()).not.toContain(TOKEN);
  });

  it('preserva mensagem e stack do Error, mascarados', () => {
    const { stream, lines } = capture();
    const log = redactingLogger('info', stream);

    log.error({ err: new Error(`falhou ?access_token=${TOKEN}`) }, 'graph 400');

    const entry = JSON.parse(lines().trim()) as {
      err?: { type?: string; message?: string; stack?: string };
    };
    expect(entry.err?.message).toBe('falhou ?access_token=[redacted]');
    expect(entry.err?.type).toBe('Error');
    expect(entry.err?.stack).toContain('logger.test.ts');
    expect(lines()).not.toContain(TOKEN);
  });

  it('mantém propriedades próprias do erro e mascara a causa', () => {
    const { stream, lines } = capture();
    const log = redactingLogger('info', stream);

    const err = Object.assign(new Error('externo'), {
      code: 190,
      cause: new Error(`GET /me?access_token=${TOKEN}`),
    });
    log.error({ err }, 'falha');

    const entry = JSON.parse(lines().trim()) as {
      err?: { code?: number; message?: string; stack?: string };
    };
    expect(entry.err?.code).toBe(190);
    // O pino achata a causa em `message`/`stack` ("caused by: ..."), já mascarada.
    expect(entry.err?.message).toContain('access_token=[redacted]');
    expect(entry.err?.stack).toContain('caused by');
    expect(lines()).not.toContain(TOKEN);
  });

  it('mascara o token que a Meta ecoa em texto livre (log real do worker)', () => {
    const { stream, lines } = capture();
    const log = redactingLogger('info', stream);
    const tokenReal = 'EAA-token-de-system-user-1234567890';

    // Linha reproduzida do boot do worker: `err` é string, sem chave=valor.
    log.warn(
      { queue: 'adpub.sync', err: `Malformed access token ${tokenReal}` },
      'job falhou',
    );

    expect(lines()).not.toContain(tokenReal);
    expect(lines()).toContain('Malformed access token [redacted]');
    expect(lines()).toContain('adpub.sync');
  });

  it('não transforma Date e Buffer em objeto vazio', () => {
    const { stream, lines } = capture();
    const log = redactingLogger('info', stream);

    log.info({ quando: new Date('2026-09-08T10:00:00.000Z'), bytes: Buffer.from('abc') }, 'ok');

    const entry = JSON.parse(lines().trim()) as { quando?: unknown; bytes?: unknown };
    expect(entry.quando).toBe('2026-09-08T10:00:00.000Z');
    expect(entry.bytes).not.toEqual({});
  });
});
