import { NextResponse, type NextRequest } from 'next/server';
import {
  DomainNotAllowedError,
  NEXT_COOKIE,
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE,
  exchangeGoogleCode,
  mintSessionToken,
  safeNextPath,
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
  // Só caminho interno volta depois do login (evita redirecionamento aberto).
  const destination = safeNextPath(request.cookies.get(NEXT_COOKIE)?.value) ?? '/';

  // Sem nonce não há como amarrar o id_token a este fluxo: recomeça o login.
  if (!code || !state || !expectedState || !nonce || state !== expectedState) {
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
      nonce,
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
    const response = NextResponse.redirect(`${env.webUrl}${destination}`);
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.webUrl.startsWith('https'),
      path: '/',
      maxAge: 8 * 60 * 60,
    });
    response.cookies.delete(OAUTH_STATE_COOKIE);
    response.cookies.delete(NEXT_COOKIE);
    return response;
  } catch (error) {
    const reason = error instanceof DomainNotAllowedError ? 'dominio' : 'falha';
    return NextResponse.redirect(`${env.webUrl}/login?erro=${reason}`);
  }
}
