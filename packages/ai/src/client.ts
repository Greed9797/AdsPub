import { stableHash } from '@adpub/crypto';
import {
  batchPlanJsonSchema,
  copyListJsonSchema,
  copySchema,
  policyIssueSchema,
  toJsonSchema,
  type BatchPlan,
  type Copy,
  type PolicyIssue,
} from '@adpub/shared';
import { z } from 'zod';
import { costUsd } from './cost.js';
import { loadPrompt, PROMPT_VERSIONS } from './prompts.js';
import { renderCopyContext, renderPlanContext, type CopyContext, type PlanContext } from './context.js';
import { AiSchemaError, normalizePlan } from './normalize.js';
import type { AiInvoker } from './invoker.js';

/** De onde veio a resposta: provedor, cache do banco ou chamada em voo reaproveitada. */
export type GenerationSource = 'provider' | 'cache' | 'inflight';

export interface GenerationMeta {
  promptVersion: string;
  /** Modelo que produziu a saída — em cache hit é o da linha guardada. */
  model: string;
  inputHash: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  cached: boolean;
  source: GenerationSource;
}

export interface AiCacheFind {
  purpose: 'plan' | 'copy' | 'policy';
  promptVersion: string;
  model: string;
  inputHash: string;
}

export interface AiCache {
  /** Devolve a saída guardada e o modelo que a produziu (proveniência). */
  find(input: AiCacheFind): Promise<{ output: Record<string, unknown>; model: string } | undefined>;
  save(input: {
    purpose: 'plan' | 'copy' | 'policy';
    promptVersion: string;
    model: string;
    inputHash: string;
    input: Record<string, unknown>;
    output: Record<string, unknown>;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    latencyMs: number;
  }): Promise<void>;
}

/**
 * Opções por chamada. `scope` entra na identidade do cache (o mesmo briefing
 * de clientes diferentes não é o mesmo pedido); `bypassCache` é o contrato
 * explícito de "quero outra alternativa", não de "tenta de novo".
 */
export interface GenerationOptions {
  scope?: string;
  bypassCache?: boolean;
}

export interface AiClientOptions {
  invoke: AiInvoker;
  models: { generation: string; classify: string };
  cache?: AiCache;
  timeoutMs?: number;
  now?: () => number;
}

const policyResultSchema = z.object({ issues: z.array(policyIssueSchema).default([]) });
const copyResultSchema = z.object({ copies: z.array(z.unknown()).min(1) });

export class AiClient {
  /**
   * Chamadas idênticas em voo no mesmo processo são deduplicadas antes de
   * chegar ao provedor: o cache do banco só é consultado antes de chamar e
   * não impede duas requisições simultâneas de pagarem duas vezes.
   */
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(private readonly options: AiClientOptions) {}

  /** T-006-2: invoker + modelo barato para análise de conteúdo (fora do cache plano/copy). */
  contentBackend(): { invoke: AiInvoker; model: string } {
    return { invoke: this.options.invoke, model: this.options.models.classify };
  }

