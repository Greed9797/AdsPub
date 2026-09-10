import Anthropic from '@anthropic-ai/sdk';

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
}

export interface AiToolResult {
  input: unknown;
  inputTokens: number;
  outputTokens: number;
}

export type AiInvoker = (request: AiToolRequest) => Promise<AiToolResult>;

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
        system: request.system,
        messages: [{ role: 'user', content }],
        tools: [
          {
            name: request.toolName,
            description: request.toolDescription,
            input_schema: request.inputSchema as Anthropic.Tool['input_schema'],
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
    };
  };
}
