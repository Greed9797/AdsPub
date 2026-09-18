import {
  beginMetaWrite,
  finishMetaWrite,
  lostMetaWrite,
  type LostWrite,
  type MetaWriteIntent,
} from '@adpub/db';
import type { WorkerContext } from '../context.js';

/**
 * Escrita que saiu do app sem desfecho conhecido. Recriar o objeto seria o
 * segundo anúncio/campanha na Meta, então quem decide é humano.
 */
export class LostWriteError extends Error {
  constructor(readonly write: LostWrite) {
    super(
      `${write.method} ${write.endpoint} enviada em ${write.sentAt.toISOString()} sem desfecho conhecido.`,
    );
    this.name = 'LostWriteError';
  }
}

/**
 * Registra a escrita antes de emitir e fecha com o desfecho observado. A
 * janela protegida é a morte do processo entre o POST e a persistência do ID:
 * erro visto em processo fecha a linha e segue pelo caminho de erro normal.
 */
export async function withMetaWrite<T>(
  ctx: WorkerContext,
  intent: MetaWriteIntent,
  run: () => Promise<T>,
): Promise<T> {
  const id = await beginMetaWrite(ctx.db, intent);
  try {
    const result = await run();
    // Fechar a linha é contabilidade: a escrita deu certo e o ID é persistido
    // no passo seguinte. Derrubar a publicação por um soluço no banco mandaria
    // o item para reconciliação sem motivo — a linha fica pendente, e a
    // reentrada com `ad_id`/`creative_id` salvo nem consulta o guarda.
    await finishMetaWrite(ctx.db, id, 'ok').catch((error: unknown) =>
      ctx.log.warn({ err: error, write: id }, 'escrita concluída sem fechar o registro'),
    );
    return result;
  } catch (error) {
    // Se o fechamento falhar, a linha fica pendente e a próxima tentativa
    // exige reconciliação — direção segura; o erro da Meta é o que interessa.
    await finishMetaWrite(ctx.db, id, 'failed').catch(() => undefined);
    throw error;
  }
}

/** Porta de entrada de toda recriação: escrita perdida não pode virar retry. */
export async function assertNoLostWrite(ctx: WorkerContext, writeKey: string): Promise<void> {
  const lost = await lostMetaWrite(ctx.db, writeKey);
  if (lost) throw new LostWriteError(lost);
}