  /** FR-006: briefing → BatchPlan validado por schema. */
  async generatePlan(
    ctx: PlanContext,
    options: GenerationOptions = {},
  ): Promise<{ plan: BatchPlan; dropped: string[]; meta: GenerationMeta }> {
    const promptVersion = PROMPT_VERSIONS.plan;
    const prompt = renderPlanContext(ctx);
    const model = this.options.models.generation;
    const inputHash = this.identity('plan', promptVersion, model, options.scope, prompt);
    const key = `plan:${inputHash}`;

    const cached = options.bypassCache
      ? undefined
      : await this.options.cache?.find({ purpose: 'plan', promptVersion, model, inputHash });
    if (cached) {
      const normalized = normalizePlan(cached.output, ctx);
      return { ...normalized, meta: this.cachedMeta(promptVersion, cached.model, inputHash, 'cache') };
    }

    const existing = this.inFlight.get(key);
    if (existing) {
      const reused = (await existing) as { plan: BatchPlan; dropped: string[] };
      return { ...reused, meta: this.cachedMeta(promptVersion, model, inputHash, 'inflight') };
    }

    const run = async () => {
      const started = this.now();
      const result = await this.options.invoke({
        model,
        system: loadPrompt('plan'),
        prompt,
        toolName: 'submit_batch_plan',
        toolDescription:
          'Devolve o plano completo do lote: campanhas novas, conjuntos novos, itens (criativo × copies) e pendências.',
        inputSchema: batchPlanJsonSchema(),
        ...(this.options.timeoutMs ? { timeoutMs: this.options.timeoutMs } : {}),
      });
      const latencyMs = this.now() - started;
      const normalized = normalizePlan(result.input, ctx);
      const meta: GenerationMeta = {
        promptVersion,
        model,
        inputHash,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd: costUsd(model, result.inputTokens, result.outputTokens),
        latencyMs,
        cached: false,
        source: 'provider',
      };
      await this.options.cache?.save({
        purpose: 'plan',
        promptVersion,
        model,
        inputHash,
        input: { prompt },
        output: normalized.plan as unknown as Record<string, unknown>,
        inputTokens: meta.inputTokens,
        outputTokens: meta.outputTokens,
        costUsd: meta.costUsd,
        latencyMs,
      });
      return { plan: normalized.plan, dropped: normalized.dropped, meta };
    };

    return this.dedupe(key, run);
  }

  /** FR-007: variações de copy no perfil de voz. */
  async generateCopies(
    ctx: CopyContext,
    options: GenerationOptions = {},
  ): Promise<{ copies: Copy[]; meta: GenerationMeta }> {
    const promptVersion = PROMPT_VERSIONS.copy;
    const prompt = renderCopyContext(ctx);
    const model = this.options.models.generation;
    const inputHash = this.identity('copy', promptVersion, model, options.scope, prompt);
    const key = `copy:${inputHash}`;

    const cached = options.bypassCache
      ? undefined
      : await this.options.cache?.find({ purpose: 'copy', promptVersion, model, inputHash });
    if (cached) {
      return {
        copies: this.parseCopies(cached.output, ctx),
        meta: this.cachedMeta(promptVersion, cached.model, inputHash, 'cache'),
      };
    }

    const existing = this.inFlight.get(key);
    if (existing) {
      const reused = (await existing) as { copies: Copy[] };
      return { copies: reused.copies, meta: this.cachedMeta(promptVersion, model, inputHash, 'inflight') };
    }

    const run = async () => {
      const started = this.now();
      const result = await this.options.invoke({
        model,
        system: loadPrompt('copy'),
        prompt,
        toolName: 'submit_copies',
        toolDescription: 'Devolve as variações de copy pedidas.',
        inputSchema: copyListJsonSchema(),
        ...(this.options.timeoutMs ? { timeoutMs: this.options.timeoutMs } : {}),
      });
      const latencyMs = this.now() - started;
      const copies = this.parseCopies(result.input, ctx);
      const meta: GenerationMeta = {
        promptVersion,
        model,
        inputHash,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd: costUsd(model, result.inputTokens, result.outputTokens),
        latencyMs,
        cached: false,
        source: 'provider',
      };
      await this.options.cache?.save({
        purpose: 'copy',
        promptVersion,
        model,
        inputHash,
        input: { prompt },
        output: { copies } as unknown as Record<string, unknown>,
        inputTokens: meta.inputTokens,
        outputTokens: meta.outputTokens,
        costUsd: meta.costUsd,
        latencyMs,
      });
      return { copies, meta };
    };

    return this.dedupe(key, run);
  }

