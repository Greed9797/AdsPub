import { describe, expect, it } from 'vitest';
import { scrubSpanAttributes } from '../src/index.js';

const TOKEN = 'EAAsegredo';
const GRAPH_URL = `https://graph.facebook.com/v25.0/act_1/ads?access_token=${TOKEN}&appsecret_proof=abc&fields=id`;

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

  it('não mexe em atributo que não é segredo', () => {
    const attributes: Record<string, unknown> = {
      'db.system': 'postgresql',
      'http.status_code': 200,
    };

    scrubSpanAttributes(attributes);

    expect(attributes).toEqual({ 'db.system': 'postgresql', 'http.status_code': 200 });
  });
});
