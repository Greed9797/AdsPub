import { costUsd } from './cost.js';
import type { AiInvoker, AiUsageAttribution, AiUsagePurpose } from './invoker.js';

/**
 * Registro de cada tentativa que chegou ao provedor. A tentativa existe
 * mesmo quando a resposta é recusada na validação depois: o dinheiro já foi
 * gasto, então o consumo precisa estar registrado antes de qualquer schema.
 */
export interface AiUsageEvent {
  purpose: AiUsagePurpose;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number;
  latencyMs: number;
  status: 'ok' | 'provider_error';
  error?: string;
  attribution?: AiUsageAttribution;
}

export type AiUsageRecorder = (event: AiUsageEvent) => Promise<void> | void;

export interface TrackedInvokerOptions {
  /**
   * Falha de contabilidade nunca derruba geração: o erro do gravador é
   * engolido e reportado em `onRecordError`.
   */
  onRecordError?: (error: unknown) => void;
}

/** Envolve o invoker para medir e registrar consumo por chamada. */
export function trackedInvoker(
  invoke: AiInvoker,
  record: AiUsageRecorder | undefined,
  options: TrackedInvokerOptions = {},
): AiInvoker {
  if (!record) return invoke;
  const write = async (event: AiUsageEvent) => {
    try {
      await record(event);
    } catch (error) {
      options.onRecordError?.(error);
    }
  };
  return async (request) => {
    const started = Date.now();
    try {
      const result = await invoke(request);
      const cacheTokens = {
        readTokens: result.cacheReadTokens ?? 0,
        creationTokens: result.cacheCreationTokens ?? 0,
        reasoningTokens: result.reasoningTokens ?? 0,
      };
      await write({
        purpose: request.purpose ?? 'unknown',
        model: request.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        cacheReadTokens: cacheTokens.readTokens,
        cacheCreationTokens: cacheTokens.creationTokens,
        costUsd: costUsd(request.model, result.inputTokens, result.outputTokens, cacheTokens),
        latencyMs: Date.now() - started,
        status: 'ok',
        ...(request.attribution ? { attribution: request.attribution } : {}),
      });
      return result;
    } catch (error) {
      await write({
        purpose: request.purpose ?? 'unknown',
        model: request.model,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        costUsd: 0,
        latencyMs: Date.now() - started,
        status: 'provider_error',
        error: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
        ...(request.attribution ? { attribution: request.attribution } : {}),
      });
      throw error;
    }
  };
}
