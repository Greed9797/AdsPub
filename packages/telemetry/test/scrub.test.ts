import { describe, expect, it } from 'vitest';
import { scrubBreadcrumb, scrubEvent, scrubSpanAttributes } from '../src/index.js';

const TOKEN = 'EAAsegredo';
const GRAPH_URL = `https://graph.facebook.com/v25.0/act_1/ads?access_token=${TOKEN}&appsecret_proof=abc&fields=id`;

describe('scrubEvent (SC-006)', () => {
  it('mascara token e appsecret_proof na query da URL do request', () => {
    const event = scrubEvent({ request: { url: GRAPH_URL } });

    expect(event.request?.url).toContain('access_token=[redacted]');
    expect(event.request?.url).toContain('appsecret_proof=[redacted]');
    expect(event.request?.url).toContain('fields=id');
    expect(JSON.stringify(event)).not.toContain(TOKEN);
  });

  it('mascara a query string bruta que o Sentry envia à parte', () => {
    const event = scrubEvent({
      request: { url: 'https://api.interna/x', query_string: `access_token=${TOKEN}` },
    });

    expect(event.request?.query_string).toBe('access_token=[redacted]');
    expect(JSON.stringify(event)).not.toContain(TOKEN);
  });

  it('mascara a URL nos breadcrumbs do integration HTTP', () => {
    const event = scrubEvent({
      breadcrumbs: [{ category: 'http', data: { url: GRAPH_URL, status_code: 400 } }],
    });

    expect(JSON.stringify(event)).not.toContain(TOKEN);
    expect(JSON.stringify(event)).toContain('access_token=[redacted]');
    expect(JSON.stringify(event)).toContain('status_code');
  });

  it('mascara token dentro da mensagem e do stack da exceção', () => {
    const event = scrubEvent({
      exception: {
        values: [
          {
            value: `Graph 400 em https://graph.facebook.com/v25.0/me?access_token=${TOKEN}`,
            stacktrace: { frames: [{ vars: { url: GRAPH_URL } }] },
          },
        ],
      },
    });

    expect(JSON.stringify(event)).not.toContain(TOKEN);
  });

  it('mascara segredos em qualquer profundidade do evento', () => {
    const event = scrubEvent({
      extra: {
        connection: { token: TOKEN, label: 'BM principal' },
        headers: { authorization: `Bearer ${TOKEN}` },
      },
    });

    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).toContain('BM principal');
  });

  it('não mexe em URL sem parâmetro sensível', () => {
    const event = scrubEvent({ request: { url: 'https://api.interna/health?ok=1' } });
    expect(event.request?.url).toBe('https://api.interna/health?ok=1');
  });
});

describe('scrubBreadcrumb (SC-006)', () => {
  it('mascara a URL antes do breadcrumb entrar no evento', () => {
    const crumb = scrubBreadcrumb({ category: 'http', data: { url: GRAPH_URL } });
    expect(JSON.stringify(crumb)).not.toContain(TOKEN);
  });
});

describe('scrubSpanAttributes (SC-006)', () => {
  it('mascara os atributos de URL que o auto-instrumentation do OTel gera', () => {
    const attributes: Record<string, unknown> = {
      'http.url': GRAPH_URL,
      'http.target': `/v25.0/me?access_token=${TOKEN}`,
      'url.full': GRAPH_URL,
      'url.query': `access_token=${TOKEN}`,
      'http.method': 'POST',
    };

    scrubSpanAttributes(attributes);

    expect(JSON.stringify(attributes)).not.toContain(TOKEN);
    expect(attributes['http.method']).toBe('POST');
    expect(attributes['http.url']).toContain('fields=id');
  });
});
