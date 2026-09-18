import { describe, expect, it } from 'vitest';

import { AiClient } from '@adpub/ai';
import type { AiInvoker } from '@adpub/ai';

import { analyzeContent, contentInputHash } from '../src/analyze.js';

/**
 * Etapa 5: seleção de backend, ausência de fallback, separação de cache por
 * modelo e rejeição de evidência fora da grade — sem rede e sem banco.
 */

const MUSE = 'opencode-go/muse-spark-1.3-contributor';
const CLASSIFY = 'claude-haiku-4-6';

const frames = [
  { t: 0, jpeg: new Uint8Array([1]) },
  { t: 1.5, jpeg: new Uint8Array([2]) },
];

function okPayload() {
  return {
    observations: [
      {
        tipo: 'abertura',
        texto: 'Produto em close no primeiro frame',
        evidence_refs: [{ kind: 'frame', t: 0, detail: 'close do produto' }],
      },
    ],
    limitations: ['trecho 5-30s não inspecionado'],
  };
}

function okInvoker(payload: unknown = okPayload()): AiInvoker {
  return async () => ({ input: payload, inputTokens: 100, outputTokens: 50 });
}

describe('contentBackend: seleção sem fallback', () => {
  it('worker com content usa Muse; API sem content conserva classify', () => {
    const contentInvoke = okInvoker();
    const baseInvoke = okInvoker();
    const withContent = new AiClient({
      invoke: baseInvoke,
      models: { generation: 'g', classify: CLASSIFY },
      content: { invoke: contentInvoke, model: MUSE },
    });
    expect(withContent.contentBackend().model).toBe(MUSE);
    expect(withContent.contentBackend().invoke).toBe(contentInvoke);

    const apiOnly = new AiClient({
      invoke: baseInvoke,
      models: { generation: 'g', classify: CLASSIFY },
    });
    expect(apiOnly.contentBackend().model).toBe(CLASSIFY);
    expect(apiOnly.contentBackend().invoke).toBe(baseInvoke);
  });

  it('falha do backend de conteúdo propaga — nunca cai no invoker base', async () => {
    let baseCalled = 0;
    const failing: AiInvoker = async () => {
      throw new Error('Backend de análise indisponível (quota esgotada).');
    };
    const client = new AiClient({
      invoke: async () => {
        baseCalled += 1;
        return { input: okPayload(), inputTokens: 1, outputTokens: 1 };
      },
      models: { generation: 'g', classify: CLASSIFY },
      content: { invoke: failing, model: MUSE },
    });
    const { invoke, model } = client.contentBackend();
    expect(model).toBe(MUSE);
    await expect(
      analyzeContent(invoke, model, {
        assetSha256: 'abc',
        frames,
        transcript: { status: 'unavailable', reason: 'sem provedor' },
        brandContext: 'Loja Teste',
        filename: 'peca.jpg',
      }),
    ).rejects.toThrow(/indisponível/);
    // Sem fallback: o invoker base (Anthropic) jamais foi tocado.
    expect(baseCalled).toBe(0);
  });
});

describe('cache separado por modelo', () => {
  it('Muse nunca reaproveita a entrada de cache do classify e vice-versa', () => {
    const base = {
      assetSha256: 'abc',
      promptVersion: 'content.v1',
      brandContext: 'Loja Teste',
      timestamps: [0, 1.5],
      transcriptStatus: 'unavailable',
    } as const;
    const museHash = contentInputHash({ ...base, model: MUSE });
    const classifyHash = contentInputHash({ ...base, model: CLASSIFY });
    expect(museHash).not.toBe(classifyHash);
  });
});

describe('evidência fora da grade é rejeitada', () => {
  it('frame citado em instante não amostrado reprova a análise', async () => {
    const invoke = okInvoker({
      observations: [
        {
          tipo: 'abertura',
          texto: 'Produto em close',
          evidence_refs: [{ kind: 'frame', t: 9.5, detail: 'frame que ninguém amostrou' }],
        },
      ],
      limitations: [],
    });
    await expect(
      analyzeContent(invoke, MUSE, {
        assetSha256: 'abc',
        frames,
        transcript: { status: 'unavailable', reason: 'sem provedor' },
        brandContext: '',
        filename: 'peca.jpg',
      }),
    ).rejects.toThrow(/não observado/);
  });

  it('transcrição citada quando indisponível reprova a análise', async () => {
    const invoke = okInvoker({
      observations: [
        {
          tipo: 'fala',
          texto: 'Locução inventada',
          evidence_refs: [{ kind: 'transcript', detail: 'fala aos 3s' }],
        },
      ],
      limitations: [],
    });
    await expect(
      analyzeContent(invoke, MUSE, {
        assetSha256: 'abc',
        frames,
        transcript: { status: 'unavailable', reason: 'sem provedor aprovado' },
        brandContext: '',
        filename: 'peca.jpg',
      }),
    ).rejects.toThrow(/transcrição que não foi fornecida/);
  });

  it('falha do provedor nunca resolve análise fabricada', async () => {
    const invoke: AiInvoker = async () => {
      throw new Error('Backend de análise falhou (exit 1).');
    };
    await expect(
      analyzeContent(invoke, MUSE, {
        assetSha256: 'abc',
        frames,
        transcript: { status: 'unavailable', reason: 'x' },
        brandContext: '',
        filename: 'peca.jpg',
      }),
    ).rejects.toThrow(/exit 1/);
  });
});
