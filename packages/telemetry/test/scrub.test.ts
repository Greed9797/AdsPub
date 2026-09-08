import { describe, expect, it } from 'vitest';
import { scrubEvent } from '../src/index.js';

describe('scrubEvent (SC-006)', () => {
  it('mascara token e appsecret_proof na query da URL do request', () => {
    const event = scrubEvent({
      request: {
        url: 'https://graph.facebook.com/v25.0/act_1/ads?access_token=EAAsegredo&appsecret_proof=abc&fields=id',
      },
    });

    expect(event.request?.url).toContain('access_token=%5Bredacted%5D');
    expect(event.request?.url).toContain('appsecret_proof=%5Bredacted%5D');
    expect(event.request?.url).toContain('fields=id');
    expect(JSON.stringify(event)).not.toContain('EAAsegredo');
  });

  it('descarta a query string bruta que o Sentry envia à parte', () => {
    const event = scrubEvent({
      request: { url: 'https://api.interna/x', query_string: 'access_token=EAAsegredo' },
    });

    expect(event.request?.query_string).toBe('[redacted]');
    expect(JSON.stringify(event)).not.toContain('EAAsegredo');
  });

  it('mascara segredos em qualquer profundidade do evento', () => {
    const event = scrubEvent({
      extra: {
        connection: { token: 'EAAsegredo', label: 'BM principal' },
        headers: { authorization: 'Bearer EAAsegredo' },
      },
    });

    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain('EAAsegredo');
    expect(serialized).toContain('BM principal');
  });

  it('não inventa query string em URL sem parâmetros', () => {
    const event = scrubEvent({ request: { url: 'https://api.interna/health' } });
    expect(event.request?.url).toBe('https://api.interna/health');
  });
});
