import type { MetaClient, Params } from './client.js';

export interface WhatsappPhoneNumber {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
  status?: string;
}

export interface WhatsappTemplate {
  id: string;
  name: string;
  status?: string;
  language?: string;
  category?: string;
}

export type WhatsappTemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';

export interface CreateWhatsappTemplateInput {
  name: string;
  language: string;
  category: WhatsappTemplateCategory;
  body: string;
}

export interface WhatsappTemplateCreated {
  id: string;
  status?: string;
  category?: string;
}

export interface SendWhatsappTemplateInput {
  to: string;
  template: string;
  language: string;
}

export interface WhatsappSendResult {
  messaging_product?: string;
  messages?: Array<{ id: string }>;
}

interface GraphPage<T> {
  data?: T[];
  paging?: { cursors?: { after?: string }; next?: string };
}

async function collect<T>(client: MetaClient, path: string, params: Params): Promise<T[]> {
  const out: T[] = [];
  let after: string | undefined;
  for (let page = 0; page < 5; page += 1) {
    const body = await client.get<GraphPage<T>>(path, {
      ...params,
      limit: 100,
      ...(after ? { after } : {}),
    });
    out.push(...(body.data ?? []));
    after = body.paging?.cursors?.after;
    if (!body.paging?.next || !after) break;
  }
  return out;
}

export function listWhatsappPhoneNumbers(
  client: MetaClient,
  wabaId: string,
): Promise<WhatsappPhoneNumber[]> {
  return collect(client, `${wabaId}/phone_numbers`, {
    fields: 'id,display_phone_number,verified_name,status',
  });
}

export function listWhatsappTemplates(client: MetaClient, wabaId: string): Promise<WhatsappTemplate[]> {
  return collect(client, `${wabaId}/message_templates`, {
    fields: 'id,name,status,language,category',
  });
}

export function createWhatsappTemplate(
  client: MetaClient,
  wabaId: string,
  input: CreateWhatsappTemplateInput,
): Promise<WhatsappTemplateCreated> {
  return client.post(`${wabaId}/message_templates`, {
    name: input.name,
    language: input.language,
    category: input.category,
    components: [{ type: 'BODY', text: input.body }],
  });
}

export function sendWhatsappTemplate(
  client: MetaClient,
  phoneNumberId: string,
  input: SendWhatsappTemplateInput,
): Promise<WhatsappSendResult> {
  return client.post(`${phoneNumberId}/messages`, {
    messaging_product: 'whatsapp',
    to: input.to,
    type: 'template',
    template: { name: input.template, language: { code: input.language } },
  });
}
