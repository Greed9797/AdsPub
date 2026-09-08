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

export interface GenerationMeta {
  promptVersion: string;
  model: string;
  inputHash: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  cached: boolean;
}

export interface AiCache {
  find(
    purpose: 'plan' | 'copy' | 'policy',
    promptVersion: string,
    inputHash: string,
  ): Promise<{ output: Record<string, unknown> } | undefined>;
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
  constructor(private readonly options: AiClientOptions) {}

  /** FR-006: briefing → BatchPlan validado por schema. */
  async generatePlan(
    ctx: PlanContext,
  ): Promise<{ plan: BatchPlan; dropped: string[]; meta: GenerationMeta }> {
    const promptVersion = PROMPT_VERSIONS.plan;
    const prompt = renderPlanContext(ctx);
    const inputHash = stableHash({ promptVersion, prompt });
    const model = this.options.models.generation;

    const cached = await this.options.cache?.find('plan', promptVersion, inputHash);
    if (cached) {
      const normalized = normalizePlan(cached.output, ctx);
      return {
        ...normalized,
        meta: {
          promptVersion,
          model,
          inputHash,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          latencyMs: 0,
          cached: true,
        },
      };
    }

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

    return { ...normalized, meta };
  }

  /** FR-007: variações de copy no perfil de voz. */
  async generateCopies(ctx: CopyContext): Promise<{ copies: Copy[]; meta: GenerationMeta }> {
    const promptVersion = PROMPT_VERSIONS.copy;
    const prompt = renderCopyContext(ctx);
    const inputHash = stableHash({ promptVersion, prompt });
    const model = this.options.models.generation;

    const cached = await this.options.cache?.find('copy', promptVersion, inputHash);
    if (cached) {
      return {
        copies: this.parseCopies(cached.output, ctx),
        meta: {
          promptVersion,
          model,
          inputHash,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          latencyMs: 0,
          cached: true,
        },
      };
    }

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
  }

  /** R13: classificador de política (modelo mais barato). */
  async classifyPolicy(
    text: string,
    options: { forbiddenTerms?: readonly string[] } = {},
  ): Promise<{ issues: PolicyIssue[]; meta: GenerationMeta }> {
    const promptVersion = PROMPT_VERSIONS.policy;
    const prompt = [
      `Termos proibidos pelo cliente: ${options.forbiddenTerms?.join(', ') || '(nenhum)'}`,
      '',
      'Copy:',
      text,
    ].join('\n');
    const inputHash = stableHash({ promptVersion, prompt });
    const model = this.options.models.classify;

    const cached = await this.options.cache?.find('policy', promptVersion, inputHash);
    if (cached) {
      return {
        issues: policyResultSchema.parse(cached.output).issues.map(withAiSource),
        meta: {
          promptVersion,
          model,
          inputHash,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          latencyMs: 0,
          cached: true,
        },
      };
    }

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
