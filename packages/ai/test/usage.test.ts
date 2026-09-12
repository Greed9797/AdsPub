import { describe, expect, it, vi } from 'vitest';
import { trackedInvoker, type AiInvoker, type AiUsageEvent } from '../src/index.js';

const request = {
  model: 'claude-sonnet-4-6',
  system: 's',
  prompt: 'p',
  toolName: 't',
  toolDescription: 'd',
  inputSchema: {},
  purpose: 'plan' as const,
  attribution: { clientId: 'cliente-1', batchId: 'lote-1' },
};

describe('trackedInvoker', () => {
  it('registra consumo, custo e atribuição de cada resposta do provedor', async () => {
    const events: AiUsageEvent[] = [];
    const invoke = trackedInvoker(
      async () => ({ input: { ok: true }, inputTokens: 1000, outputTokens: 500 }),
      (event) => {
        events.push(event);
      },
    );

    const result = await invoke(request);

    expect(result.input).toEqual({ ok: true });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      purpose: 'plan',
      model: 'claude-sonnet-4-6',
      status: 'ok',
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 0,
      attribution: { clientId: 'cliente-1', batchId: 'lote-1' },
    });
    expect(events[0]!.costUsd).toBeCloseTo((1000 * 3 + 500 * 15) / 1_000_000, 9);
    expect(events[0]!.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('cobra leitura de cache mais barata que entrada nova', async () => {
    const events: AiUsageEvent[] = [];
    const invoke = trackedInvoker(
      async () => ({
        input: {},
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 10_000,
        cacheCreationTokens: 2_000,
      }),
      (event) => {
        events.push(event);
      },
    );

    await invoke(request);

    // 10k lidos a 0,1x e 2k gravados a 1,25x do preço de entrada (3 USD/Mtok).
    const expected = (10_000 * 0.3 + 2_000 * 3.75) / 1_000_000;
    expect(events[0]!.costUsd).toBeCloseTo(expected, 9);
    expect(events[0]!.cacheReadTokens).toBe(10_000);
  });

  it('registra a tentativa mesmo quando o provedor falha, e propaga o erro', async () => {
    const events: AiUsageEvent[] = [];
    const invoke = trackedInvoker(
      async () => {
        throw new Error('timeout do provedor');
      },
      (event) => {
        events.push(event);
      },
    );

    await expect(invoke(request)).rejects.toThrow('timeout do provedor');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ status: 'provider_error', costUsd: 0 });
    expect(events[0]!.error).toContain('timeout do provedor');
  });

  it('falha de contabilidade não derruba a geração', async () => {
    const onRecordError = vi.fn();
    const invoke = trackedInvoker(
      async () => ({ input: { ok: true }, inputTokens: 10, outputTokens: 5 }),
      () => {
        throw new Error('banco fora');
      },
      { onRecordError },
    );

    await expect(invoke(request)).resolves.toMatchObject({ input: { ok: true } });
    expect(onRecordError).toHaveBeenCalledTimes(1);
  });

  it('sem gravador não muda o invoker', async () => {
    const base: AiInvoker = async () => ({ input: {}, inputTokens: 1, outputTokens: 1 });
    expect(trackedInvoker(base, undefined)).toBe(base);
  });
});
