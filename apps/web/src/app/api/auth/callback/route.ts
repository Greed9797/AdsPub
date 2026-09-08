import { NextResponse, type NextRequest } from 'next/server';
import {
  DomainNotAllowedError,
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE,
  exchangeGoogleCode,
  mintSessionToken,
  verifyGoogleIdToken,
} from '@adpub/auth';
import { webEnv } from '@/lib/env';

/** Troca o code, valida domínio e cria/atualiza o usuário via API. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const env = webEnv();
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const cookie = request.cookies.get(OAUTH_STATE_COOKIE)?.value ?? '';
  const [expectedState, nonce] = cookie.split('.');

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(`${env.webUrl}/login?erro=state`);
  }

  try {
    const { idToken } = await exchangeGoogleCode({
      code,
      clientId: env.googleClientId,
      clientSecret: env.googleClientSecret,
      redirectUri: `${env.webUrl}/api/auth/callback`,
    });
    const identity = await verifyGoogleIdToken({
      idToken,
      clientId: env.googleClientId,
      ...(nonce ? { nonce } : {}),
      allowedDomain: env.allowedDomain,
    });

    const upserted = await fetch(`${env.apiUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-adpub-login-secret': env.authSecret,
      },
      body: JSON.stringify({
        email: identity.email,
        name: identity.name,
        google_sub: identity.sub,
      }),
      cache: 'no-store',
    });

    if (!upserted.ok) {
      return NextResponse.redirect(`${env.webUrl}/login?erro=inativo`);
    }

    const user = (await upserted.json()) as {
      id: string;
      email: string;
      name: string;
      role: 'admin' | 'coordinator' | 'manager' | 'viewer';
    };

    const token = await mintSessionToken(user, env.authSecret);
    const response = NextResponse.redirect(`${env.webUrl}/`);
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.webUrl.startsWith('https'),
      path: '/',
      maxAge: 8 * 60 * 60,
    });
    response.cookies.delete(OAUTH_STATE_COOKIE);
    return response;
  } catch (error) {
    const reason = error instanceof DomainNotAllowedError ? 'dominio' : 'falha';
    return NextResponse.redirect(`${env.webUrl}/login?erro=${reason}`);
  }
}
