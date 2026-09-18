"use server";

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { clientInputSchema } from '@adpub/shared';
import { api, ApiError } from '@/lib/api';
import { requireRole } from '@/lib/session';

type ActionError = { erro: string };
export type ActionResult = ActionError | { ok: true };

const clientShape = clientInputSchema.shape;

export type CreateClientInput = z.infer<typeof clientInputSchema>;
export type UpdateClientInput = Partial<CreateClientInput>;

function isClientField(key: string): key is keyof typeof clientShape {
  return key in clientShape;
}

function errorFromException(error: unknown, fallback: string): ActionError {
  if (error instanceof ApiError) {
    return { erro: error.problem.detail ?? fallback };
  }

  if (error instanceof z.ZodError) {
    return { erro: error.issues[0]?.message ?? 'Dados inválidos.' };
  }

  return { erro: fallback };
}

export async function criarCliente(payload: CreateClientInput): Promise<ActionResult> {
  await requireRole(['admin', 'coordinator']);

  try {
    const body = clientInputSchema.parse(payload);

    await api('/clients', { method: 'POST', body });

    revalidatePath('/clientes');
    return { ok: true };
  } catch (error) {
    return errorFromException(error, 'Não foi possível criar o cliente.');
  }
}

export async function atualizarCliente(
  clientId: string,
  payload: UpdateClientInput,
): Promise<ActionResult> {
  await requireRole(['admin', 'coordinator']);

  try {
    const id = z.string().uuid('Identificador de cliente inválido.').parse(clientId);

    /**
     * `clientInputSchema.partial()` reaplica os `.default()` de cada campo, o que
     * transformaria um patch parcial em sobrescrita total. Validamos campo a campo
     * e enviamos só o que o formulário mandou.
     */
    const body: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined || !isClientField(key)) continue;
      body[key] = clientShape[key].parse(value);
    }

    if (Object.keys(body).length === 0) {
      return { erro: 'Informe ao menos um campo para atualizar.' };
    }

    await api(`/clients/${id}`, { method: 'PATCH', body });

    revalidatePath('/clientes');
    return { ok: true };
  } catch (error) {
    return errorFromException(error, 'Não foi possível atualizar o cliente.');
  }
}
