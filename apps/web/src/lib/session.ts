import { cookies } from 'next/headers';
import { forbidden, redirect } from 'next/navigation';
import { SESSION_COOKIE, mintSessionToken } from '@adpub/auth';
import type { Role, SessionUser } from '@adpub/shared';
import { webEnv } from './env';

/** Teste local sem OAuth: DEV_NO_AUTH=1 finge admin. Nunca em produção. */
function devBypass(): boolean {
  return process.env.DEV_NO_AUTH === '1' && process.env.NODE_ENV !== 'production';
}

const DEV_USER = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'dev@empresa.com.br',
  name: 'Dev',
  role: 'admin' as Role,
};

export async function sessionToken(): Promise<string | undefined> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) return token;
  if (devBypass()) return mintSessionToken(DEV_USER, webEnv().authSecret);
  return undefined;
}

export async function currentSession(): Promise<SessionUser | undefined> {
  // Bypass só de desenvolvimento já existente. O seed de dev precisa ter o
  // usuário correspondente ativo, pois a API valida o token no banco.
  if (devBypass()) return { ...DEV_USER };
  // Valida o cookie no banco via API: fetch direto com bearer e no-store, sem
  // o helper api() (que chamaria session de novo). 401 = sem sessão.
  const env = webEnv();
  const token = await sessionToken();
  if (!token) return undefined;
  let response: Response;
  try {
    response = await fetch(`${env.apiUrl}/api/v1/auth/me`, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
  } catch {
    // API fora do ar: erro recuperável, não fingir logout nem admin.
    throw new Error('API indisponível para validar a sessão. Tente novamente.');
  }
  if (response.status === 401) return undefined;
  if (!response.ok) throw new Error(`Falha ao validar sessão (${response.status}).`);
  const payload = (await response.json()) as SessionUser;
  return { id: payload.id, email: payload.email, name: payload.name, role: payload.role };
}

/** Server Components protegidos: sem sessão → login. */
export async function requireSession(): Promise<SessionUser> {
  const user = await currentSession();
  if (!user) redirect('/login');
  return user;
}

export async function requireRole(roles: readonly Role[]): Promise<SessionUser> {
  const user = await requireSession();
  // 403 com a página de permissão (app/forbidden.tsx), em vez de mandar a pessoa para a home sem explicar.
  if (!roles.includes(user.role)) forbidden();
  return user;
}
