import { PassThrough } from 'node:stream';
import { redactingLogger } from '@adpub/telemetry';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { ApiDeps } from '../src/lib/deps.js';

/** O boot com logger não toca banco nem fila: só precisa do objeto injetado. */
const deps = {
  env: {
    authSecret: 'segredo-de-teste-com-tamanho-suficiente',
    allowedDomain: 'empresa.com.br',
    metaApiVersion: 'v25.0',
    metaTier: 'limited',
    usePolicyAi: false,
  },
} as unknown as ApiDeps;

const TOKEN = 'EAAsegredo';

/** Espera a linha de log chegar ao destino, sem depender de relógio. */
function waitForLine(stream: PassThrough, marker: string): Promise<string> {
  return new Promise((resolve) => {
    let saida = '';
    stream.on('data', (chunk: Buffer) => {
      saida += chunk.toString();
      if (saida.includes(marker)) resolve(saida);
    });
  });
}

describe('boot da API com logger ligado', () => {
  it('sobe com instância própria de logger e mascara token', async () => {
    const stream = new PassThrough();
    const app = await buildApp(deps, { logger: redactingLogger('info', stream) });
    try {
      const pedido = waitForLine(stream, 'request completed');
      const health = await app.inject({ method: 'GET', url: '/health' });
      expect(health.statusCode).toBe(200);

      // O mascaramento não pode achatar `req`/`res` do Fastify em `{}`.
      const requisicao = await pedido;
      expect(requisicao).toContain('"method":"GET"');
      expect(requisicao).toContain('"url":"/health"');
      expect(requisicao).toContain('"statusCode":200');

      const linha = waitForLine(stream, 'graph 400');
      app.log.error({ err: new Error(`GET /me?access_token=${TOKEN}`) }, 'graph 400');

      const saida = await linha;
      expect(saida).not.toContain(TOKEN);
      expect(saida).toContain('"message":"GET /me?access_token=[redacted]"');
      expect(saida).toContain('"type":"Error"');
    } finally {
      await app.close();
    }
  });

  it('sobe com `logger: true` usando o redator padrão', async () => {
    const app = await buildApp(deps, { logger: true });
    try {
      const health = await app.inject({ method: 'GET', url: '/health' });
      expect(health.statusCode).toBe(200);
      expect(app.log.level).toBe('info');
    } finally {
      await app.close();
    }
  });
});
