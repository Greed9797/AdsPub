/**
 * Prova do achado A1: com análise visual registrada para o criativo, o prompt
 * do plano contém as observações; sem análise, ele diz que não viu a peça.
 *
 * Usa o banco local de desenvolvimento e um invoker falso (nenhuma chamada
 * paga). Escreve no banco: cria um lote de prova, apaga as análises do ativo
 * escolhido (para a primeira fase ser honestamente "sem análise") e grava uma
 * análise de prova na segunda fase.
 *
 *   DATABASE_URL=postgres://adpub:adpub@localhost:55432/adpub pnpm prova:a1
 */
import { AiClient, type AiToolRequest } from '@adpub/ai';
import { createBatch, createDb, insertAnalysis } from '@adpub/db';
import { aiCacheFor, generatePlan } from '../apps/api/src/services/batch-plan.js';
import type { ApiDeps } from '../apps/api/src/lib/deps.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL ausente');

const { db, sql } = createDb(url);
const clientRow = await sql`select id from clients limit 1`.then((rows) => rows[0]);
const asset = await sql`select id from assets where client_id = ${clientRow.id} limit 1`.then(
  (rows) => rows[0],
);
if (!clientRow || !asset) throw new Error('seed do banco local ausente (cliente com ativo)');

// Lote próprio da prova: o banco de desenvolvimento muda entre execuções, e
// depender do estado que sobrou de outro teste esconde a causa da falha.
await sql`delete from content_analyses where asset_id = ${asset.id}`;
await sql`delete from batches where name like 'Prova A1%'`;
const account = await sql`
  select id from ad_accounts where client_id = ${clientRow.id} limit 1
`.then((rows) => rows[0] ?? { id: 'act_demo' });
const batch = await createBatch(db, {
  clientId: clientRow.id,
  adAccountId: account.id,
  createdBy: null,
  name: `Prova A1 (${new Date().toISOString()})`,
  mode: 'ai',
  briefing: 'Prova do contexto visual: oferta de inverno com 20% OFF.',
  options: { initial_status: 'PAUSED', max_items: 200, dry_run: false },
});

const prompts: string[] = [];
const invoke = async (request: AiToolRequest) => {
  prompts.push(`${request.system}\n${request.prompt}`);
  return {
    input: {
      campaigns: [
        {
          key: 'c1',
          name: 'campanha-1',
          objective: 'OUTCOME_SALES',
          buying_type: 'AUCTION',
          special_ad_categories: [],
        },
      ],
      adsets: [
        {
          key: 'a1',
          name: 'conjunto-1',
          optimization_goal: 'OFFSITE_CONVERSIONS',
          billing_event: 'IMPRESSIONS',
          campaign_key: 'c1',
        },
      ],
      items: [
        {
          format: 'single_video',
          asset_ids: [asset.id],
          campaign_ref: { kind: 'new', key: 'c1' },
          adset_ref: { kind: 'new', key: 'a1' },
          copies: [
            {
              primary_text: 'Texto de prova.',
              headline: 'Título',
              description: 'Descrição',
              cta: 'SHOP_NOW',
              link: 'https://demo.com.br',
            },
          ],
        },
      ],
      notes: '',
    },
    inputTokens: 1,
    outputTokens: 1,
  };
};

const deps = {
  db,
  env: { usePolicyAi: false, featureAiAnalysis: true, featureReports: true, featureInsights: true },
} as unknown as ApiDeps;
deps.ai = new AiClient({
  invoke,
  models: { generation: 'claude-sonnet-4-6', classify: 'claude-haiku-4-5' },
  cache: aiCacheFor(deps, null),
});

const OBSERVATION = 'Pessoa segurando casaco verde sobre fundo claro';

const run = async (label: string) => {
  prompts.length = 0;
  await generatePlan(
    deps,
    { id: '00000000-0000-4000-8000-000000000001', email: 'prova@local', role: 'admin' } as never,
    { batchId: batch.id, assetIds: [asset.id], copiesPerCreative: 1, regenerate: true },
  );
  const prompt = prompts[0] ?? '';
  console.log(`\n=== ${label} ===`);
  for (const line of prompt.split('\n')) {
    if (/observado na peça|sem análise visual|limite da análise/.test(line)) {
      console.log(`  ${line.trim()}`);
    }
  }
  return prompt;
};

const semAnalise = await run('sem análise registrada');
console.log(
  semAnalise.includes('sem análise visual')
    ? 'OK: ausência declarada no prompt'
    : 'FALHA: ausência não declarada',
);

await insertAnalysis(db, {
  assetId: asset.id,
  assetSha: 'prova-a1',
  promptVersion: 'content.v1',
  modelId: 'claude-haiku-4-5',
  schemaVersion: '1',
  inputHash: `prova-a1-${Date.now()}`,
  findings: {
    observations: [
      {
        tipo: 'visual',
        texto: OBSERVATION,
        evidence_refs: [{ kind: 'frame', t: 0, detail: 'frame em t=0' }],
      },
    ],
    limitations: ['transcrição indisponível'],
  },
  coverage: { observed: [[0, 0]], transcript: 'unavailable' },
  revision: 2,
});

const comAnalise = await run('com análise registrada (revisão 2)');
const entregou = comAnalise.includes(OBSERVATION);
const origem = comAnalise.includes('corrigida por pessoa');
const limite = comAnalise.includes('limite da análise');
console.log(
  entregou && origem && limite
    ? 'OK: observação, origem e limite chegaram ao prompt'
    : `FALHA: observação=${entregou} origem=${origem} limite=${limite}`,
);

await sql.end({ timeout: 5 });
