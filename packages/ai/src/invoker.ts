import Anthropic from '@anthropic-ai/sdk';

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
}

export type AiInvoker = (request: AiToolRequest) => Promise<AiToolResult>;

/**
 * Prefixo estável (system + ferramenta) marcado para cache do provedor: o
 * mesmo system/tool se repete em toda chamada do fluxo e o cache cobra menos
 * pela releitura. Bloco abaixo do mínimo de tokens do modelo é ignorado pelo
 * provedor sem erro.
 */
const CACHE_CONTROL = { type: 'ephemeral' } as const;

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
    const response = await client.messages.create(
      {
        model: request.model,
        max_tokens: request.maxTokens ?? 8192,
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
