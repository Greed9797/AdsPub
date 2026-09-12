/**
 * Prova do achado A5: com análise já registrada, o worker não baixa o
 * original nem acorda o ffmpeg; arquivo fora do limite falha antes do
 * download. O storage falso explode se for chamado.
 *
 * Escreve no banco local de desenvolvimento (uma análise de prova).
 *
 *   DATABASE_URL=postgres://adpub:adpub@localhost:55432/adpub pnpm prova:a5
 */
import { AiClient, trackedInvoker } from '@adpub/ai';
import { createDb, getAssetsByIds, insertAnalysis } from '@adpub/db';
import {
  CONTENT_PROMPT_VERSION,
  assertMediaWithinLimits,
  contentInputHash,
} from '@adpub/creative-intel';
import { analyzeAsset, expectedAnalysisTimestamps } from '../apps/worker/src/analysis/run.js';
import type { WorkerContext } from '../apps/worker/src/context.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL ausente');
const { db, sql } = createDb(url);

let storageCalls = 0;
const ctx = {
  db,
  log: { warn: () => undefined, info: () => undefined },
  storage: {
    async get() {
      storageCalls += 1;
      throw new Error('storage não deveria ser chamado em cache hit');
    },
  },
} as unknown as WorkerContext;

let providerCalls = 0;
const ai = new AiClient({
  invoke: trackedInvoker(async () => {
    providerCalls += 1;
    throw new Error('provedor não deveria ser chamado em cache hit');
  }, undefined),
  models: { generation: 'claude-sonnet-4-6', classify: 'claude-haiku-4-5' },
});

const assetId = await sql`
  select id from assets where kind = 'video' and duration_ms is not null limit 1
`.then((rows) => {
  const id = rows[0]?.id;
  if (typeof id !== 'string') throw new Error('nenhum vídeo com duração no seed local');
  return id;
});
const asset = (await getAssetsByIds(db, [assetId]))[0]!;

const model = ai.contentBackend().model;
const timestamps = expectedAnalysisTimestamps({ kind: asset.kind, durationMs: asset.durationMs });
if (!timestamps) throw new Error('grade previsível esperada para vídeo com duração');

// Reexecução: a prova apaga a própria linha antes de gravar de novo.
await sql`delete from content_analyses where input_hash like 'prova-a5%'`;

await insertAnalysis(db, {
  assetId: asset.id,
  assetSha: asset.sha256,
  promptVersion: CONTENT_PROMPT_VERSION,
  modelId: model,
  schemaVersion: '1',
  inputHash: contentInputHash({
    assetSha256: asset.sha256,
    model,
    promptVersion: CONTENT_PROMPT_VERSION,
    brandContext: 'prova-a5',
    timestamps,
    transcriptStatus: 'unavailable',
  }),
  findings: { observations: [], limitations: ['prova A5'] },
  coverage: { observed: timestamps.map((t) => [t, t]), transcript: 'unavailable' },
  revision: 1,
});

const hit = await analyzeAsset(ctx, ai, asset.id, { brandContext: 'prova-a5' });
console.log(
  hit.cached && storageCalls === 0 && providerCalls === 0
    ? `OK: cache hit sem download, sem ffmpeg e sem provedor (storage=${storageCalls}, ia=${providerCalls})`
    : `FALHA: cached=${hit.cached} storage=${storageCalls} ia=${providerCalls}`,
);

const before = storageCalls;
let message = '';
try {
  assertMediaWithinLimits({ ...asset, sizeBytes: 80 * 1024 * 1024 });
} catch (error) {
  message = error instanceof Error ? error.message : String(error);
}
console.log(
  message.includes('excede o limite') && storageCalls === before
    ? `OK: fora do limite falha antes do download (${message})`
    : `FALHA: message="${message}" storage=${storageCalls}`,
);

await sql.end({ timeout: 5 });
