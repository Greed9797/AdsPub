import { and, eq } from 'drizzle-orm';
import type { AiPurpose } from '@adpub/shared';
import { aiGenerations } from '../schema.js';
import type { AiGenerationRow } from '../schema.js';
import type { Database } from '../client.js';

export interface GenerationInput {
  batchId?: string | null;
  purpose: AiPurpose;
  promptVersion: string;
  model: string;
  inputHash: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
}

/** R12: cache por sha256(prompt_version + modelo + input dentro do escopo). */
export async function findCachedGeneration(
  db: Database,
  purpose: AiPurpose,
  promptVersion: string,
  model: string,
  inputHash: string,
): Promise<AiGenerationRow | undefined> {
  const [row] = await db
    .select()
    .from(aiGenerations)
    .where(
      and(
        eq(aiGenerations.purpose, purpose),
        eq(aiGenerations.promptVersion, promptVersion),
        eq(aiGenerations.model, model),
        eq(aiGenerations.inputHash, inputHash),
      ),
    );
  return row;
}

export async function saveGeneration(
  db: Database,
  input: GenerationInput,
): Promise<AiGenerationRow> {
  const [row] = await db
    .insert(aiGenerations)
    .values({
      batchId: input.batchId ?? null,
      purpose: input.purpose,
      promptVersion: input.promptVersion,
      model: input.model,
      inputHash: input.inputHash,
      input: input.input,
      output: input.output,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      costUsd: input.costUsd.toFixed(6),
      latencyMs: input.latencyMs,
    })
    .onConflictDoUpdate({
      target: [aiGenerations.purpose, aiGenerations.promptVersion, aiGenerations.inputHash],
      set: { output: input.output, latencyMs: input.latencyMs },
    })
    .returning();
  if (!row) throw new Error('Falha ao registrar geração de IA.');
  return row;
}

export async function setGenerationFeedback(
  db: Database,
  id: string,
  feedback: 'used' | 'edited' | 'rejected',
): Promise<void> {
  await db.update(aiGenerations).set({ feedback }).where(eq(aiGenerations.id, id));
}
