"use server";

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ApiError, api } from '@/lib/api';
import { requireRole, requireSession } from '@/lib/session';
import type { Asset } from '@/lib/types';

const booleanSchema = z.preprocess(
  (value) => {
    if (value === null || value === undefined) return false;
    if (value === 'on' || value === 'true' || value === '1') return true;
    if (value === 'off' || value === 'false' || value === '0') return false;
    return value;
  },
  z.boolean(),
);

const uploadSchema = z.object({
  client_id: z.string().uuid('Cliente inválido.'),
});

const importDriveSchema = z.object({
  client_id: z.string().uuid('Cliente inválido.'),
  folder_url: z.string().min(5, 'Informe a pasta do Drive.'),
  recursive: booleanSchema.default(false),
});

const filesSchema = z
  .array(z.custom<File>((value): value is File => value instanceof File, 'Arquivo inválido.'))
  .min(1, 'Selecione pelo menos um arquivo.');

export type UploadCriativosResult =
  | {
      sucesso: true;
      assets: Asset[];
    }
  | {
      erro: string;
    };

export interface DriveImportJobView {
  job_id: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  imported: number;
  reused: number;
  rejected: Array<{ filename: string; reason: string }>;
  error: string | null;
  queue_wait_ms: number | null;
  run_ms: number | null;
}

export type ImportarDriveResult =
  | {
      sucesso: true;
      job_id: string;
      queue: string;
      job: DriveImportJobView;
    }
  | {
      erro: string;
    };

export async function enviarCriativos(formData: FormData): Promise<UploadCriativosResult> {
  try {
    await requireRole(['admin', 'coordinator', 'manager']);

    const payload = uploadSchema.parse({
      client_id: formData.get('client_id'),
    });

    const files = formData.getAll('files').filter((value): value is File => {
      return value instanceof File && value.name.length > 0;
    });
    filesSchema.parse(files);

    const body = new FormData();
    body.append('client_id', payload.client_id);

    for (const file of files) {
      body.append('files', file, file.name);
    }

    const assets = await api<Asset[]>('/assets', {
      method: 'POST',
      formData: body,
    });

    revalidatePath('/criativos');
    return { sucesso: true, assets };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        erro: error.issues.map((issue) => issue.message).join(', '),
      };
    }

    if (error instanceof ApiError) {
      return {
        erro: error.problem.detail ?? error.problem.title,
      };
    }

    return {
      erro: 'Não foi possível enviar os criativos.',
    };
  }
}

export interface AnalysisView {
  id: string;
  model_id: string;
  revision: number;
  findings: {
    observations: Array<{ tipo: string; texto: string; evidence_refs: Array<{ kind: string; t?: number; detail: string }> }>;
    limitations: string[];
  };
}

/** A9: a API aceita o pedido e devolve o job; quem analisa é o worker. */
export interface AnalysisJobView {
  job_id: string;
  asset_id: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  error: string | null;
  queueWaitMs: number | null;
  runMs: number | null;
  analysis: AnalysisView | null;
}

/** T-006-2: enfileira a análise do criativo. */
export async function analisarCriativo(
  assetId: string,
): Promise<{ erro: string } | { ok: true; job_id: string; status: string }> {
  try {
    await requireRole(['admin', 'coordinator', 'manager']);
    const job = await api<{ job_id: string; status: string }>(`/assets/${assetId}/analyses`, {
      method: 'POST',
      body: {},
    });
    return { ok: true, job_id: job.job_id, status: job.status };
  } catch (error) {
    if (error instanceof ApiError) return { erro: error.problem.detail ?? error.problem.title };
    return { erro: 'Não foi possível pedir a análise do criativo.' };
  }
}

/** Acompanha o job até terminar; a lista é atualizada quando ele conclui. */
export async function acompanharAnalise(
  jobId: string,
): Promise<{ erro: string } | { ok: true; job: AnalysisJobView }> {
  try {
    await requireSession();
    const job = await api<AnalysisJobView>(`/analysis-jobs/${jobId}`);
    if (job.status === 'done' || job.status === 'failed') revalidatePath('/criativos');
    return { ok: true, job };
  } catch (error) {
    if (error instanceof ApiError) return { erro: error.problem.detail ?? error.problem.title };
    return { erro: 'Não foi possível acompanhar a análise.' };
  }
}

export async function importarDoDrive(formData: FormData): Promise<ImportarDriveResult> {
  try {
    await requireRole(['admin', 'coordinator', 'manager']);

    const payload = importDriveSchema.parse({
      client_id: formData.get('client_id'),
      folder_url: formData.get('folder_url'),
      recursive: formData.get('recursive'),
    });

    const job = await api<DriveImportJobView & { queue: string; queue_job_id: string | null }>(
      '/assets/import-drive',
      {
        method: 'POST',
        body: {
          client_id: payload.client_id,
          folder_url: payload.folder_url,
          recursive: payload.recursive,
        },
      },
    );

    revalidatePath('/criativos');
    return {
      sucesso: true,
      job_id: job.job_id,
      queue: job.queue,
      job: {
        job_id: job.job_id,
        status: job.status,
        imported: job.imported,
        reused: job.reused,
        rejected: job.rejected,
        error: job.error,
        queue_wait_ms: job.queue_wait_ms,
        run_ms: job.run_ms,
      },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        erro: error.issues.map((issue) => issue.message).join(', '),
      };
    }

    if (error instanceof ApiError) {
      return {
        erro: error.problem.detail ?? error.problem.title,
      };
    }

    return {
      erro: 'Não foi possível iniciar a importação do Drive.',
    };
  }
}

/**
 * Acompanha a importação: o worker roda fora da requisição e a linha do job
 * conta o estado. Revalidar só no fim evita recarregar a biblioteca a cada
 * poll — o resultado aparece quando termina.
 */
export async function acompanharImportacaoDrive(
  jobId: string,
): Promise<{ erro: string } | { ok: true; job: DriveImportJobView }> {
  try {
    await requireSession();
    const job = await api<DriveImportJobView>(`/drive-import-jobs/${jobId}`);
    if (job.status === 'done' || job.status === 'failed') revalidatePath('/criativos');
    return { ok: true, job };
  } catch (error) {
    if (error instanceof ApiError) return { erro: error.problem.detail ?? error.problem.title };
    return { erro: 'Não foi possível acompanhar a importação.' };
  }
}