  /** R13: classificador de política (modelo mais barato). */
  async classifyPolicy(
    text: string,
    options: { forbiddenTerms?: readonly string[] } & GenerationOptions = {},
  ): Promise<{ issues: PolicyIssue[]; meta: GenerationMeta }> {
    const promptVersion = PROMPT_VERSIONS.policy;
    const prompt = [
      `Termos proibidos pelo cliente: ${options.forbiddenTerms?.join(', ') || '(nenhum)'}`,
      '',
      'Copy:',
      text,
    ].join('\n');
    const model = this.options.models.classify;
    const inputHash = this.identity('policy', promptVersion, model, options.scope, prompt);
    const key = `policy:${inputHash}`;

    const cached = options.bypassCache
      ? undefined
      : await this.options.cache?.find({ purpose: 'policy', promptVersion, model, inputHash });
    if (cached) {
      return {
        issues: policyResultSchema.parse(cached.output).issues.map(withAiSource),
        meta: this.cachedMeta(promptVersion, cached.model, inputHash, 'cache'),
      };
    }

    const existing = this.inFlight.get(key);
    if (existing) {
      const reused = (await existing) as { issues: PolicyIssue[] };
      return { issues: reused.issues, meta: this.cachedMeta(promptVersion, model, inputHash, 'inflight') };
    }

    const run = async () => {
      const started = this.now();
      const result = await this.options.invoke({
        model,
        system: loadPrompt('policy'),
        prompt,
        toolName: 'submit_policy_review',
        toolDescription: 'Devolve os achados de política encontrados na copy.',
        inputSchema: toJsonSchema(z.object({ issues: z.array(policyIssueSchema) })),
        ...(this.options.timeoutMs ? { timeoutMs: this.options.timeoutMs } : {}),
      });
      const latencyMs = this.now() - started;

      const parsed = policyResultSchema.safeParse(result.input);
      if (!parsed.success) {
        throw new AiSchemaError('Resposta do classificador fora do schema.', parsed.error.issues);
      }
      const issues = parsed.data.issues.map(withAiSource);

      const meta: GenerationMeta = {
        promptVersion,
        model,
        inputHash,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd: costUsd(model, result.inputTokens, result.outputTokens),
        latencyMs,
        cached: false,
        source: 'provider',
      };

      await this.options.cache?.save({
        purpose: 'policy',
        promptVersion,
        model,
        inputHash,
        input: { prompt },
        output: { issues },
        inputTokens: meta.inputTokens,
        outputTokens: meta.outputTokens,
        costUsd: meta.costUsd,
        latencyMs,
      });

      return { issues, meta };
    };

    return this.dedupe(key, run);
  }

  /**
   * Identidade do cache: finalidade, versão do prompt, **modelo** e escopo.
   * Sem modelo, trocar de modelo devolvia a saída do anterior com o rótulo
   * novo; sem escopo, o mesmo texto de clientes diferentes era um só pedido.
   */
  private identity(
    purpose: 'plan' | 'copy' | 'policy',
    promptVersion: string,
    model: string,
    scope: string | undefined,
    prompt: string,
  ): string {
    return stableHash({ purpose, promptVersion, model, scope: scope ?? null, prompt });
  }

  private cachedMeta(
    promptVersion: string,
    model: string,
    inputHash: string,
    source: 'cache' | 'inflight',
  ): GenerationMeta {
    return {
      promptVersion,
      model,
      inputHash,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      latencyMs: 0,
      cached: true,
      source,
    };
  }

  private dedupe<T>(key: string, run: () => Promise<T>): Promise<T> {
    const tracked = run().finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, tracked);
    return tracked;
  }

  private parseCopies(raw: unknown, ctx: CopyContext): Copy[] {
    const parsed = copyResultSchema.safeParse(raw);
    if (!parsed.success) {
      throw new AiSchemaError('Copies fora do schema.', parsed.error.issues);
    }
    return parsed.data.copies.slice(0, ctx.variations).map((copy) => copySchema.parse(copy));
  }

  private now(): number {
    return this.options.now ? this.options.now() : Date.now();
  }
}

function withAiSource(issue: PolicyIssue): PolicyIssue {
  return { ...issue, source: 'ai' };
}
