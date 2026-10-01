import { describe, expect, it } from 'vitest';
import {
  createWhatsappTemplate,
  listWhatsappPhoneNumbers,
  listWhatsappTemplates,
  sendWhatsappTemplate,
} from '../src/whatsapp.js';
import { makeClient, stubFetch } from './helpers.js';

const waba = '111222333';
const phoneId = '444555666';

describe('WhatsApp Cloud API', () => {
  it('lista números e templates com versão e appsecret_proof', async () => {
    const stub = stubFetch([
      {
        match: /\/111222333\/phone_numbers/,
        json: {
          data: [
            {
              id: phoneId,
              display_phone_number: '+55 11 99999-0000',
              verified_name: 'Loja',
              status: 'CONNECTED',
            },
          ],
        },
      },
      {
        match: /\/111222333\/message_templates/,
        json: {
          data: [
            {
              id: 'tmpl-1',
              name: 'pedido_pronto',
              status: 'APPROVED',
              language: 'pt_BR',
              category: 'UTILITY',
            },
          ],
        },
      },
    ]);
    const client = makeClient(stub);
    const phones = await listWhatsappPhoneNumbers(client, waba);
    const templates = await listWhatsappTemplates(client, waba);

    expect(phones[0]?.verified_name).toBe('Loja');
    expect(templates[0]?.name).toBe('pedido_pronto');
    for (const call of stub.calls) {
      const url = new URL(call.url);
      expect(url.pathname.startsWith('/v25.0/')).toBe(true);
      expect(url.searchParams.get('appsecret_proof')).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(JSON.stringify(stub.logs)).not.toContain('EAAG-token-de-teste');
  });

  it('cria template só com corpo BODY', async () => {
    const stub = stubFetch([
      { match: /\/message_templates/, json: { id: 'tmpl-2', status: 'PENDING', category: 'UTILITY' } },
    ]);
    const created = await createWhatsappTemplate(makeClient(stub), waba, {
      name: 'pedido_pronto',
      language: 'pt_BR',
      category: 'UTILITY',
      body: 'Seu pedido {{1}} saiu.',
    });
    expect(created.id).toBe('tmpl-2');
    const params = new URLSearchParams(stub.calls[0]?.body);
    expect(params.get('name')).toBe('pedido_pronto');
    expect(JSON.parse(params.get('components') ?? '[]')).toEqual([
      { type: 'BODY', text: 'Seu pedido {{1}} saiu.' },
    ]);
    expect(params.get('access_token')).toBe('EAAG-token-de-teste');
    expect(JSON.stringify(stub.logs)).not.toContain('EAAG-token-de-teste');
  });

  it('envia template no número', async () => {
    const stub = stubFetch([
      {
        match: /\/444555666\/messages/,
        json: { messaging_product: 'whatsapp', messages: [{ id: 'wamid.1' }] },
      },
    ]);
    const sent = await sendWhatsappTemplate(makeClient(stub), phoneId, {
      to: '5511999990000',
      template: 'pedido_pronto',
      language: 'pt_BR',
    });
    expect(sent.messages?.[0]?.id).toBe('wamid.1');
    const params = new URLSearchParams(stub.calls[0]?.body);
    expect(params.get('messaging_product')).toBe('whatsapp');
    expect(params.get('type')).toBe('template');
    expect(JSON.parse(params.get('template') ?? '{}')).toEqual({
      name: 'pedido_pronto',
      language: { code: 'pt_BR' },
    });
    expect(stub.calls[0]?.url).not.toContain('access_token');
  });
});
