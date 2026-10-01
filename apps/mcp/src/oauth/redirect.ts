/**
 * DCR aberto aceitaria qualquer `https`. Os três connectors (Grok, ChatGPT,
 * Claude) e o Cursor registram callbacks nesses hosts; o resto cai fora.
 */
export const CONNECTOR_REDIRECT_HOSTS = [
  'claude.ai',
  'claude.com',
  'chatgpt.com',
  'chat.openai.com',
  'openai.com',
  'grok.com',
  'x.ai',
  'cursor.com',
] as const;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function hostAllowed(hostname: string, allowed: string): boolean {
  const host = hostname.toLowerCase();
  return host === allowed || host.endsWith(`.${allowed}`);
}

export function isValidRedirectUri(value: string): boolean {
  try {
    const url = new URL(value);
    if (LOCAL_HOSTS.has(url.hostname)) {
      return url.protocol === 'http:' || url.protocol === 'https:';
    }
    if (url.protocol !== 'https:') return false;
    return CONNECTOR_REDIRECT_HOSTS.some((allowed) => hostAllowed(url.hostname, allowed));
  } catch {
    return false;
  }
}

/** Nome amigável na tela de consentimento quando o cliente não manda `client_name`. */
export function clientNameFromRedirects(uris: readonly string[], fallback = 'Cliente MCP'): string {
  for (const uri of uris) {
    let host: string;
    try {
      host = new URL(uri).hostname.toLowerCase();
    } catch {
      continue;
    }
    if (hostAllowed(host, 'cursor.com')) return 'Cursor (Grok)';
    if (hostAllowed(host, 'claude.ai') || hostAllowed(host, 'claude.com')) return 'Claude';
    if (hostAllowed(host, 'chatgpt.com') || hostAllowed(host, 'openai.com') || hostAllowed(host, 'chat.openai.com')) {
      return 'ChatGPT';
    }
    if (hostAllowed(host, 'grok.com') || hostAllowed(host, 'x.ai')) return 'Grok';
  }
  return fallback;
}
