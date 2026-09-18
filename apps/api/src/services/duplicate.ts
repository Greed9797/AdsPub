import {
  audit,
  createBatch,
  deleteBatch,
  getAccount,
  getBatch,
  listAdsetsCache,
  listCampaignsCache,
  listDraftsOfBatch,
  type AdDraftRow,
  type AdsetCacheRow,
  type BatchRow,
  type CampaignCacheRow,
} from '@adpub/db';
import {
  batchPlanSchema,
  billingEventSchema,
  objectiveSchema,
  optimizationGoalSchema,
  type AdsetSpec,
  type BatchPlan,
  type CampaignSpec,
  type ObjectRef,
  type PendingField,
  type PlanItem,
  type SessionUser,
} from '@adpub/shared';
import { notFound, unprocessable } from '../lib/problem.js';
import type { ApiDeps } from '../lib/deps.js';
import { loadBatchContext } from './batch-context.js';
import { assertPlanStructure, setManualPlan } from './batch-plan.js';

/** Chave estável da campanha/conjunto copiado: mesma origem, mesma chave. */
function copiedKey(prefixo: 'campanha' | 'conjunto', id: string): string {
  return `copia-${prefixo}-${id}`;
}

/** Campo do `raw` do cache: jsonb cru, então cada leitura é checada. */
function rawField(raw: Record<string, unknown>, field: string): unknown {
  return field in raw ? raw[field] : undefined;
}

/**
 * Campanha existente na conta de origem vira especificação de campanha nova na
 * conta de destino: o ID da conta A não existe em B. O que a sincronização
 * trouxe (nome, objetivo, categorias) é o que dá para copiar — orçamento e
 * público não são lidos, então entram como pendência da revisão.
 *
 * O objetivo vem da Meta como texto livre: só entra no plano se for um dos
 * objetivos que o app cria (FR-020 proíbe recriar campanha legada).
 */
function campaignSpecFromCache(
  row: CampaignCacheRow,
): (CampaignSpec & { key: string }) | undefined {
  const objective = objectiveSchema.safeParse(row.objective);
  if (!objective.success) return undefined;
  const categorias = rawField(row.raw, 'special_ad_categories');
  return {
    key: copiedKey('campanha', row.id),
    name: row.name,
    objective: objective.data,
    buying_type: 'AUCTION',
    special_ad_categories: Array.isArray(categorias)
      ? categorias.filter((categoria): categoria is string => typeof categoria === 'string')
      : [],
  };
}

/**
 * Mesma conversão para o conjunto. Sem otimização/cobrança reconhecidas o
 * conjunto não pode ser recriado — publicar criaria algo diferente do original.
 */
function adsetSpecFromCache(
  row: AdsetCacheRow,
  campaignKey: string | undefined,
): (AdsetSpec & { key: string }) | undefined {
  const goal = optimizationGoalSchema.safeParse(row.optimizationGoal);
  if (!goal.success) return undefined;
  const billing = billingEventSchema.safeParse(rawField(row.raw, 'billing_event'));
  const promoted = rawField(row.raw, 'promoted_object');
  return {
    key: copiedKey('conjunto', row.id),
    name: row.name,
    optimization_goal: goal.data,
    billing_event: billing.success ? billing.data : 'IMPRESSIONS',
    advantage_audience: true,
    ...(promoted && typeof promoted === 'object' && !Array.isArray(promoted)
      ? { promoted_object: { ...promoted } }
      : {}),
    ...(campaignKey ? { campaign_key: campaignKey } : {}),
  };
}

interface PlanBuild {
  plan: BatchPlan;
  /** Objetos da conta de origem que passaram a ser criados no destino. */
  convertidos: string[];
}

/**
 * US7/FR-025: a cópia é um plano revisável, não uma lista de itens soltos. Sem
 * plano gravado, toda ref `new` chega ao worker sem especificação e o item só
 * falha em `ensure_campaign` — depois de passar por validação, revisão e fila.
 */
