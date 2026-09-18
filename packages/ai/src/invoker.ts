import Anthropic from '@anthropic-ai/sdk';
import { AI_MAX_TOKENS_BY_PURPOSE } from '@adpub/config';

/** Finalidade da chamada, para contabilidade de custo por fluxo. */
export type AiUsagePurpose = 'plan' | 'copy' | 'policy' | 'analysis' | 'report' | 'unknown';

/** Chamada de tool use forçado. Abstraída para permitir teste sem rede. */
export interface AiImage {
  mediaType: 'image/jpeg' | 'image/png';
  data: string;
}

export interface AiToolRequest {
  model: string;
  system: string;
  prompt: string;
  /** T-006-2: frames para análise visual (ausente = texto puro, como antes). */
  images?: AiImage[];
  toolName: string;
  toolDescription: string;
  inputSchema: Record<string, unknown>;
  maxTokens?: number;
  timeoutMs?: number;
  /** Só para contabilidade: qual fluxo pediu esta chamada. */
  purpose?: AiUsagePurpose;
  /** Só para contabilidade: a quem atribuir o consumo. */
  attribution?: AiUsageAttribution;
}

/** Atribuição do consumo; o provedor ignora, a contabilidade usa. */
export interface AiUsageAttribution {
  clientId?: string | null;
  batchId?: string | null;
  assetId?: string | null;
}

export interface AiToolResult {
  input: unknown;
  inputTokens: number;
  outputTokens: number;
  /** Tokens lidos de cache de prefixo do provedor, quando houver. */
  cacheReadTokens?: number;
  /** Tokens gravados em cache de prefixo do provedor, quando houver. */
  cacheCreationTokens?: number;
  /** Tokens de reasoning do provedor (OpenCode `step_finish`), quando houver. */
  reasoningTokens?: number;
}

export type AiInvoker = (request: AiToolRequest) => Promise<AiToolResult>;

/**
 * Prefixo estável (system + ferramenta) marcado para cache do provedor: o
 * mesmo system/tool se repete em toda chamada do fluxo e o cache cobra menos
 * pela releitura. Bloco abaixo do mínimo de tokens do modelo é ignorado pelo
 * provedor sem erro.
 */
const CACHE_CONTROL = { type: 'ephemeral' } as const;

/** Teto de saída da chamada: explícito, ou o padrão da finalidade. */
export function maxTokensFor(request: Pick<AiToolRequest, 'purpose' | 'maxTokens'>): number {
  if (request.maxTokens !== undefined) return request.maxTokens;
  return AI_MAX_TOKENS_BY_PURPOSE[request.purpose ?? 'unknown'];
}

/**
 * Saída cortada no limite é falha explícita, não schema inválido: sem isto o
 * erro aparecia como "resposta em formato inesperado" e escondia a causa
 * (limite baixo para o tamanho da resposta).
 */
export function assertResponseComplete(input: {
  stopReason: string | null;
  outputTokens: number;
  maxTokens: number;
  purpose?: string;
}): void {
  if (input.stopReason !== 'max_tokens') return;
  throw new Error(
    `Resposta da IA truncada no limite de ${input.maxTokens} tokens ` +
      `(finalidade ${input.purpose ?? 'unknown'}, ${input.outputTokens} tokens gerados).`,
  );
}

export function anthropicInvoker(apiKey: string): AiInvoker {
  const client = new Anthropic({ apiKey });
  return async (request) => {
    const content: Anthropic.ContentBlockParam[] = [
      ...(request.images ?? []).map(
        (image): Anthropic.ImageBlockParam => ({
          type: 'image',
          source: { type: 'base64', media_type: image.mediaType, data: image.data },
        }),
      ),
      { type: 'text', text: request.prompt },
    ];
    const maxTokens = maxTokensFor(request);
    const response = await client.messages.create(
      {
        model: request.model,
        max_tokens: maxTokens,
        system: [{ type: 'text', text: request.system, cache_control: CACHE_CONTROL }],
        messages: [{ role: 'user', content }],
        tools: [
          {
            name: request.toolName,
            description: request.toolDescription,
            input_schema: request.inputSchema as Anthropic.Tool['input_schema'],
            cache_control: CACHE_CONTROL,
          },
        ],
        tool_choice: { type: 'tool', name: request.toolName },
      },
      { timeout: request.timeoutMs ?? 40_000 },
    );

    assertResponseComplete({
      stopReason: response.stop_reason,
      outputTokens: response.usage.output_tokens,
      maxTokens,
      ...(request.purpose ? { purpose: request.purpose } : {}),
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );
    if (!toolUse) {
      throw new Error('A IA não devolveu o tool use obrigatório.');
    }
    return {
      input: toolUse.input,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      ...(response.usage.cache_read_input_tokens
        ? { cacheReadTokens: response.usage.cache_read_input_tokens }
        : {}),
      ...(response.usage.cache_creation_input_tokens
        ? { cacheCreationTokens: response.usage.cache_creation_input_tokens }
        : {}),
    };
  };
}
