import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, verifySessionToken } from '@adpub/auth';
import type { Role, SessionUser } from '@adpub/shared';
import { webEnv } from './env';

export async function sessionToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value;
}

export async function currentSession(): Promise<SessionUser | undefined> {
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
