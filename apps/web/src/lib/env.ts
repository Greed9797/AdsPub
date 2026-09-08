/** Env do lado servidor da UI (BFF). Não expõe segredo ao browser. */
export interface WebRuntimeEnv {
  apiUrl: string;
  webUrl: string;
  authSecret: string;
  googleClientId: string;
  googleClientSecret: string;
  allowedDomain: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`);
  return value;
}

export function webEnv(): WebRuntimeEnv {
  return {
    apiUrl: process.env.API_URL ?? 'http://localhost:4000',
    webUrl: process.env.WEB_URL ?? 'http://localhost:3000',
    authSecret: required('AUTH_SECRET'),
    googleClientId: required('GOOGLE_CLIENT_ID'),
    googleClientSecret: required('GOOGLE_CLIENT_SECRET'),
    allowedDomain: required('AUTH_ALLOWED_DOMAIN'),
  };
}
