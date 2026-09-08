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
});
