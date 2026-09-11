import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'node:crypto';
import { NEXT_COOKIE, OAUTH_STATE_COOKIE, buildGoogleAuthUrl, safeNextPath } from '@adpub/auth';
import { webEnv } from '@/lib/env';

/** R16: inicia o OAuth do Google restrito ao domínio corporativo. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const env = webEnv();
  const state = randomBytes(16).toString('hex');
  const nonce = randomBytes(16).toString('hex');
  const safeNext = safeNextPath(request.nextUrl.searchParams.get('next')) ?? '';

  const url = buildGoogleAuthUrl({
    clientId: env.googleClientId,
    redirectUri: `${env.webUrl}/api/auth/callback`,
    state,
    nonce,
    hostedDomain: env.allowedDomain,
  });

  const response = NextResponse.redirect(url);
  response.cookies.set(OAUTH_STATE_COOKIE, `${state}.${nonce}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.webUrl.startsWith('https'),
    path: '/',
    maxAge: 600,
  });
  if (safeNext) {
    response.cookies.set(NEXT_COOKIE, safeNext, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.webUrl.startsWith('https'),
      path: '/',
      maxAge: 600,
    });
  }
  return response;
}
