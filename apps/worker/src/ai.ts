import { existsSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import {
  AiClient,
  anthropicInvoker,
  opencodeInvoker,
  resolveOpencodeAuthPath,
  trackedInvoker,
  type AiInvoker,
  type AiUsageEvent,
} from '@adpub/ai';
import { saveAiUsage } from '@adpub/db';
import type { WorkerContext } from './context.js';

/**
 * A9: o worker também gasta IA (análise de mídia) e essa conta precisa cair
 * na mesma contabilidade da API — `ai_usage`, uma linha por tentativa.
 *
 * Com `AI_ANALYSIS_PROVIDER=opencode`, só a análise de mídia usa Muse via
 * OpenCode; o resto do AiClient continua no Anthropic. Provedor selecionado
 * mas indisponível (binário/auth/modelo) é erro explícito — sem fallback.
 */
export function createWorkerAi(ctx: WorkerContext): AiClient | undefined {
  if (!ctx.env.ANTHROPIC_API_KEY) return undefined;
  const recordUsage = (event: AiUsageEvent) =>
    saveAiUsage(ctx.db, {
      ...event,
      clientId: event.attribution?.clientId ?? null,
      batchId: event.attribution?.batchId ?? null,
      assetId: event.attribution?.assetId ?? null,
    });
  const base = {
    invoke: trackedInvoker(anthropicInvoker(ctx.env.ANTHROPIC_API_KEY), recordUsage, {
      onRecordError: (error) => {
        ctx.log.warn({ err: String(error) }, 'falha ao registrar consumo de IA');
      },
    }),
    models: { generation: ctx.env.AI_MODEL_GENERATION, classify: ctx.env.AI_MODEL_CLASSIFY },
    timeoutMs: ctx.env.AI_PLAN_TIMEOUT_MS,
  };
  if (ctx.env.AI_ANALYSIS_PROVIDER !== 'opencode') return new AiClient(base);
  if (!ctx.env.OPENCODE_BIN || !isAbsolute(ctx.env.OPENCODE_BIN) || !existsSync(ctx.env.OPENCODE_BIN)) {
    throw new Error('AI_ANALYSIS_PROVIDER=opencode sem binário utilizável (OPENCODE_BIN ausente ou inválido).');
  }
  const authPath = resolveOpencodeAuthPath();
  if (!existsSync(authPath)) {
    throw new Error(`AI_ANALYSIS_PROVIDER=opencode sem autenticação Go (${authPath} ausente).`);
  }
  if (!ctx.env.OPENCODE_ANALYSIS_MODEL) {
    throw new Error('AI_ANALYSIS_PROVIDER=opencode sem modelo (OPENCODE_ANALYSIS_MODEL vazio).');
  }
  return new AiClient({
    ...base,
    content: {
      invoke: trackedInvoker(opencodeInvoker({ binary: ctx.env.OPENCODE_BIN }), recordUsage, {
        onRecordError: (error) => {
          ctx.log.warn({ err: String(error) }, 'falha ao registrar consumo de IA');
        },
      }),
      model: ctx.env.OPENCODE_ANALYSIS_MODEL,
    },
  });
}

export type { AiInvoker };
