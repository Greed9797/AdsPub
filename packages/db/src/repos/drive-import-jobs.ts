import { and, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { driveImportJobs } from '../schema.js';
import type { DriveImportJobRow } from '../schema.js';
import type { Database } from '../client.js';

export type { DriveImportJobRow };

/**
 * Importação do Drive observável: o job vive no banco, não só no Redis. Redis
 * reinicia e descarta concluído; o usuário precisa continuar vendo "na fila",
 * "rodando", "pronto" ou "falhou" — mesmo padrão de `analysis_jobs`.
 */

/** Última importação do cliente, se houver — a tela mostra sem pedir de novo. */
export async function findLatestDriveImportJob(
  db: Database,
  clientId: string,
): Promise<DriveImportJobRow | undefined> {
  const [row] = await db
    .select()
    .from(driveImportJobs)
    .where(eq(driveImportJobs.clientId, clientId))
    .orderBy(desc(driveImportJobs.queuedAt))
    .limit(1);
  return row;
}

/** Importação em aberto do cliente/pasta — pedir de novo é redundante. */
export async function findActiveDriveImportJob(
  db: Database,
  input: { clientId: string; folderUrl: string },
): Promise<DriveImportJobRow | undefined> {
  const [row] = await db
    .select()
    .from(driveImportJobs)
    .where(
      and(
        eq(driveImportJobs.clientId, input.clientId),
        eq(driveImportJobs.folderUrl, input.folderUrl),
        inArray(driveImportJobs.status, ['queued', 'running']),
      ),
    )
    .orderBy(desc(driveImportJobs.queuedAt))
    .limit(1);
  return row;
}

/** Pasta já tem job aberto (`queued`/`running`): o pedido é redundante. */
export class DriveImportOpenError extends Error {
  readonly job: DriveImportJobRow;
  constructor(job: DriveImportJobRow) {
    super('Pasta já tem importação em aberto.');
    this.name = 'DriveImportOpenError';
    this.job = job;
  }
}

export async function createDriveImportJob(
  db: Database,
  input: {
    clientId: string;
    folderUrl: string;
    recursive: boolean;
    requestedBy: string | null;
  },
): Promise<DriveImportJobRow> {
  // Dois POSTs concorrentes passam juntos pelo `findActive`: o índice único
  // parcial barra o segundo aqui e ele volta ao job vivo, sem duplicar.
  const [row] = await db
    .insert(driveImportJobs)
    .values({
      clientId: input.clientId,
      folderUrl: input.folderUrl,
      recursive: input.recursive,
      requestedBy: input.requestedBy,
    })
    .onConflictDoNothing({
      target: [driveImportJobs.clientId, driveImportJobs.folderUrl],
      where: sql`${driveImportJobs.status} in ('queued', 'running')`,
    })
    .returning();
  if (row) return row;
  const active = await findActiveDriveImportJob(db, {
    clientId: input.clientId,
    folderUrl: input.folderUrl,
  });
  if (active) throw new DriveImportOpenError(active);
  throw new Error('Falha ao criar job de importação do Drive.');
}

export async function getDriveImportJob(
  db: Database,
  id: string,
): Promise<DriveImportJobRow | undefined> {
  const [row] = await db.select().from(driveImportJobs).where(eq(driveImportJobs.id, id)).limit(1);
  return row;
}

/**
 * Reivindica a execução do job numa transição atômica. Sem isso duas entregas
 * do Redis liam `queued` juntas e importavam a pasta duas vezes; a perdedora
 * agora volta sem rodar (idempotente).
 *
 * `running` com batida antiga é órfão (worker morreu após o claim sem
 * concluir): volta para a fila em vez de travar a pasta para sempre atrás do
 * índice único parcial. O teto segue o padrão dos leases do repo
 * (`DRAFT_LEASE_MS`): importação baixa arquivos de até 500 MB, então 30 min
 * cobre pasta grande sem ressuscitar job saudável.
 */
export const DRIVE_STUCK_MS = 30 * 60 * 1000;

export async function claimDriveImportJob(
  db: Database,
  id: string,
  stuckMs: number = DRIVE_STUCK_MS,
): Promise<DriveImportJobRow | null> {
  const [row] = await db
    .update(driveImportJobs)
    .set({
      status: 'running',
      startedAt: sql`coalesce(${driveImportJobs.startedAt}, now())`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(driveImportJobs.id, id),
        or(
          eq(driveImportJobs.status, 'queued'),
          and(
            eq(driveImportJobs.status, 'running'),
            lt(driveImportJobs.updatedAt, new Date(Date.now() - stuckMs)),
          ),
        ),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Devolve órfão para a fila: `running` com batida antiga → `queued`.
 * A retomada pela rota usa isto, não o `claim`: o claim manteria `running`
 * com batida nova e o worker veria `running` recente e voltaria sem executar.
 * Atômica: dois POSTs concorrentes, um vence; o perdedor dedupa.
 */
export async function requeueDriveImportJob(
  db: Database,
  id: string,
  stuckMs: number = DRIVE_STUCK_MS,
): Promise<DriveImportJobRow | null> {
  const [row] = await db
    .update(driveImportJobs)
    .set({ status: 'queued', updatedAt: new Date() })
    .where(
      and(
        eq(driveImportJobs.id, id),
        eq(driveImportJobs.status, 'running'),
        lt(driveImportJobs.updatedAt, new Date(Date.now() - stuckMs)),
      ),
    )
    .returning();
  return row ?? null;
}

export async function markDriveImportJobStarted(db: Database, id: string): Promise<void> {
  await db
    .update(driveImportJobs)
    .set({
      status: 'running',
      startedAt: sql`coalesce(${driveImportJobs.startedAt}, now())`,
      updatedAt: new Date(),
    })
    .where(eq(driveImportJobs.id, id));
}

export async function finishDriveImportJob(
  db: Database,
  id: string,
  result: { imported: number; reused: number; rejected: Array<{ filename: string; reason: string }> },
): Promise<void> {
  await db
    .update(driveImportJobs)
    .set({
      status: 'done',
      imported: result.imported,
      reused: result.reused,
      rejected: result.rejected,
      error: null,
      finishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(driveImportJobs.id, id));
}

export async function failDriveImportJob(db: Database, id: string, error: string): Promise<void> {
  await db
    .update(driveImportJobs)
    .set({
      status: 'failed',
      error: error.slice(0, 500),
      finishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(driveImportJobs.id, id));
}

/** Espera na fila vs execução: diz se o gargalo é fila ou download. */
export function driveImportJobTimings(
  job: Pick<DriveImportJobRow, 'queuedAt' | 'startedAt' | 'finishedAt'>,
): { queueWaitMs: number | null; runMs: number | null } {
  return {
    queueWaitMs: job.startedAt ? job.startedAt.getTime() - job.queuedAt.getTime() : null,
    runMs:
      job.startedAt && job.finishedAt ? job.finishedAt.getTime() - job.startedAt.getTime() : null,
  };
}
