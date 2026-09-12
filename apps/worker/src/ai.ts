import { AiClient, anthropicInvoker, trackedInvoker, type AiInvoker } from '@adpub/ai';
import { saveAiUsage } from '@adpub/db';
import type { WorkerContext } from './context.js';

/**
 * A9: o worker também gasta IA (análise de mídia) e essa conta precisa cair
 * na mesma contabilidade da API — `ai_usage`, uma linha por tentativa.
 */
export function createWorkerAi(ctx: WorkerContext): AiClient | undefined {
  if (!ctx.env.ANTHROPIC_API_KEY) return undefined;
  return new AiClient({
    invoke: trackedInvoker(
      anthropicInvoker(ctx.env.ANTHROPIC_API_KEY),
      (event) =>
        saveAiUsage(ctx.db, {
          ...event,
          clientId: event.attribution?.clientId ?? null,
          batchId: event.attribution?.batchId ?? null,
          assetId: event.attribution?.assetId ?? null,
        }),
      {
        onRecordError: (error) => {
          ctx.log.warn({ err: String(error) }, 'falha ao registrar consumo de IA');
        },
      },
    ),
    models: { generation: ctx.env.AI_MODEL_GENERATION, classify: ctx.env.AI_MODEL_CLASSIFY },
    timeoutMs: ctx.env.AI_PLAN_TIMEOUT_MS,
  });
}

export type { AiInvoker };
