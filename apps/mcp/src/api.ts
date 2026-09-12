import { mintSessionToken } from '@adpub/auth';
import type { Role, SessionUser } from '@adpub/shared';

/**
 * Cliente da API do AdPub. Cada chamada assina uma sessão do usuário que
 * consentiu, então a auditoria da API registra a pessoa — não um serviço.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiCall {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}

export interface ApiClient {
  call(user: SessionUser, path: string, call?: ApiCall): Promise<unknown>;
}

function errorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const detail = typeof record.detail === 'string' ? record.detail : undefined;
    const title = typeof record.title === 'string' ? record.title : undefined;
    const message = typeof record.message === 'string' ? record.message : undefined;
    if (detail ?? title ?? message) return (detail ?? title ?? message) as string;
  }
  if (status === 401) return 'Sessão inválida para a API do AdPub.';
  if (status === 403) return 'Seu usuário não tem permissão para esta ação.';
  if (status === 404) return 'Recurso não encontrado no AdPub.';
  return `A API do AdPub respondeu ${status}.`;
}

export function createApiClient(options: {
  apiUrl: string;
  authSecret: string;
  fetchImpl?: typeof fetch;
}): ApiClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.apiUrl.replace(/\/+$/, '');

  return {
    async call(user: SessionUser, path: string, call: ApiCall = {}): Promise<unknown> {
      // A API monta todas as rotas sob /api/v1 (apps/api/src/app.ts).
      const url = new URL(`${baseUrl}/api/v1${path}`);
      for (const [key, value] of Object.entries(call.query ?? {})) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }

      const token = await mintSessionToken(user, options.authSecret);
      const response = await fetchImpl(url, {
        method: call.method ?? 'GET',
        headers: {
          authorization: `Bearer ${token}`,
          ...(call.body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(call.body === undefined ? {} : { body: JSON.stringify(call.body) }),
      });

      const text = await response.text();
      let payload: unknown;
      try {
        payload = text ? JSON.parse(text) : undefined;
      } catch {
        payload = text;
      }

      if (!response.ok) throw new ApiError(response.status, errorMessage(payload, response.status));
      return payload;
    },
  };
}

/** O usuário da sessão no formato que a API espera. */
export function sessionUserOf(row: {
  id: string;
  email: string;
  name: string;
  role: string;
}): SessionUser {
  return { id: row.id, email: row.email, name: row.name, role: row.role as Role };
}
