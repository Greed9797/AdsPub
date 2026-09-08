import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';

/** R16: login Google restrito ao domínio corporativo. */

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

export interface GoogleAuthUrlInput {
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  hostedDomain?: string;
}

export function buildGoogleAuthUrl(input: GoogleAuthUrlInput): string {
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', input.state);
  url.searchParams.set('nonce', input.nonce);
  url.searchParams.set('access_type', 'online');
  url.searchParams.set('prompt', 'select_account');
  if (input.hostedDomain) url.searchParams.set('hd', input.hostedDomain);
  return url.toString();
}

const tokenResponseSchema = z.object({
  id_token: z.string(),
  access_token: z.string().optional(),
  expires_in: z.number().optional(),
});

export async function exchangeGoogleCode(input: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
}): Promise<{ idToken: string }> {
  const body = new URLSearchParams({
    code: input.code,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
    grant_type: 'authorization_code',
  });
  const response = await (input.fetchImpl ?? fetch)(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) {
    throw new Error(`Falha ao trocar o code do Google (${response.status}).`);
  }
  const parsed = tokenResponseSchema.parse(await response.json());
  return { idToken: parsed.id_token };
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string;
  hd?: string;
}

export class DomainNotAllowedError extends Error {
  constructor(readonly email: string) {
    super(`E-mail ${email} fora do domínio corporativo permitido.`);
    this.name = 'DomainNotAllowedError';
  }
}

export async function verifyGoogleIdToken(input: {
  idToken: string;
  clientId: string;
  nonce?: string;
  allowedDomain: string;
}): Promise<GoogleIdentity> {
  jwks ??= createRemoteJWKSet(new URL(JWKS_URL));
  const { payload } = await jwtVerify(input.idToken, jwks, {
    audience: input.clientId,
    issuer: ISSUERS,
  });
  if (input.nonce && payload.nonce !== input.nonce) {
    throw new Error('Nonce do login não confere.');
  }
  const email = String(payload.email ?? '').toLowerCase();
  const emailVerified = payload.email_verified === true;
  if (!email || !emailVerified) throw new Error('Login sem e-mail verificado.');
  if (!isAllowedDomain(email, input.allowedDomain)) throw new DomainNotAllowedError(email);

  return {
    sub: String(payload.sub),
    email,
    name: String(payload.name ?? email),
    ...(payload.hd ? { hd: String(payload.hd) } : {}),
  };
}

/** US6 cenário 3: e-mail fora do domínio corporativo não entra. */
export function isAllowedDomain(email: string, allowedDomain: string): boolean {
  const domain = allowedDomain.trim().toLowerCase().replace(/^@/, '');
  if (!domain) return false;
  return email.toLowerCase().endsWith(`@${domain}`);
}
