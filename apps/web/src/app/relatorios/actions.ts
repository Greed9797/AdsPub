"use server";

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { api, ApiError } from '@/lib/api';
import { requireRole } from '@/lib/session';

export interface PreviewRow {
  row_number: number;
  status: string;
  errors: Array<{ code: string; field: string; message: string }>;
  observation: {
    adId: string | null;
    grain: string;
    metrics: Record<string, number | string>;
  } | null;
}

export interface ReportPreview {
  import_id: string;
  status: string;
  mapping: Record<string, string | null>;
  mapping_version: string;
  unmapped: string[];
  valid: number;
  invalid: number;
  rows: PreviewRow[];
}

type ActionError = { erro: string };
export type UploadRelatorioResult = ActionError | (ReportPreview & { ok: true });
export type CommitRelatorioResult = ActionError | { ok: true; observations: number };

function errorFromException(error: unknown, fallback: string): ActionError {
  if (error instanceof ApiError) return { erro: error.problem.detail ?? fallback };
  if (error instanceof z.ZodError) return { erro: error.issues[0]?.message ?? 'Dados inválidos.' };
  return { erro: fallback };
}

/** T-003-3: envia CSV/XLSX + contexto; volta a prévia linha a linha. */
export async function enviarRelatorio(formData: FormData): Promise<UploadRelatorioResult> {
  await requireRole(['admin', 'coordinator']);
  try {
    const context = JSON.stringify({
      currency: String(formData.get('currency') ?? ''),
      timezone: String(formData.get('timezone') ?? ''),
      entity_level: String(formData.get('entity_level') ?? ''),
      attribution: String(formData.get('attribution') ?? ''),
      coverage: String(formData.get('coverage') ?? ''),
    });
    const envio = new FormData();
    const clientId = formData.get('client_id');
    const file = formData.get('file');
    if (typeof clientId === 'string') envio.set('client_id', clientId);
    if (file instanceof File) envio.set('relatorio', file, file.name);
    envio.set('context', context);
    const preview = await api<ReportPreview>('/report-imports', { method: 'POST', formData: envio });
    return { ...preview, ok: true as const };
  } catch (error) {
    return errorFromException(error, 'Não foi possível enviar o relatório.');
  }
}

export async function confirmarImportacao(importId: string): Promise<CommitRelatorioResult> {
  await requireRole(['admin', 'coordinator']);
  try {
    const result = await api<{ observations: number }>(`/report-imports/${importId}/commit`, {
      method: 'POST',
    });
    revalidatePath('/relatorios');
    return { ok: true, observations: result.observations };
  } catch (error) {
    return errorFromException(error, 'Não foi possível confirmar a importação.');
  }
}
