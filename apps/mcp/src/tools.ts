import * as z from 'zod/v4';
import type { CallToolResult, McpServer } from '@modelcontextprotocol/server';
import type { SessionUser } from '@adpub/shared';
import { ApiError, type ApiClient } from './api.js';
import { SCOPE_WRITE } from './oauth/scopes.js';

export interface ToolContext {
  api: ApiClient;
  user: SessionUser;
  scopes: readonly string[];
}

const LIMIT = 50;

function cut<T>(rows: T[], limit = LIMIT): { total: number; itens: T[]; nota?: string } {
  if (rows.length <= limit) return { total: rows.length, itens: rows };
  return {
    total: rows.length,
    itens: rows.slice(0, limit),
    nota: `mostrando ${limit} de ${rows.length}; refine os filtros para ver o resto`,
  };
}

function asText(payload: unknown): string {
  return typeof payload === 'string' ? payload : JSON.stringify(payload, null, 1);
}

async function run(
  label: string,
  fn: () => Promise<unknown>,
  shape?: (payload: unknown) => unknown,
): Promise<CallToolResult> {
  try {
    const payload = await fn();
    return { content: [{ type: 'text', text: asText(shape ? shape(payload) : payload) }] };
  } catch (error) {
    const message =
      error instanceof ApiError
        ? `${error.message} (HTTP ${error.status})`
        : error instanceof Error
          ? error.message
          : 'falha inesperada';
    return { content: [{ type: 'text', text: `${label}: ${message}` }], isError: true };
  }
}

function writeDenied(context: ToolContext): CallToolResult | undefined {
  if (context.scopes.includes(SCOPE_WRITE)) return undefined;
  return {
    content: [
      {
        type: 'text',
        text: 'Esta ação precisa de permissão de alteração (adpub:write), que não foi autorizada nesta conexão. Peça ao usuário para reconectar o AdPub no aplicativo e marcar "publicar anúncios".',
      },
    ],
    isError: true,
  };
}

