'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { api, ApiError } from '@/lib/api';
import { requireRole, requireSession } from '@/lib/session';

type ActionError = { erro: string };
type ActionSuccess = { ok: true };
export type ActionResult = ActionError | ActionSuccess;

const writers = ['admin', 'coordinator', 'manager'] as const;

const connectSchema = z.object({
  client_id: z.string().uuid('Escolha um cliente.'),
  waba_id: z.string().trim().regex(/^\d+$/, 'WABA id numérico.'),
  phone_number_id: z.string().trim().regex(/^\d+$/, 'Phone number id numérico.'),
  display_name: z.string().trim().max(120),
  token: z.string().trim().min(20, 'Cole o token completo do system user.'),
});

const templateSchema = z.object({
  name: z.string().trim().regex(/^[a-z0-9_]+$/, 'Nome em minúsculas, números e _.'),
  language: z.string().trim().regex(/^[a-z]{2}(_[A-Z]{2})?$/, 'Idioma no formato pt_BR.'),
  category: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']),
  body: z.string().trim().min(1, 'Escreva o corpo do modelo.').max(1024),
});

const sendSchema = z.object({
  to: z.string().trim().regex(/^\+?\d{8,15}$/, 'Telefone em dígitos, com DDI.'),
  template: z.string().trim().regex(/^[a-z0-9_]+$/, 'Escolha um modelo.'),
  language: z.string().trim().regex(/^[a-z]{2}(_[A-Z]{2})?$/),
});

function errorFromException(error: unknown, fallback: string): ActionError {
  if (error instanceof ApiError) return { erro: error.problem.detail ?? fallback };
  if (error instanceof z.ZodError) return { erro: error.issues[0]?.message ?? 'Dados inválidos.' };
  return { erro: fallback };
}

export async function conectarWhatsapp(input: z.infer<typeof connectSchema>): Promise<ActionResult> {
  await requireRole(writers);
  const parsed = connectSchema.safeParse(input);
  if (!parsed.success) return errorFromException(parsed.error, 'Dados inválidos.');
  try {
    await api('/whatsapp-accounts', { method: 'POST', body: parsed.data });
    revalidatePath('/whatsapp');
    return { ok: true };
  } catch (error) {
    return errorFromException(error, 'Não foi possível conectar a conta.');
  }
}

export async function criarTemplateWhatsapp(
  accountId: string,
  input: z.infer<typeof templateSchema>,
): Promise<ActionResult> {
  await requireRole(writers);
  const id = z.string().uuid().safeParse(accountId);
  if (!id.success) return { erro: 'Conta inválida.' };
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return errorFromException(parsed.error, 'Dados inválidos.');
  try {
    await api(`/whatsapp-accounts/${id.data}/templates`, { method: 'POST', body: parsed.data });
    revalidatePath('/whatsapp');
    return { ok: true };
  } catch (error) {
    return errorFromException(error, 'Não foi possível criar o modelo.');
  }
}

export async function enviarTemplateWhatsapp(
  accountId: string,
  input: z.infer<typeof sendSchema>,
): Promise<ActionResult> {
  const user = await requireSession();
  if (user.role === 'viewer') return { erro: 'Leitor não envia mensagem.' };
  const id = z.string().uuid().safeParse(accountId);
  if (!id.success) return { erro: 'Conta inválida.' };
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return errorFromException(parsed.error, 'Dados inválidos.');
  try {
    await api(`/whatsapp-accounts/${id.data}/messages`, {
      method: 'POST',
      body: { ...parsed.data, confirm_to: parsed.data.to },
    });
    revalidatePath('/whatsapp');
    return { ok: true };
  } catch (error) {
    return errorFromException(error, 'Não foi possível enviar o modelo.');
  }
}
