import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRole, currentUser } from '../plugins/auth.js';
import { whatsappAccountDto } from '../lib/dto.js';
import type { ApiDeps } from '../lib/deps.js';
import {
  WHATSAPP_WRITERS,
  connectWhatsappAccount,
  createWhatsappMessageTemplate,
  listWhatsapp,
  readWhatsappPhones,
  readWhatsappTemplates,
  sendWhatsappMessage,
} from '../services/whatsapp.js';

const idParams = z.object({ id: z.string().uuid() });
const phone = z.string().regex(/^\+?\d{8,15}$/, 'Telefone em dígitos, com DDI.');

const connectBody = z.object({
  client_id: z.string().uuid(),
  waba_id: z.string().regex(/^\d+$/, 'WABA id numérico.'),
  phone_number_id: z.string().regex(/^\d+$/, 'Phone number id numérico.'),
  display_name: z.string().trim().max(120).optional(),
  token: z.string().trim().min(20),
});

const templateBody = z.object({
  name: z.string().regex(/^[a-z0-9_]+$/, 'Nome do modelo em minúsculas, números e _.'),
  language: z.string().regex(/^[a-z]{2}(_[A-Z]{2})?$/, 'Idioma no formato pt_BR.'),
  category: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']),
  body: z.string().trim().min(1).max(1024),
});

const sendBody = z.object({
  to: phone,
  template: z.string().regex(/^[a-z0-9_]+$/),
  language: z.string().regex(/^[a-z]{2}(_[A-Z]{2})?$/),
  confirm_to: phone,
});

export function whatsappRoutes(app: FastifyInstance, deps: ApiDeps): void {
  app.get('/whatsapp-accounts', async (request) => {
    currentUser(request);
    const rows = await listWhatsapp(deps);
    return rows.map(whatsappAccountDto);
  });

  app.post('/whatsapp-accounts', async (request, reply) => {
    const user = requireRole(request, WHATSAPP_WRITERS);
    const body = connectBody.parse(request.body);
    const saved = await connectWhatsappAccount(deps, { ...user, ip: request.ip }, {
      clientId: body.client_id,
      wabaId: body.waba_id,
      phoneNumberId: body.phone_number_id,
      displayName: body.display_name ?? '',
      token: body.token,
    });
    return reply.status(201).send(whatsappAccountDto(saved));
  });

  app.get('/whatsapp-accounts/:id/phone-numbers', async (request) => {
    currentUser(request);
    const { id } = idParams.parse(request.params);
    return readWhatsappPhones(deps, id);
  });

  app.get('/whatsapp-accounts/:id/templates', async (request) => {
    currentUser(request);
    const { id } = idParams.parse(request.params);
    return readWhatsappTemplates(deps, id);
  });

  app.post('/whatsapp-accounts/:id/templates', async (request, reply) => {
    const user = requireRole(request, WHATSAPP_WRITERS);
    const { id } = idParams.parse(request.params);
    const body = templateBody.parse(request.body);
    const created = await createWhatsappMessageTemplate(deps, { ...user, ip: request.ip }, id, body);
    return reply.status(201).send(created);
  });

  app.post('/whatsapp-accounts/:id/messages', async (request) => {
    const user = requireRole(request, WHATSAPP_WRITERS);
    const { id } = idParams.parse(request.params);
    const body = sendBody.parse(request.body);
    return sendWhatsappMessage(deps, { ...user, ip: request.ip }, id, {
      to: body.to,
      template: body.template,
      language: body.language,
      confirmTo: body.confirm_to,
    });
  });
}
