import { SYNC_EVERY_MS } from '@adpub/config';
import { listConnections, type Database } from '@adpub/db';
import type { SyncJobData } from './connection.js';

/**
 * Shape estrutural da fila: o genérico `Queue<SyncJobData>` do BullMQ amarra
 * `NameType` e não encaixa em assinatura própria — aqui só interessam os três
 * métodos de agendamento.
 */
export interface SchedulerQueue {
  upsertJobScheduler(
    id: string,
    repeat: { every: number },
    template?: { name?: string; data?: SyncJobData },
  ): Promise<unknown>;
  getJobSchedulers(): Promise<Array<{ key: string }>>;
  removeJobScheduler(id: string): Promise<boolean>;
}

const PREFIX = 'sync:';

export function syncSchedulerId(connectionId: string): string {
  return `${PREFIX}${connectionId}`;
}

/**
 * Deixa o agendamento de sync colado nas conexões que existem *agora*.
 *
 * Rodava só no boot do worker: conexão criada depois disso nunca entrava no
 * ciclo periódico (dependia de sync manual até alguém reiniciar o worker) e
 * conexão apagada ou revogada deixava agendador órfão enfileirando para sempre
 * um job que morre em "Conexão X não existe mais". Chamar isto no mesmo tique
 * do poller de revisão mantém os dois casos em dia sem processo novo.
 */
export async function reconcileSyncSchedulers(
  db: Database,
  queue: SchedulerQueue,
): Promise<number> {
  const connections = await listConnections(db);
  const vivas = new Set(
    connections.filter((item) => item.status !== 'revoked').map((item) => item.id),
  );

  for (const id of vivas) {
    await queue.upsertJobScheduler(
      syncSchedulerId(id),
      { every: SYNC_EVERY_MS },
      { name: 'sync', data: { connectionId: id } },
    );
  }

  for (const scheduler of await queue.getJobSchedulers()) {
    if (!scheduler.key.startsWith(PREFIX)) continue;
    if (vivas.has(scheduler.key.slice(PREFIX.length))) continue;
    await queue.removeJobScheduler(scheduler.key);
  }

  return vivas.size;
}
