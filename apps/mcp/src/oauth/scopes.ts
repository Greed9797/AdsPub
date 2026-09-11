/**
 * Escopos do MCP. `read` é o padrão de qualquer conexão; `write` só entra se o
 * usuário marcar na tela de consentimento — é ele que libera gastar verba.
 */
export const SCOPE_READ = 'adpub:read';
export const SCOPE_WRITE = 'adpub:write';

export const ALL_SCOPES = [SCOPE_READ, SCOPE_WRITE] as const;

export const SCOPE_LABELS: Record<string, string> = {
  [SCOPE_READ]: 'Consultar clientes, contas, lotes, métricas e auditoria',
  [SCOPE_WRITE]: 'Criar lotes, gerar planos e publicar anúncios (gasta verba)',
};

export function normalizeScopes(requested: readonly string[]): string[] {
  const wanted = new Set(requested);
  return ALL_SCOPES.filter((scope) => wanted.has(scope));
}

export function describeScopes(scopes: readonly string[]): string {
  return scopes.map((scope) => SCOPE_LABELS[scope] ?? scope).join('; ');
}
