"use server";

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ApiError, api } from '@/lib/api';
import { requireSession } from '@/lib/session';

export interface ReportView {
  id: string;
  output: {
    performance_findings: Array<{ text: string }>;
    content_observations: string[];
    hypotheses: Array<{ text: string; confounders: string[]; test: string }>;
    recommended_tests: Array<{ variable: string; goal: string; metric: string }>;
    limitations: string[];
  };
  input_snapshot: { totals: { spend: number; results: number | null } };
  model_id: string;
  feedbacks: Array<{ id: string; text: string }>;
}

type ActionError = { erro: string };

function erroDe(error: unknown, fallback: string): ActionError {
  if (error instanceof ApiError) return { erro: error.problem.detail ?? fallback };
  if (error instanceof z.ZodError) return { erro: error.issues[0]?.message ?? 'Dados inválidos.' };
  return { erro: fallback };
}

/** T-007-3: gera relatório validado (422 quando a IA inventa número). */
export async function gerarRelatorio(formData: FormData): Promise<ActionError | ({ ok: true } & ReportView)> {
  await requireSession();
  try {
    const payload = z
      .object({
        ad_account_id: z.string().min(1),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        source: z.enum(['file', 'api']).optional(),
      })
      .parse({
        ad_account_id: formData.get('ad_account_id'),
        from: formData.get('from'),
        to: formData.get('to'),
        source: formData.get('source') || undefined,
      });
    const report = await api<ReportView>('/analysis-reports', { method: 'POST', body: payload });
    const detail = await api<ReportView>(`/analysis-reports/${report.id}`);
    revalidatePath('/inteligencia');
    return { ...detail, ok: true as const };
  } catch (error) {
    return erroDe(error, 'Não foi possível gerar o relatório.');
  }
}

export async function comentarRelatorio(reportId: string, text: string): Promise<ActionError | { ok: true }> {
  await requireSession();
  try {
    await api(`/analysis-reports/${reportId}/feedback`, { method: 'POST', body: { text } });
    revalidatePath('/inteligencia');
    return { ok: true };
  } catch (error) {
    return erroDe(error, 'Não foi possível comentar.');
  }
}

export async function gerarRascunho(reportId: string, briefing: string): Promise<ActionError | { ok: true; batch_id: string }> {
  await requireSession();
  try {
    const result = await api<{ batch_id: string }>(`/analysis-reports/${reportId}/test-drafts`, {
      method: 'POST',
      body: { briefing },
    });
    return { ok: true, batch_id: result.batch_id };
  } catch (error) {
    return erroDe(error, 'Não foi possível gerar o rascunho.');
  }
}

export async function salvarAprendizado(
  reportId: string,
  clientId: string,
  hypothesis: string,
): Promise<ActionError | { ok: true; id: string }> {
  await requireSession();
  try {
    const result = await api<{ id: string }>('/learnings', {
      method: 'POST',
      body: { client_id: clientId, source_report_id: reportId, hypothesis },
    });
    revalidatePath('/inteligencia');
    return { ok: true, id: result.id };
  } catch (error) {
    return erroDe(error, 'Não foi possível salvar o aprendizado.');
  }
}

export async function registrarResultado(
  learningId: string,
  resultSummary: string,
  outcome: 'positive' | 'negative' | 'inconclusive',
): Promise<ActionError | { ok: true }> {
  await requireSession();
  try {
    await api(`/learnings/${learningId}/outcome`, {
      method: 'PATCH',
      body: { result_summary: resultSummary, outcome },
    });
    revalidatePath('/inteligencia');
    return { ok: true };
  } catch (error) {
    return erroDe(error, 'Não foi possível registrar o resultado.');
  }
}
