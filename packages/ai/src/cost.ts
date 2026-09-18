import { AI_CACHE_PRICING, AI_PRICING_USD_PER_MTOK } from '@adpub/config';

/**
 * Custo estimado da chamada. Modelos com tarifa absoluta de cache
 * (`cacheRead`/`cacheWrite`) usam-na; os demais seguem nos multiplicadores
 * sobre a entrada. Reasoning é cobrado à tarifa de saída (convenção do
 * provedor — suposição documentada, não tarifa medida).
 */
export function costUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cache: { readTokens?: number; creationTokens?: number; reasoningTokens?: number } = {},
): number {
  const price = AI_PRICING_USD_PER_MTOK[model] ?? AI_PRICING_USD_PER_MTOK.default!;
  const readRate = price.cacheRead ?? price.input * AI_CACHE_PRICING.readMultiplier;
  const writeRate = price.cacheWrite ?? price.input * AI_CACHE_PRICING.writeMultiplier;
  const cacheRead = (cache.readTokens ?? 0) * readRate;
  const cacheWrite = (cache.creationTokens ?? 0) * writeRate;
  const reasoning = (cache.reasoningTokens ?? 0) * price.output;
  return (inputTokens * price.input + outputTokens * price.output + cacheRead + cacheWrite + reasoning) / 1_000_000;
}
