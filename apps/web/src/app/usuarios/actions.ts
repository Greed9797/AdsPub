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
  active: z.enum(['1', '0']),
  ad_account_ids: z.array(z.string().min(1, 'Conta inválida.')),
});

export type SalvarUsuarioResult =
  | {
      sucesso: true;
    }
  | {
      erro: string;
    };

function apiErrorMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues.map((issue) => issue.message).join(', ');
  }
  if (error instanceof ApiError) {
    return error.problem.detail ?? error.problem.title;
  }
  return 'Não foi possível salvar o usuário.';
}

export async function salvarUsuario(formData: FormData): Promise<SalvarUsuarioResult> {
  try {
    await requireRole(['admin']);

    const accountIds = formData.getAll('ad_account_ids').filter(
      (value): value is string => typeof value === 'string' && value.length > 0,
    );

    const payload = saveUserBodySchema.parse({
      user_id: formData.get('user_id'),
      role: formData.get('role'),
      active: formData.get('active') === '1' ? '1' : '0',
      ad_account_ids: accountIds,
    });

    await api<Usuario>(`/users/${payload.user_id}`, {
      method: 'PATCH',
      body: {
        role: payload.role,
        active: payload.active === '1',
        ad_account_ids: payload.ad_account_ids,
      },
    });

    revalidatePath('/usuarios');

    return { sucesso: true };
  } catch (error) {
    return { erro: apiErrorMessage(error) };
  }
}

const createUserFormSchema = z.object({
  email: z.string().email('E-mail inválido.'),
  name: z.string().min(1, 'Nome obrigatório.'),
  role: roleSchema,
  password: z.string().min(12, 'A senha temporária precisa de ao menos 12 caracteres.'),
});

export async function criarUsuario(formData: FormData): Promise<SalvarUsuarioResult> {
  try {
    await requireRole(['admin']);

    const payload = createUserFormSchema.parse({
      email: formData.get('email'),
      name: formData.get('name'),
      role: formData.get('role'),
      password: formData.get('password'),
    });

    await api<Usuario>('/users', { method: 'POST', body: payload });

    revalidatePath('/usuarios');

    return { sucesso: true };
  } catch (error) {
    return { erro: apiErrorMessage(error) };
  }
}

const resetPasswordFormSchema = z.object({
  user_id: z.string().uuid('Usuário inválido.'),
  password: z.string().min(12, 'A nova senha precisa de ao menos 12 caracteres.'),
});

export async function redefinirSenha(formData: FormData): Promise<SalvarUsuarioResult> {
  try {
    await requireRole(['admin']);

    const payload = resetPasswordFormSchema.parse({
      user_id: formData.get('user_id'),
      password: formData.get('password'),
    });

    await api<Usuario>(`/users/${payload.user_id}`, {
      method: 'PATCH',
      body: { password: payload.password },
    });

    revalidatePath('/usuarios');

    return { sucesso: true };
  } catch (error) {
    return { erro: apiErrorMessage(error) };
  }
}
