import { loadMcpEnv } from '@adpub/config';

export interface McpConfig {
  port: number;
  databaseUrl: string;
  authSecret: string;
  apiUrl: string;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  /** URL pública do endpoint MCP (o `resource` do RFC 9728). */
  publicUrl: URL;
  /** Identificador do authorization server: a origem, sem barra final. */
  issuer: string;
  /** Hosts aceitos no header `Host` (proteção contra DNS rebinding). */
  allowedHosts: string[];
}

export function mcpConfig(source: NodeJS.ProcessEnv = process.env): McpConfig {
  const env = loadMcpEnv(source);
  const publicUrl = new URL(env.MCP_PUBLIC_URL);
  const hosts = env.MCP_ALLOWED_HOSTS.split(',')
    .map((host) => host.trim())
    .filter((host) => host.length > 0);

  return {
    port: env.MCP_PORT,
    databaseUrl: env.DATABASE_URL,
    authSecret: env.AUTH_SECRET,
    apiUrl: env.API_URL.replace(/\/+$/, ''),
    logLevel: env.LOG_LEVEL,
    publicUrl,
    issuer: publicUrl.origin,
    allowedHosts: hosts.length > 0 ? hosts : [publicUrl.hostname],
  };
}
