/**
 * A12: avaliação offline da geração de plano.
 *
 * Roda os casos de `scripts/eval-cases.json` contra o provedor real e grava
 * plano + violações determinísticas + custo/latência num arquivo para
 * revisão. Serve para julgar mudança de prompt ou de modelo com número, em
 * vez de impressão: compare dois arquivos de saída.
 *
 * Uso:
 *   ANTHROPIC_API_KEY=... pnpm tsx scripts/eval-generations.ts
 *   ... --case inverno-cupom --model claude-sonnet-4-6 --out tmp/eval.json --strict
 *
 * Nunca roda no CI: consome API paga e a nota final é humana.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { AiClient, anthropicInvoker, checkPlan, type EvalCase, type PlanContext } from '@adpub/ai';
import { PROMPT_VERSIONS } from '@adpub/ai';

interface CaseFile {
  case: EvalCase;
  context: Omit<PlanContext, 'briefing' | 'copiesPerCreative'>;
}

function arg(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const apiKey = process.env.ANTHROPIC_API_KEY;
const dryRun = process.argv.includes('--dry-run');
if (!apiKey && !dryRun) {
  console.error('ANTHROPIC_API_KEY ausente — a avaliação chama o provedor real (ou use --dry-run).');
  process.exit(2);
}

const model = arg('model', process.env.AI_MODEL_GENERATION ?? 'claude-sonnet-4-6')!;
const onlyCase = arg('case');
const strict = process.argv.includes('--strict');
const out = arg('out', join('tmp', `eval-generations-${Date.now()}.json`))!;

const raw = JSON.parse(await readFile('scripts/eval-cases.json', 'utf8')) as { cases: CaseFile[] };
const cases = raw.cases.filter((entry) => !onlyCase || entry.case.id === onlyCase);
if (cases.length === 0) {
  console.error(`Nenhum caso corresponde a --case ${onlyCase}.`);
  process.exit(2);
}

if (dryRun) {
  for (const entry of cases) {
    console.log(
      `caso ${entry.case.id}: ${entry.context.assets.length} criativo(s), ` +
        `${entry.case.copiesPerCreative} copies por criativo, modelo ${model}`,
    );
  }
  console.log(`OK: ${cases.length} caso(s) carregado(s) de scripts/eval-cases.json.`);
  process.exit(0);
}

const client = new AiClient({
  invoke: anthropicInvoker(apiKey!),
  models: { generation: model, classify: model },
  timeoutMs: 120_000,
});

const results = [];
for (const entry of cases) {
  const context: PlanContext = {
    ...entry.context,
    briefing: entry.case.briefing,
    copiesPerCreative: entry.case.copiesPerCreative,
  };
  const { plan, meta } = await client.generatePlan(context, { scope: `eval:${entry.case.id}` });
  const violations = checkPlan(plan, entry.case);
  results.push({
    id: entry.case.id,
    title: entry.case.title,
    plan,
    violations,
    meta: {
      model: meta.model,
      cached: meta.cached,
      inputTokens: meta.inputTokens,
      outputTokens: meta.outputTokens,
      costUsd: meta.costUsd,
      latencyMs: meta.latencyMs,
    },
  });
  console.log(
    `${violations.length === 0 ? 'OK  ' : 'FALHA'} ${entry.case.id}: ${violations.length} violação(ões), ` +
      `${meta.outputTokens} tokens de saída, US$ ${meta.costUsd.toFixed(4)}, ${meta.latencyMs}ms`,
  );
  for (const violation of violations) {
    console.log(`      - [${violation.code}] ${violation.detail}`);
  }
}

await mkdir(dirname(out), { recursive: true });
await writeFile(
  out,
  `${JSON.stringify({ generatedAt: new Date().toISOString(), model, promptVersion: PROMPT_VERSIONS.plan, results }, null, 2)}\n`,
);
console.log(`\nResultado em ${out}. A nota final é humana: use docs/avaliacao-geracoes.md.`);

if (strict && results.some((result) => result.violations.length > 0)) {
  process.exit(1);
}
