import { DelayedError, UnrecoverableError, type Job } from 'bullmq';
import type { Alerter } from '../alerts.js';
import type { WorkerContext } from '../context.js';
import type { MetaFactory } from '../meta.js';
import { DraftBusyError, AccountAuthError, ReconciliationRequiredError, runPublish, type PublishJobData } from './pipeline.js';

/** Espera até o lease do dono expirar, com piso para contenção normal. */
export const CONTENTION_MIN_MS = 2_000;
export const CONTENTION_MAX_MS = 30_000;

export function contentionDelayMs(until: Date | null, now: number = Date.now()): number {
  const restante = until ? until.getTime() - now : 0;
  return Math.min(Math.max(restante, CONTENTION_MIN_MS), CONTENTION_MAX_MS);
}

/**
 * Processador da fila de publicação.
 *
 * Contenção de lease não é falha do item: outro worker está publicando este
 * draft. Consumir tentativa aqui mataria em `failed` um item que só precisava
 * esperar — e quando o dono morre sem liberar, a espera é a expiração do lease,
 * que é maior que todas as tentativas somadas. `moveToDelayed` + `DelayedError`
 * reagenda sem gastar tentativa.
 */
export function createPublishProcessor(
  ctx: WorkerContext,
  meta: MetaFactory,
  alert: Alerter,
): (job: Job<PublishJobData>, token?: string) => Promise<{ status: string; adId?: string }> {
  return async (job, token) => {
    try {
      return await runPublish(ctx, meta, alert, job.data, job.attemptsMade + 1);
    } catch (error) {
      if (error instanceof DraftBusyError && token) {
        await job.moveToDelayed(Date.now() + contentionDelayMs(error.until), token);
        throw new DelayedError();
      }
      // T-000-2: reconciliação não é falha transitória — encerra o job sem gastar tentativas.
      if (error instanceof ReconciliationRequiredError) throw new UnrecoverableError(error.message);
      // T-001-1: sem autorização não há o que reagendar — humano reconecta.
      if (error instanceof AccountAuthError) throw new UnrecoverableError(error.message);
      throw error;
    }
  };
}