export function registerTools(server: McpServer, context: ToolContext): void {
  const { api, user } = context;

  server.registerTool(
    'listar_clientes',
    {
      title: 'Listar clientes',
      description:
        'Clientes cadastrados no AdPub (id, nome, modo de política de criativo). Use o id para filtrar contas, criativos e aprendizados.',
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () =>
      run('listar_clientes', () => api.call(user, '/clients'), (payload) =>
        cut(payload as unknown[]),
      ),
  );

  server.registerTool(
    'listar_contas',
    {
      title: 'Listar contas de anúncio',
      description:
        'Contas de anúncio Meta visíveis para este usuário: id (act_...), nome, moeda, fuso, cliente vinculado e padrões de publicação. Sem client_id, lista todas as contas visíveis.',
      inputSchema: z.object({
        client_id: z.string().optional().describe('UUID do cliente, para listar só as contas dele'),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ client_id }) =>
      run(
        'listar_contas',
        () => api.call(user, '/ad-accounts', { query: { client_id } }),
        (payload) => cut(payload as unknown[]),
      ),
  );

  server.registerTool(
    'saude_das_contas',
    {
      title: 'Saúde das contas',
      description:
        'Situação operacional de cada conta visível: token da Meta vencendo, permissões, última sincronização e problemas detectados. Use antes de publicar ou quando algo parecer travado.',
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => run('saude_das_contas', () => api.call(user, '/health/accounts')),
  );

  server.registerTool(
    'listar_criativos',
    {
      title: 'Listar criativos do cliente',
      description:
        'Biblioteca de mídias do cliente (id, tipo image/video, proporção, status de validação). Os ids servem para montar o plano do lote.',
      inputSchema: z.object({
        client_id: z.string().describe('UUID do cliente (obrigatório)'),
        kind: z.enum(['image', 'video']).optional().describe('Filtrar por tipo de mídia'),
        status: z.enum(['ok', 'rejected']).optional().describe('Filtrar por validação'),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ client_id, kind, status }) =>
      run(
        'listar_criativos',
        () => api.call(user, '/assets', { query: { client_id, kind, status } }),
        (payload) => cut(payload as unknown[], 100),
      ),
  );

  server.registerTool(
    'listar_lotes',
    {
      title: 'Listar lotes',
      description:
        'Lotes de anúncios visíveis (mais recentes primeiro): id, nome, conta, situação e contagem de itens. Situações: draft (rascunho), ready (validado), blocked (com pendência), queued/publishing (publicando), done, partial, failed, archived.',
      inputSchema: z.object({
        ad_account_id: z.string().optional().describe('Conta de anúncio (act_...)'),
        status: z
          .enum([
            'draft',
            'ready',
            'blocked',
            'queued',
            'publishing',
            'done',
            'partial',
            'failed',
            'archived',
          ])
          .optional(),
        mine: z.boolean().optional().describe('Só os lotes criados por este usuário'),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ ad_account_id, status, mine }) =>
      run(
        'listar_lotes',
        () =>
          api.call(user, '/batches', {
            query: {
              ad_account_id,
              status,
              ...(mine === undefined ? {} : { mine: mine ? 'true' : 'false' }),
            },
          }),
        (payload) => cut(payload as unknown[]),
      ),
  );

  server.registerTool(
    'ver_lote',
    {
      title: 'Ver lote',
      description:
        'Detalhe de um lote: dados da campanha/conjunto, itens com situação individual, pendências de validação, observações do plano e resultado da publicação.',
      inputSchema: z.object({ batch_id: z.string().describe('UUID do lote') }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ batch_id }) => run('ver_lote', () => api.call(user, `/batches/${batch_id}`)),
  );

  server.registerTool(
    'performance_da_conta',
    {
      title: 'Performance da conta',
      description:
        'Métricas da conta no período (gasto, resultados, CPA) vindas dos relatórios importados e/ou da API da Meta. Datas em AAAA-MM-DD; sem elas, o padrão da conta vale.',
      inputSchema: z.object({
        ad_account_id: z.string().describe('Conta de anúncio (act_...)'),
        from: z.string().optional().describe('Data inicial AAAA-MM-DD'),
        to: z.string().optional().describe('Data final AAAA-MM-DD'),
        source: z.enum(['file', 'api']).optional().describe('Origem das métricas'),
        level: z.string().optional().describe('Nível do recorte, quando houver'),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) =>
      run('performance_da_conta', () =>
        api.call(user, '/performance', {
          query: {
            ad_account_id: args.ad_account_id,
            from: args.from,
            to: args.to,
            source: args.source,
            level: args.level,
          },
        }),
      ),
  );

  server.registerTool(
    'aprendizados_do_cliente',
    {
      title: 'Aprendizados do cliente',
      description:
        'Hipóteses e aprendizados registrados para o cliente, com nível de evidência, resultado e o teste que os gerou. Bom ponto de partida para decidir o próximo teste.',
      inputSchema: z.object({ client_id: z.string().describe('UUID do cliente') }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ client_id }) =>
      run('aprendizados_do_cliente', () =>
        api.call(user, '/learnings', { query: { client_id } }),
      ),
  );

  server.registerTool(
    'auditoria',
    {
      title: 'Auditoria',
      description:
        'Trilha de auditoria do AdPub (quem fez o quê, quando): logins, publicação, edições e reconciliações. Restrito a admin e coordinator.',
      inputSchema: z.object({
        entity_type: z.string().optional().describe('Ex.: batch, ad_draft, user'),
        entity_id: z.string().optional().describe('Id da entidade'),
        actor_id: z.string().optional().describe('UUID do usuário que agiu'),
        from: z.string().optional().describe('Data inicial ISO (AAAA-MM-DD)'),
        to: z.string().optional().describe('Data final ISO (AAAA-MM-DD)'),
        limit: z.number().int().min(1).max(200).optional().describe('Padrão 50'),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => run('auditoria', () => api.call(user, '/audit', { query: args })),
  );

  server.registerTool(
    'criar_lote',
    {
      title: 'Criar lote',
      description:
        'Cria um lote de anúncios em rascunho numa conta. mode "ai" deixa a IA montar o plano a partir do briefing; mode "manual" espera o plano enviado por outra ferramenta. Nada é publicado aqui.',
      inputSchema: z.object({
        client_id: z.string().describe('UUID do cliente dono da conta'),
        ad_account_id: z.string().describe('Conta de anúncio (act_...)'),
        name: z.string().describe('Nome do lote'),
        mode: z.enum(['ai', 'manual']).describe('Quem monta o plano'),
        briefing: z.string().optional().describe('Briefing em texto (obrigatório no modo ai)'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (args) => {
      const denied = writeDenied(context);
      if (denied) return denied;
      return run('criar_lote', () => api.call(user, '/batches', { method: 'POST', body: args }));
    },
  );

  server.registerTool(
    'gerar_plano_do_lote',
    {
      title: 'Gerar plano do lote',
      description:
        'Pede à IA o plano de um lote em rascunho (campanhas, conjuntos, copies) a partir do briefing. Custa chamada de IA; sem asset_ids a IA escolhe pelos criativos do cliente.',
      inputSchema: z.object({
        batch_id: z.string().describe('UUID do lote'),
        asset_ids: z.array(z.string()).optional().describe('Ids de criativo a usar'),
        copies_per_creative: z.number().int().min(1).max(5).optional().describe('Padrão 3'),
        regenerate: z.boolean().optional().describe('Refazer um plano já existente'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (args) => {
      const denied = writeDenied(context);
      if (denied) return denied;
      const { batch_id, ...body } = args;
      return run('gerar_plano_do_lote', () =>
        api.call(user, `/batches/${batch_id}/plan`, { method: 'POST', body }),
      );
    },
  );

  server.registerTool(
    'validar_lote',
    {
      title: 'Validar lote',
      description:
        'Roda a validação do lote: confere criativos, textos, política da conta e devolve o que trava a publicação. Rode antes de publicar.',
      inputSchema: z.object({ batch_id: z.string().describe('UUID do lote') }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ batch_id }) => {
      const denied = writeDenied(context);
      if (denied) return denied;
      return run('validar_lote', () =>
        api.call(user, `/batches/${batch_id}/validate`, { method: 'POST' }),
      );
    },
  );

  server.registerTool(
    'publicar_lote',
    {
      title: 'Publicar lote',
      description:
        'Enfileira a publicação dos anúncios do lote na Meta (cria campanha, conjunto, criativo e anúncio). Gasta verba real. Só use depois de validar e depois que o usuário confirmar explicitamente; confirm_count é a quantidade de itens que ele confirmou.',
      inputSchema: z.object({
        batch_id: z.string().describe('UUID do lote'),
        confirm_count: z
          .number()
          .int()
          .min(0)
          .describe('Quantidade de itens que o usuário confirmou publicar'),
        only_failed: z.boolean().optional().describe('Só repetir os itens que falharam'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ batch_id, confirm_count, only_failed }) => {
      const denied = writeDenied(context);
      if (denied) return denied;
      return run('publicar_lote', () =>
        api.call(user, `/batches/${batch_id}/publish`, {
          method: 'POST',
          body: { confirm_count, only_failed: only_failed ?? false },
        }),
      );
    },
  );

  server.registerTool(
    'listar_whatsapp',
    {
      title: 'Listar contas WhatsApp',
      description:
        'Contas WhatsApp conectadas no AdPub (id, cliente, WABA, número). Não devolve token.',
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => run('listar_whatsapp', () => api.call(user, '/whatsapp-accounts')),
  );

  server.registerTool(
    'listar_templates_whatsapp',
    {
      title: 'Listar modelos WhatsApp',
      description: 'Modelos da conta WhatsApp na Cloud API (nome, idioma, categoria, estado).',
      inputSchema: z.object({
        account_id: z.string().describe('UUID da conta WhatsApp no AdPub'),
      }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ account_id }) =>
      run('listar_templates_whatsapp', () => api.call(user, `/whatsapp-accounts/${account_id}/templates`)),
  );

  server.registerTool(
    'criar_template_whatsapp',
    {
      title: 'Criar modelo WhatsApp',
      description:
        'Cria um modelo só com corpo na conta WhatsApp. A Meta precisa aprovar antes do envio.',
      inputSchema: z.object({
        account_id: z.string().describe('UUID da conta WhatsApp no AdPub'),
        name: z.string().describe('Nome em minúsculas, números e _'),
        language: z.string().optional().describe('Código do idioma, padrão pt_BR'),
        category: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']),
        body: z.string().describe('Texto do corpo do modelo'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ account_id, name, language, category, body }) => {
      const denied = writeDenied(context);
      if (denied) return denied;
      return run('criar_template_whatsapp', () =>
        api.call(user, `/whatsapp-accounts/${account_id}/templates`, {
          method: 'POST',
          body: { name, language: language ?? 'pt_BR', category, body },
        }),
      );
    },
  );

  server.registerTool(
    'enviar_template_whatsapp',
    {
      title: 'Enviar modelo WhatsApp',
      description:
        'Envia um modelo aprovado. Recusa se confirm_to não for idêntico ao telefone de destino. Não envia texto livre.',
      inputSchema: z.object({
        account_id: z.string().describe('UUID da conta WhatsApp no AdPub'),
        to: z.string().describe('Telefone de destino com DDI, só dígitos'),
        template: z.string().describe('Nome do modelo aprovado'),
        language: z.string().optional().describe('Código do idioma, padrão pt_BR'),
        confirm_to: z.string().describe('Repita o telefone de destino para confirmar o envio'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ account_id, to, template, language, confirm_to }) => {
      const denied = writeDenied(context);
      if (denied) return denied;
      return run('enviar_template_whatsapp', () =>
        api.call(user, `/whatsapp-accounts/${account_id}/messages`, {
          method: 'POST',
          body: { to, template, language: language ?? 'pt_BR', confirm_to },
        }),
      );
    },
  );
}
