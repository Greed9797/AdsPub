"use server";

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { SESSION_COOKIE, mintSessionToken, safeNextPath } from '@adpub/auth';
import { webEnv } from '@/lib/env';

const passwordUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  role: z.enum(['admin', 'coordinator', 'manager', 'viewer']),
});

type PasswordUser = z.infer<typeof passwordUserSchema>;

export interface LoginState {
  erro: string;
}

const GENERIC = 'E-mail ou senha inválidos.';

async function passwordApi(
  path: '/auth/password/login' | '/auth/password/bootstrap',
  body: unknown,
): Promise<PasswordUser> {
  const env = webEnv();
  const response = await fetch(`${env.apiUrl}/api/v1${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-adpub-login-secret': env.authSecret,
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`login falhou (${response.status})`);
  return passwordUserSchema.parse(await response.json());
}

async function mintSessionCookie(user: PasswordUser): Promise<void> {
  const env = webEnv();
  const token = await mintSessionToken(user, env.authSecret);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.webUrl.startsWith('https'),
    path: '/',
    maxAge: 8 * 60 * 60,
  });
}

/** Login normal: erro sempre genérico, sem dizer se o e-mail existe. */
export async function entrarComSenha(
  _state: LoginState | null,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const next = safeNextPath(formData.get('next') ? String(formData.get('next')) : undefined);

  let user: PasswordUser;
  try {
    user = await passwordApi('/auth/password/login', { email, password });
    await mintSessionCookie(user);
  } catch {
    return { erro: GENERIC };
  }
  redirect(next ?? '/');
}

/** Bootstrap: cria o primeiro admin; a API recusa quando já há senha. */
export async function criarAdminInicial(
  _state: LoginState | null,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get('email') ?? '');
  const name = String(formData.get('name') ?? '');
  const password = String(formData.get('password') ?? '');

  let user: PasswordUser;
  try {
    user = await passwordApi('/auth/password/bootstrap', { email, name, password });
    await mintSessionCookie(user);
  } catch {
    return { erro: 'Não foi possível criar o administrador inicial.' };
  }
  redirect('/');
}

const bootstrapStatusSchema = z.object({ available: z.boolean() });

/** A página de login mostra o bootstrap só enquanto nenhum usuário tem senha. */
export async function bootstrapDisponivel(): Promise<boolean> {
  try {
    const env = webEnv();
    const response = await fetch(`${env.apiUrl}/api/v1/auth/password/bootstrap`, {
      headers: { 'x-adpub-login-secret': env.authSecret },
      cache: 'no-store',
    });
    if (!response.ok) return false;
    return bootstrapStatusSchema.parse(await response.json()).available;
  } catch {
    return false;
  }
}
