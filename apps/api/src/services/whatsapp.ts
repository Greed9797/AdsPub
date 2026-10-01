import { audit, getClient, getWhatsappAccount, getWhatsappToken, listWhatsappAccounts, saveWhatsappAccount, setWhatsappLastError, type PublicWhatsappAccount } from '@adpub/db';
import {
  MetaApiError,
  createWhatsappTemplate,
  listWhatsappPhoneNumbers,
  listWhatsappTemplates,
  sendWhatsappTemplate,
  type WhatsappTemplateCategory,
} from '@adpub/meta-client';
import type { Role, SessionUser } from '@adpub/shared';
import type { ApiDeps } from '../lib/deps.js';
import { forbidden, notFound, unprocessable } from '../lib/problem.js';

export const WHATSAPP_WRITERS = ['admin', 'coordinator', 'manager'] as const satisfies readonly Role[];

export interface WhatsappActor extends SessionUser {
  ip?: string;
}

export function assertWhatsappSend(role: Role, confirmTo: string, to: string): void {
  if (role === 'viewer') throw forbidden('Leitor não envia mensagem no WhatsApp.');
  if (confirmTo !== to) {
    throw unprocessable('confirm_to precisa ser igual ao telefone de destino. A Meta não foi chamada.');
  }
}

function metaDetail(error: unknown): string | undefined {
  if (error instanceof MetaApiError) return `${error.translated.title} ${error.translated.action}`.trim();
  return undefined;
}

export async function connectWhatsappAccount(
  deps: ApiDeps,
  actor: WhatsappActor,
  input: {
    clientId: string;
    wabaId: string;
    phoneNumberId: string;
    displayName: string;
    token: string;
  },
): Promise<PublicWhatsappAccount> {
  if (actor.role === 'viewer') throw forbidden('Leitor não conecta conta de WhatsApp.');
  const clientRow = await getClient(deps.db, input.clientId);
  if (!clientRow) throw notFound(`Cliente ${input.clientId} não encontrado.`);

  const graph = deps.metaClientForToken(input.token);
  let phones;
  try {
    phones = await listWhatsappPhoneNumbers(graph, input.wabaId);
  } catch (error) {
    const detail = metaDetail(error);
    if (detail) throw unprocessable(detail);
    throw error;
  }
  const phone = phones.find((item) => item.id === input.phoneNumberId);
  if (!phone) {
    throw unprocessable('Esse número não pertence à conta WhatsApp informada.');
  }

  const saved = await saveWhatsappAccount(deps.db, {
    clientId: input.clientId,
    wabaId: input.wabaId,
    phoneNumberId: input.phoneNumberId,
    displayName: input.displayName || phone.verified_name || '',
    displayPhone: phone.display_phone_number ?? '',
    token: input.token,
  });
  await audit(deps.db, {
    actor,
    action: 'whatsapp.connect',
    entityType: 'whatsapp_account',
    entityId: saved.id,
    after: {
      client_id: input.clientId,
      waba_id: input.wabaId,
      phone_number_id: input.phoneNumberId,
      display_name: saved.displayName,
    },
  });
  return saved;
}

async function accountOrThrow(deps: ApiDeps, id: string) {
  const row = await getWhatsappAccount(deps.db, id);
  if (!row) throw notFound(`Conta WhatsApp ${id} não encontrada.`);
  return row;
}

async function graphForAccount(deps: ApiDeps, id: string) {
  const row = await accountOrThrow(deps, id);
  const token = await getWhatsappToken(deps.db, id);
  return { row, graph: deps.metaClientForToken(token) };
}

export async function listWhatsapp(deps: ApiDeps): Promise<PublicWhatsappAccount[]> {
  return listWhatsappAccounts(deps.db);
}

export async function readWhatsappPhones(deps: ApiDeps, accountId: string) {
  const { row, graph } = await graphForAccount(deps, accountId);
  try {
    const phones = await listWhatsappPhoneNumbers(graph, row.wabaId);
    await setWhatsappLastError(deps.db, row.id, null);
    return phones;
  } catch (error) {
    const detail = metaDetail(error);
    if (!detail) throw error;
    await setWhatsappLastError(deps.db, row.id, detail);
    throw unprocessable(detail);
  }
}

export async function readWhatsappTemplates(deps: ApiDeps, accountId: string) {
  const { row, graph } = await graphForAccount(deps, accountId);
  try {
    const templates = await listWhatsappTemplates(graph, row.wabaId);
    await setWhatsappLastError(deps.db, row.id, null);
    return templates;
  } catch (error) {
    const detail = metaDetail(error);
    if (!detail) throw error;
    await setWhatsappLastError(deps.db, row.id, detail);
    throw unprocessable(detail);
  }
}

export async function createWhatsappMessageTemplate(
  deps: ApiDeps,
  actor: WhatsappActor,
  accountId: string,
  input: { name: string; language: string; category: WhatsappTemplateCategory; body: string },
) {
  if (actor.role === 'viewer') throw forbidden('Leitor não cria modelo de WhatsApp.');
  const { row, graph } = await graphForAccount(deps, accountId);
  try {
    const created = await createWhatsappTemplate(graph, row.wabaId, input);
    await audit(deps.db, {
      actor,
      action: 'whatsapp.template',
      entityType: 'whatsapp_account',
      entityId: row.id,
      after: { name: input.name, language: input.language, category: input.category, template_id: created.id },
    });
    return created;
  } catch (error) {
    const detail = metaDetail(error);
    if (!detail) throw error;
    await setWhatsappLastError(deps.db, row.id, detail);
    throw unprocessable(detail);
  }
}

export async function sendWhatsappMessage(
  deps: ApiDeps,
  actor: WhatsappActor,
  accountId: string,
  input: { to: string; template: string; language: string; confirmTo: string },
): Promise<{ message_id: string }> {
  assertWhatsappSend(actor.role, input.confirmTo, input.to);
  const { row, graph } = await graphForAccount(deps, accountId);
  const destination = input.to.replace(/^\+/, '');
  try {
    const sent = await sendWhatsappTemplate(graph, row.phoneNumberId, {
      to: destination,
      template: input.template,
      language: input.language,
    });
    const messageId = sent.messages?.[0]?.id;
    if (!messageId) throw unprocessable('A Meta não devolveu o id da mensagem.');
    await audit(deps.db, {
      actor,
      action: 'whatsapp.send',
      entityType: 'whatsapp_account',
      entityId: row.id,
      metaRequest: { to: destination, template: input.template, language: input.language },
      metaResponse: { message_id: messageId },
      after: { to: destination, template: input.template, message_id: messageId },
    });
    return { message_id: messageId };
  } catch (error) {
    const detail = metaDetail(error);
    if (!detail) throw error;
    await setWhatsappLastError(deps.db, row.id, detail);
    await audit(deps.db, {
      actor,
      action: 'whatsapp.send',
      entityType: 'whatsapp_account',
      entityId: row.id,
      metaRequest: { to: destination, template: input.template, language: input.language },
      metaResponse: { error: detail },
    });
    throw unprocessable(detail);
  }
}
