import { sessionToken } from './session';
import { webEnv } from './env';

export interface ApiProblem {
  type: string;
  title: string;
  status: number;
  detail?: string;
  errors?: unknown[];
}

export class ApiError extends Error {
  constructor(
    readonly problem: ApiProblem,
    readonly status: number,
  ) {
    super(problem.detail ?? problem.title);
    this.name = 'ApiError';
  }
}

export interface ApiRequest {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** `no-store` por padrão: a UI sempre reflete o estado real do lote. */
  cache?: RequestCache;
  formData?: FormData;
}

/**
 * Cliente do BFF: injeta a sessão como Bearer e traduz problem+json em ApiError.
 * Toda chamada da UI passa por aqui — a UI nunca fala com a Meta.
 */
export async function api<T>(path: string, init: ApiRequest = {}): Promise<T> {
  const env = webEnv();
  const token = await sessionToken();
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (init.body !== undefined) headers['content-type'] = 'application/json';

  const response = await fetch(`${env.apiUrl}/api/v1${path}`, {
    method: init.method ?? 'GET',
    headers,
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    ...(init.formData ? { body: init.formData } : {}),
    cache: init.cache ?? 'no-store',
  });

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : undefined;

  if (!response.ok) {
    const problem = (payload ?? {
      type: 'about:blank',
      title: 'Falha na requisição',
      status: response.status,
    }) as ApiProblem;
    throw new ApiError(problem, response.status);
  }
  return payload as T;
}
