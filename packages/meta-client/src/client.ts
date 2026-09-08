import { appsecretProof } from '@adpub/crypto';
import { GRAPH_BATCH_MAX } from '@adpub/config';
import { MetaApiError, MetaTimeoutError, type GraphErrorBody } from './errors.js';
import { parseUsageHeaders, type RateUsage } from './rate-limit.js';

export interface MetaCallLog {
  method: string;
  endpoint: string;
  apiVersion: string;
  statusCode: number;
  errorCode?: number;
  errorSubcode?: number;
  latencyMs: number;
  usage: Record<string, unknown>;
  adAccountId?: string;
  adDraftId?: string;
}

export interface MetaClientOptions {
  /** Constituição VI: versão fixada, presente em toda URL. */
  version: string;
  appId: string;
  appSecret: string;
  token: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  onCall?: (log: MetaCallLog) => void | Promise<void>;
  onUsage?: (usage: RateUsage, adAccountId?: string) => void | Promise<void>;
  adAccountId?: string;
  adDraftId?: string;
}

export type Params = Record<string, string | number | boolean | undefined | null>;

export interface BatchRequest {
  method: 'GET' | 'POST' | 'DELETE';
  relative_url: string;
  body?: Record<string, string | number | boolean>;
}

export interface BatchResponse<T = unknown> {
  code: number;
  body: T;
  error?: GraphErrorBody;
}

const DEFAULT_BASE = 'https://graph.facebook.com';

export class MetaClient {
  private readonly options: Required<
    Pick<MetaClientOptions, 'version' | 'appId' | 'appSecret' | 'token' | 'baseUrl' | 'timeoutMs'>
  > &
    MetaClientOptions;

  lastUsage: RateUsage | undefined;

  constructor(options: MetaClientOptions) {
    if (!/^v\d+\.\d+$/.test(options.version)) {
      throw new Error(`META_API_VERSION inválida: ${options.version}`);
    }
    this.options = {
      ...options,
      baseUrl: options.baseUrl ?? DEFAULT_BASE,
      timeoutMs: options.timeoutMs ?? 60_000,
    };
  }

  get version(): string {
    return this.options.version;
  }

  /** Clona o cliente amarrando conta/item para o log de chamadas. */
  withContext(context: { adAccountId?: string; adDraftId?: string }): MetaClient {
    return new MetaClient({ ...this.options, ...context });
  }

  private url(path: string, params: Params = {}): string {
    const clean = path.replace(/^\/+/, '');
    const url = new URL(`${this.options.baseUrl}/${this.options.version}/${clean}`);
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  private authParams(): Params {
    return {
      access_token: this.options.token,
      appsecret_proof: appsecretProof(this.options.token, this.options.appSecret),
    };
  }

  async get<T>(path: string, params: Params = {}): Promise<T> {
    return this.request<T>('GET', path, { params });
  }

  async post<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
    return this.request<T>('POST', path, { json: body });
  }

  async delete<T>(path: string, params: Params = {}): Promise<T> {
    return this.request<T>('DELETE', path, { params });
  }

  /** Upload multipart (imagens e chunks de vídeo). */
  async postForm<T>(path: string, form: FormData): Promise<T> {
    const auth = this.authParams();
    for (const [key, value] of Object.entries(auth)) {
      if (value !== undefined && value !== null) form.set(key, String(value));
    }
    return this.request<T>('POST', path, { form });
  }

  /** Batch da Graph API — máximo 50 requisições (PRD §10). */
  async batch<T = unknown>(requests: BatchRequest[]): Promise<Array<BatchResponse<T>>> {
    if (requests.length === 0) return [];
    if (requests.length > GRAPH_BATCH_MAX) {
      throw new Error(`Batch da Graph API aceita no máximo ${GRAPH_BATCH_MAX} requisições.`);
    }
    const payload = requests.map((request) => ({
      method: request.method,
      relative_url: request.relative_url,
      ...(request.body
        ? { body: new URLSearchParams(Object.entries(request.body).map(([k, v]) => [k, String(v)])).toString() }
        : {}),
    }));
    const raw = await this.request<Array<{ code: number; body: string }>>('POST', '', {
      json: { batch: JSON.stringify(payload), include_headers: false },
    });
    return raw.map((entry) => {
      const parsed = safeParse(entry.body);
      const error = (parsed as { error?: GraphErrorBody } | undefined)?.error;
      return {
        code: entry.code,
        body: parsed as T,
        ...(error ? { error } : {}),
      };
    });
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    payload: { params?: Params; json?: Record<string, unknown>; form?: FormData },
  ): Promise<T> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const endpoint = `/${this.options.version}/${path.replace(/^\/+/, '')}`;
    const started = Date.now();

    const init: RequestInit = { method };
    let url: string;

    if (payload.form) {
      url = this.url(path);
      init.body = payload.form;
    } else if (method === 'GET' || method === 'DELETE') {
      url = this.url(path, { ...payload.params, ...this.authParams() });
    } else {
      url = this.url(path);
      const body = new URLSearchParams();
      for (const [key, value] of Object.entries({ ...payload.json, ...this.authParams() })) {
        if (value === undefined || value === null) continue;
        body.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
      }
      init.body = body;
      init.headers = { 'content-type': 'application/x-www-form-urlencoded' };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    init.signal = controller.signal;

    let response: Response;
    try {
      response = await fetchImpl(url, init);
    } catch (error) {
      clearTimeout(timer);
      const latencyMs = Date.now() - started;
      await this.log({ method, endpoint, statusCode: 0, latencyMs, usage: {} });
      if (controller.signal.aborted) throw new MetaTimeoutError(endpoint, this.options.timeoutMs);
      throw error;
    }
    clearTimeout(timer);

    const usage = parseUsageHeaders(response.headers);
    this.lastUsage = usage;
    await this.options.onUsage?.(usage, this.options.adAccountId);

    const text = await response.text();
    const parsed = safeParse(text);
    const latencyMs = Date.now() - started;
    const errorBody = (parsed as { error?: GraphErrorBody } | undefined)?.error;

    await this.log({
      method,
      endpoint,
      statusCode: response.status,
      latencyMs,
      usage: usage.raw,
      ...(errorBody?.code !== undefined ? { errorCode: errorBody.code } : {}),
      ...(errorBody?.error_subcode !== undefined ? { errorSubcode: errorBody.error_subcode } : {}),
    });

    if (!response.ok || errorBody) {
      throw new MetaApiError({
        httpStatus: response.status,
        endpoint,
        method,
        ...(errorBody ? { body: errorBody } : {}),
        raw: parsed ?? text,
        ...(usage.estimatedTimeToRegainAccessMs
          ? { estimatedTimeToRegainAccessMs: usage.estimatedTimeToRegainAccessMs }
          : {}),
      });
    }

    return parsed as T;
  }

  private async log(entry: Omit<MetaCallLog, 'apiVersion' | 'adAccountId' | 'adDraftId'>): Promise<void> {
    if (!this.options.onCall) return;
    await this.options.onCall({
      ...entry,
      apiVersion: this.options.version,
      ...(this.options.adAccountId ? { adAccountId: this.options.adAccountId } : {}),
      ...(this.options.adDraftId ? { adDraftId: this.options.adDraftId } : {}),
    });
  }
}

function safeParse(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function actPath(adAccountId: string, suffix = ''): string {
  const id = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  return suffix ? `${id}/${suffix}` : id;
}