async function planFromSource(
  deps: ApiDeps,
  input: { source: BatchRow; items: readonly AdDraftRow[]; targetAccountId: string },
): Promise<PlanBuild> {
  const sourcePlan = input.source.plan;
  const mesmaConta = input.source.adAccountId === input.targetAccountId;

  // Cache da conta de origem: é de lá que sai a especificação de uma campanha
  // ou conjunto que hoje é apenas um ID.
  const [campanhasOrigem, conjuntosOrigem] = mesmaConta
    ? [[] as CampaignCacheRow[], [] as AdsetCacheRow[]]
    : await Promise.all([
        listCampaignsCache(deps.db, input.source.adAccountId),
        listAdsetsCache(deps.db, input.source.adAccountId),
      ]);
  const campanhaPorId = new Map(campanhasOrigem.map((row) => [row.id, row]));
  const conjuntoPorId = new Map(conjuntosOrigem.map((row) => [row.id, row]));

  const campaigns = new Map<string, CampaignSpec & { key: string }>();
  const adsets = new Map<string, AdsetSpec & { key: string }>();
  const pending: PendingField[] = [];
  const convertidos: string[] = [];
  const semEspecificacao: string[] = [];
  const incopiaveis: string[] = [];

  const items: PlanItem[] = [];

  input.items.forEach((item, index) => {
    const rotulo = `item ${index + 1}`;
    const campanhaDoItem = item.campaignRef;
    const conjuntoDoItem = item.adsetRef;

    // --- campanha ---
    let campaignRef: ObjectRef = campanhaDoItem;
    if (campanhaDoItem.kind === 'new') {
      const spec = (sourcePlan?.campaigns ?? []).find(
        (campaign) => campaign.key === campanhaDoItem.key,
      );
      if (!spec) semEspecificacao.push(`${rotulo}: campanha "${campanhaDoItem.key}"`);
      else campaigns.set(spec.key, spec);
    } else if (!mesmaConta) {
      const cached = campanhaPorId.get(campanhaDoItem.id);
      const spec = cached ? campaignSpecFromCache(cached) : undefined;
      if (!cached) {
        semEspecificacao.push(`${rotulo}: campanha ${campanhaDoItem.id}`);
      } else if (!spec) {
        incopiaveis.push(`${rotulo}: campanha "${cached.name}" (objetivo ${cached.objective})`);
      } else {
        campaigns.set(spec.key, spec);
        campaignRef = { kind: 'new', key: spec.key };
        convertidos.push(`campanha ${cached.name}`);
        pending.push({
          field: `campaigns.${spec.key}.daily_budget_cents`,
          reason: `Orçamento da campanha "${cached.name}" não vem da conta de origem: confirme antes de publicar.`,
          item_index: index,
        });
      }
    }

    // --- conjunto ---
    let adsetRef: ObjectRef = conjuntoDoItem;
    if (conjuntoDoItem.kind === 'new') {
      const spec = (sourcePlan?.adsets ?? []).find((adset) => adset.key === conjuntoDoItem.key);
      if (!spec) semEspecificacao.push(`${rotulo}: conjunto "${conjuntoDoItem.key}"`);
      else adsets.set(spec.key, spec);
    } else if (!mesmaConta) {
      const cached = conjuntoPorId.get(conjuntoDoItem.id);
      const spec = cached
        ? adsetSpecFromCache(cached, campaignRef.kind === 'new' ? campaignRef.key : undefined)
        : undefined;
      if (!cached) {
        semEspecificacao.push(`${rotulo}: conjunto ${conjuntoDoItem.id}`);
      } else if (!spec) {
        incopiaveis.push(
          `${rotulo}: conjunto "${cached.name}" (otimização ${cached.optimizationGoal})`,
        );
      } else {
        adsets.set(spec.key, spec);
        adsetRef = { kind: 'new', key: spec.key };
        convertidos.push(`conjunto ${cached.name}`);
        pending.push({
          field: `adsets.${spec.key}.targeting`,
          reason: `Público e orçamento do conjunto "${cached.name}" não vêm da conta de origem: confira antes de publicar.`,
          item_index: index,
        });
      }
    }

    items.push({
      format: item.format,
      asset_ids: item.assetIds,
      campaign_ref: campaignRef,
      adset_ref: adsetRef,
      copies: [item.copy],
    });
  });

  if (incopiaveis.length > 0) {
    throw unprocessable(
      `Estrutura da conta de origem não pode ser recriada — ${incopiaveis.join('; ')}. ` +
        'Objetivo/otimização fora dos que o app cria (FR-020): aponte o lote para uma estrutura ' +
        'suportada antes de duplicar.',
    );
  }
  if (semEspecificacao.length > 0) {
    throw unprocessable(
      `Sem como recriar a estrutura na conta de destino — ${semEspecificacao.join('; ')}. ` +
        'Sincronize a conta de origem ou refaça o plano do lote antes de duplicar.',
    );
  }

  const plan = batchPlanSchema.parse({
    campaigns: [...campaigns.values()],
    adsets: [...adsets.values()],
    items,
    pending,
    notes: `Cópia do lote "${input.source.name}". Estrutura da conta de origem recriada no destino.`,
  });

  return { plan, convertidos: [...new Set(convertidos)] };
}

