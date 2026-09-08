import { readFileSync } from 'node:fs';
import { MetaClient, type MetaCallLog } from '../src/client.js';

export function fixture<T = unknown>(name: string): T {
  const url = new URL(`./fixtures/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as T;
}

export interface StubCall {
  url: string;
  method: string;
  body?: string;
  form?: FormData;
}

export interface StubRoute {
  match: RegExp;
  status?: number;
  json?: unknown;
  headers?: Record<string, string>;
}

export interface Stub {
  fetchImpl: typeof fetch;
  calls: StubCall[];
  logs: MetaCallLog[];
}

/** fetch determinístico a partir de fixtures gravadas (Constituição V). */
export function stubFetch(routes: StubRoute[]): Stub {
  const calls: StubCall[] = [];
  const logs: MetaCallLog[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const call: StubCall = { url, method };
    if (typeof init?.body === 'string') call.body = init.body;
    else if (init?.body instanceof URLSearchParams) call.body = init.body.toString();
    else if (init?.body instanceof FormData) call.form = init.body;
    calls.push(call);

    const route = routes.find((r) => r.match.test(url));
    if (!route) {
      return new Response(JSON.stringify({ error: { message: `sem rota para ${url}`, code: 803 } }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify(route.json ?? {}), {
      status: route.status ?? 200,
      headers: { 'content-type': 'application/json', ...(route.headers ?? {}) },
    });
  }) as unknown as typeof fetch;

  return { fetchImpl, calls, logs };
}

export function makeClient(stub: Stub, overrides: Partial<ConstructorParameters<typeof MetaClient>[0]> = {}) {
  return new MetaClient({
    version: 'v25.0',
    appId: '123456',
    appSecret: 'app-secret',
    token: 'EAAG-token-de-teste',
    fetchImpl: stub.fetchImpl,
    onCall: (log) => {
      stub.logs.push(log);
    },
    ...overrides,
  });
}
