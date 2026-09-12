import { aiUsage } from '../schema.js';
import type { Database } from '../client.js';

export interface AiUsageInput {
  purpose: string;
  model: string;
  status: 'ok' | 'provider_error';
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number;
  latencyMs: number;
  error?: string;
  clientId?: string | null;
  batchId?: string | null;
  assetId?: string | null;
}

/** A11: toda tentativa que chegou ao provedor vira uma linha de consumo. */
export async function saveAiUsage(db: Database, input: AiUsageInput): Promise<void> {
  await db.insert(aiUsage).values({
    purpose: input.purpose,
    model: input.model,
    status: input.status,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    cacheReadTokens: input.cacheReadTokens,
    cacheCreationTokens: input.cacheCreationTokens,
    costUsd: input.costUsd.toFixed(6),
    latencyMs: input.latencyMs,
    error: input.error ?? null,
    clientId: input.clientId ?? null,
    batchId: input.batchId ?? null,
    assetId: input.assetId ?? null,
  });
}