/**
 * US7/FR-025: duplicar um lote para outra conta reaproveita copies e criativos,
 * mas revalida tudo (página, pixel, nomenclatura mudam por conta) e entrega um
 * plano que a revisão pode conferir e publicar.
 */
export async function duplicateBatch(
  deps: ApiDeps,
  actor: SessionUser,
  input: { batchId: string; targetAdAccountId: string; name?: string },
): Promise<{ batch: BatchRow; items: AdDraftRow[] }> {
  const source = await getBatch(deps.db, input.batchId);
  if (!source) throw notFound(`Lote ${input.batchId} não encontrado.`);

  const target = await getAccount(deps.db, input.targetAdAccountId);
  if (!target) throw notFound(`Conta ${input.targetAdAccountId} não encontrada.`);
  if (target.clientId !== source.clientId) {
    throw unprocessable('A conta de destino pertence a outro cliente.');
  }

  const sourceItems = await listDraftsOfBatch(deps.db, source.id);
  if (sourceItems.length === 0) throw unprocessable('O lote de origem não tem itens.');

  const { plan, convertidos } = await planFromSource(deps, {
    source,
    items: sourceItems,
    targetAccountId: target.id,
  });

  // Estrutura conferida contra a conta de destino antes de criar o lote: plano
  // impossível recusa aqui, sem deixar lote vazio para trás.
  const ctx = await loadBatchContext(deps, { clientId: source.clientId, adAccountId: target.id });
  assertPlanStructure(plan, ctx);

  const copy = await createBatch(deps.db, {
    name: input.name ?? `${source.name} (cópia)`,
    clientId: source.clientId,
    adAccountId: target.id,
    createdBy: actor.id,
    mode: source.mode,
    briefing: source.briefing,
    options: source.options,
    duplicatedFrom: source.id,
  });

  // `setManualPlan` grava plano + itens numa transação (`swapBatchPlan`), mas a
  // cópia nasce antes: se a gravação falhar, a cópia vazia é apagada como
  // compensação best-effort (itens caem em cascata). A auditoria fica fora do
  // `try` — cópia gravada nunca é apagada por falha de auditoria — e falha da
  // compensação nunca mascara o erro original.
  let result: { batch: BatchRow; items: AdDraftRow[] };
  try {
    // Mesmo caminho do plano manual: grava o plano, expande os itens, revalida
    // com os padrões da conta de destino e nasce sem aprovação.
    result = await setManualPlan(deps, actor, { batchId: copy.id, plan });
  } catch (error) {
    try {
      await deleteBatch(deps.db, copy.id);
    } catch {
      // Compensação best-effort: o erro original é o que importa.
    }
    throw error;
  }

  await audit(deps.db, {
    actor: { id: actor.id, email: actor.email },
    action: 'batch.duplicate',
    entityType: 'batch',
    entityId: copy.id,
    after: {
      from: source.id,
      to_account: target.id,
      items: result.items.length,
      recriados: convertidos,
    },
  });

  return result;
}
