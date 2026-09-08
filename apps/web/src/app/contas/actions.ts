"use server";

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { adAccountDefaultsSchema } from '@adpub/shared';
import { api, ApiError } from '@/lib/api';
import { requireSession } from '@/lib/session';
import type { Connection } from '@/lib/types';

type ActionError = { erro: string };
type ActionSuccess = { ok: true };
export type ActionResult = ActionError | ActionSuccess;

export type TestConnectionResult = ActionError | (ActionSuccess & { connection: Connection });
export type SyncConnectionResult =
  | ActionError
  | (ActionSuccess & { job_id: string; queue: string });

export interface AccountDefaultsInput {
  client_id: string;
  default_page_id: string;
  default_ig_user_id: string;
  default_pixel_id: string;
  daily_ad_cap: string;
}

export interface ConnectionInput {
  business_id: string;
  label: string;
  token: string;
}

const connectionInputSchema = z.object({
  business_id: z.string().trim().min(1, 'Informe o business_id da BM.'),
  label: z.string().trim().min(1, 'Informe um rótulo para a conexão.'),
  token: z.string().trim().min(20, 'Token inválido: informe o token completo da BM.'),
});

const idSchema = z.string().uuid('Identificador inválido.');
const accountIdSchema = z.string().min(1, 'Identificador da conta inválido.');
const clientIdSchema = z.string().uuid('Cliente vinculado deve ser um UUID válido.');

function errorFromException(error: unknown, fallback: string): ActionError {
  if (error instanceof ApiError) {
    return { erro: error.problem.detail ?? fallback };
  }

  if (error instanceof z.ZodError) {
    return { erro: error.issues[0]?.message ?? 'Dados inválidos.' };
  }

  return { erro: fallback };
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export async function salvarDefaults(
  accountId: string,
  payload: AccountDefaultsInput,
): Promise<ActionResult> {
  await requireSession();

  try {
    const id = accountIdSchema.parse(accountId);

    const cap = payload.daily_ad_cap.trim();
    const clientId = blankToNull(payload.client_id);

    if (clientId !== null) clientIdSchema.parse(clientId);

    let dailyAdCap: number | undefined;
    if (cap.length > 0) {
      const parsed = Number(cap);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10_000) {
        return { erro: 'O teto diário deve ser um número inteiro entre 1 e 10.000.' };
      }
      dailyAdCap = parsed;
    }

    const base = {
      client_id: clientId,
      default_page_id: blankToNull(payload.default_page_id),
      default_ig_user_id: blankToNull(payload.default_ig_user_id),
      default_pixel_id: blankToNull(payload.default_pixel_id),
    };

    const body = adAccountDefaultsSchema.parse(
      dailyAdCap === undefined ? base : { ...base, daily_ad_cap: dailyAdCap },
    );

    await api(`/ad-accounts/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body,
    });

    revalidatePath('/contas');
    return { ok: true };
  } catch (error) {
    return errorFromException(error, 'Não foi possível salvar os defaults da conta.');
  }
}

export async function criarConexao(payload: ConnectionInput): Promise<ActionResult> {
  await requireSession();

  try {
    const body = connectionInputSchema.parse(payload);

    await api('/connections', {
      method: 'POST',
      body,
    });

    revalidatePath('/contas');
    return { ok: true };
  } catch (error) {
    return errorFromException(error, 'Não foi possível criar a conexão.');
  }
}

export async function testarConexao(connectionId: string): Promise<TestConnectionResult> {
  await requireSession();

  try {
    const id = idSchema.parse(connectionId);
    const connection = await api<Connection>(`/connections/${id}/test`, { method: 'POST' });

    revalidatePath('/contas');
    return { ok: true, connection };
  } catch (error) {
    return errorFromException(error, 'Não foi possível testar a conexão.');
  }
}

export async function sincronizarConexao(connectionId: string): Promise<SyncConnectionResult> {
  await requireSession();

  try {
    const id = idSchema.parse(connectionId);
    const job = await api<{ job_id: string; queue: string }>(`/connections/${id}/sync`, {
      method: 'POST',
    });

    revalidatePath('/contas');
    return { ok: true, job_id: job.job_id, queue: job.queue };
  } catch (error) {
    return errorFromException(error, 'Não foi possível sincronizar a conexão.');
  }
}
