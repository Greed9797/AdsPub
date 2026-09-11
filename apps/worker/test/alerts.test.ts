import { PassThrough } from 'node:stream';
import pino from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAlerter, telegramFromEnv } from '../src/alerts.js';

const BOT = { botToken: '123456:AA-bot-token', chatId: '-100123' };

function captureLog(): { log: pino.Logger; linhas: () => string } {
  const stream = new PassThrough();
  let saida = '';
  stream.on('data', (chunk: Buffer) => {
    saida += chunk.toString();
  });
  return { log: pino({ level: 'debug' }, stream), linhas: () => saida };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createAlerter (R17)', () => {
  it('sem bot configurado, o alerta só vai para o log', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { log, linhas } = captureLog();

    await createAlerter(
      undefined,
      log,
    )({ title: 'Token vencido', detail: 'BM principal', severity: 'critical' });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(linhas()).toContain('Token vencido');
    expect(linhas()).toContain('BM principal');
  });

  it('manda severidade, título, detalhe e contexto para o chat', async () => {
    const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { log } = captureLog();

    await createAlerter(
      BOT,
      log,
    )({
      title: 'Lote com muitas falhas',
      detail: '3 de 10 itens falharam',
      severity: 'warning',
      context: { batch: 'abc' },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.telegram.org/bot${BOT.botToken}/sendMessage`);
    const body = JSON.parse(String(init.body)) as { chat_id: string; text: string };
    expect(body.chat_id).toBe(BOT.chatId);
    expect(body.text).toContain('[AdPub/warning] Lote com muitas falhas');
    expect(body.text).toContain('3 de 10 itens falharam');
    expect(body.text).toContain('{"batch":"abc"}');
  });

  it('falha de rede não lança e não deixa o token no log', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const cause = new Error(
          `request to https://api.telegram.org/bot${BOT.botToken}/sendMessage failed`,
        );
        throw new TypeError('fetch failed', { cause });
      }),
    );
    const { log, linhas } = captureLog();

    await expect(
      createAlerter(BOT, log)({ title: 'Rate limit', detail: 'conta 1', severity: 'warning' }),
    ).resolves.toBeUndefined();

    expect(linhas()).toContain('falha ao enviar alerta');
    expect(linhas()).not.toContain(BOT.botToken);
  });

  it('resposta não-2xx do Telegram não estoura o alerta', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"ok":false}', { status: 401 })),
    );
    const { log, linhas } = captureLog();

    await createAlerter(
      BOT,
      log,
    )({ title: 'Token da BM inválido', detail: 'BM principal', severity: 'critical' });

    expect(linhas()).toContain('Telegram recusou o alerta');
  });
});

describe('telegramFromEnv', () => {
  it('só monta o par completo', () => {
    expect(telegramFromEnv({})).toBeUndefined();
    expect(telegramFromEnv({ TELEGRAM_BOT_TOKEN: 'x' })).toBeUndefined();
    expect(telegramFromEnv({ TELEGRAM_CHAT_ID: '1' })).toBeUndefined();
    expect(telegramFromEnv({ TELEGRAM_BOT_TOKEN: 'x', TELEGRAM_CHAT_ID: '1' })).toEqual({
      botToken: 'x',
      chatId: '1',
    });
  });
});
