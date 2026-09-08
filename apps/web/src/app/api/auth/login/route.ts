import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { OAUTH_STATE_COOKIE, buildGoogleAuthUrl } from '@adpub/auth';
import { webEnv } from '@/lib/env';

/** R16: inicia o OAuth do Google restrito ao domínio corporativo. */
export async function GET(): Promise<NextResponse> {
  const env = webEnv();
  const state = randomBytes(16).toString('hex');
  const nonce = randomBytes(16).toString('hex');

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
  return response;
}
