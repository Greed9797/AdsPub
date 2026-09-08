import { AI_PRICING_USD_PER_MTOK } from '@adpub/config';

export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = AI_PRICING_USD_PER_MTOK[model] ?? AI_PRICING_USD_PER_MTOK.default!;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}
