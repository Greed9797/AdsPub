"use server";

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ApiError, api } from '@/lib/api';
import { requireRole } from '@/lib/session';
import type { Role } from '@/lib/types';

export interface Usuario {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  ad_account_ids: string[];
}

const roleSchema = z.enum(['admin', 'coordinator', 'manager', 'viewer']);
const saveUserBodySchema = z.object({
  user_id: z.string().uuid('Usuário inválido.'),
  role: roleSchema,
  ad_account_ids: z.array(z.string().min(1, 'Conta inválida.')),
});

export type SalvarUsuarioResult =
  | {
      sucesso: true;
    }
  | {
      erro: string;
    };

export async function salvarUsuario(formData: FormData): Promise<SalvarUsuarioResult> {
  try {
    await requireRole(['admin']);

    const accountIds = formData.getAll('ad_account_ids').filter(
      (value): value is string => typeof value === 'string' && value.length > 0,
    );

    const payload = saveUserBodySchema.parse({
      user_id: formData.get('user_id'),
      role: formData.get('role'),
      ad_account_ids: accountIds,
    });

    await api<Usuario>(`/users/${payload.user_id}`, {
      method: 'PATCH',
      body: {
        role: payload.role,
        ad_account_ids: payload.ad_account_ids,
      },
    });

    revalidatePath('/usuarios');

    return { sucesso: true };
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
      erro: 'Não foi possível salvar o usuário.',
    };
  }
}
