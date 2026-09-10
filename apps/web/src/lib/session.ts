import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, mintSessionToken, verifySessionToken } from '@adpub/auth';
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
  if (devBypass()) return { ...DEV_USER };
  const token = await sessionToken();
  if (!token) return undefined;
  try {
    return await verifySessionToken(token, webEnv().authSecret);
  } catch {
    return undefined;
  }
}

/** Server Components protegidos: sem sessão → login. */
export async function requireSession(): Promise<SessionUser> {
  const user = await currentSession();
  if (!user) redirect('/login');
  return user;
}

export async function requireRole(roles: readonly Role[]): Promise<SessionUser> {
  const user = await requireSession();
  if (!roles.includes(user.role)) redirect('/');
  return user;
}
