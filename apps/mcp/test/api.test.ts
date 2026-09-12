import { describe, expect, it } from 'vitest';
import { createApiClient } from '../src/api.js';

const SECRET = 'segredo-de-teste-com-tamanho-suficiente';
const user = { id: 'u1', email: 'gestor@empresa.com.br', name: 'Gestor', role: 'manager' as const };

describe('cliente da API do AdPub', () => {
  it('monta o caminho sob /api/v1 e assina a sessão do usuário', async () => {
    const requests: Array<{ url: string; authorization: string | null }> = [];
    const client = createApiClient({
      apiUrl: 'http://api:4000/',
      authSecret: SECRET,
      fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push({
          url: String(input instanceof Request ? input.url : input),
          authorization: new Headers(init?.headers).get('authorization'),
        });
        return Response.json({ items: [] });
      }) as typeof fetch,
    });

    await client.call(user, '/clients', { query: { limit: 5 } });

    expect(requests[0]?.url).toBe('http://api:4000/api/v1/clients?limit=5');
    expect(requests[0]?.authorization?.startsWith('Bearer ')).toBe(true);
  });
});
