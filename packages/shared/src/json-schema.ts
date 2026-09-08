import { z } from 'zod';
import { batchPlanSchema, copySchema } from './schemas.js';

/**
 * JSON Schema para tool use da Anthropic (R12). O schema zod é a fonte de
 * verdade; a IA recebe exatamente ele.
 */
export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, { target: 'draft-7', io: 'input' }) as Record<string, unknown>;
}

export const batchPlanJsonSchema = (): Record<string, unknown> => toJsonSchema(batchPlanSchema);
export const copyListJsonSchema = (): Record<string, unknown> =>
  toJsonSchema(z.object({ copies: z.array(copySchema).min(1).max(5) }));
