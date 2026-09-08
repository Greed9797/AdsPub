"use server";

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ApiError, api } from '@/lib/api';
import { requireSession } from '@/lib/session';
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

export type ImportarDriveResult =
  | {
      sucesso: true;
      job_id: string;
      queue: string;
    }
  | {
      erro: string;
    };

export async function enviarCriativos(formData: FormData): Promise<UploadCriativosResult> {
  try {
    await requireSession();

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

export async function importarDoDrive(formData: FormData): Promise<ImportarDriveResult> {
  try {
    await requireSession();

    const payload = importDriveSchema.parse({
      client_id: formData.get('client_id'),
      folder_url: formData.get('folder_url'),
      recursive: formData.get('recursive'),
    });

    const job = await api<{ job_id: string; queue: string }>('/assets/import-drive', {
      method: 'POST',
      body: {
        client_id: payload.client_id,
        folder_url: payload.folder_url,
        recursive: payload.recursive,
      },
    });

    revalidatePath('/criativos');
    return { sucesso: true, job_id: job.job_id, queue: job.queue };
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
