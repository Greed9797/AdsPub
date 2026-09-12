import { AI_CACHE_PRICING, AI_PRICING_USD_PER_MTOK } from '@adpub/config';

/**
 * Custo estimado da chamada. Tokens de cache de prefixo têm preço próprio:
 * leitura mais barata que entrada nova, escrita mais cara.
 */
export function costUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cache: { readTokens?: number; creationTokens?: number } = {},
): number {
  const price = AI_PRICING_USD_PER_MTOK[model] ?? AI_PRICING_USD_PER_MTOK.default!;
  const cacheRead = (cache.readTokens ?? 0) * price.input * AI_CACHE_PRICING.readMultiplier;
  const cacheWrite = (cache.creationTokens ?? 0) * price.input * AI_CACHE_PRICING.writeMultiplier;
  return (inputTokens * price.input + outputTokens * price.output + cacheRead + cacheWrite) / 1_000_000;
}
