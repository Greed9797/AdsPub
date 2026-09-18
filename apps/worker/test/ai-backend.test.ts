import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createWorkerAi } from '../src/ai.js';
import type { WorkerContext } from '../src/context.js';

/**
 * Etapa 5: seleção do backend de análise no worker, sem rede e sem banco.
 * A construção nunca toca provedor — só valida presença de binário, auth e
 * modelo quando `AI_ANALYSIS_PROVIDER=opencode`.
 */

const MUSE = 'opencode-go/muse-spark-1.3-contributor';
const AUTH_ENV = 'OPENCODE_AUTH_FILE';
const previousAuth = process.env[AUTH_ENV];
const previousAuthSet = Object.hasOwn(process.env, AUTH_ENV);
const tempDirs: string[] = [];

function baseEnv(overrides: Record<string, unknown> = {}) {
  return {
    ANTHROPIC_API_KEY: 'e2e-anthropic-key',
    AI_MODEL_GENERATION: 'claude-gen',
    AI_MODEL_CLASSIFY: 'claude-classify',
    AI_PLAN_TIMEOUT_MS: 60_000,
    AI_ANALYSIS_PROVIDER: 'anthropic',
    OPENCODE_BIN: '/usr/local/bin/opencode',
    OPENCODE_ANALYSIS_MODEL: MUSE,
    ...overrides,
  };
}

function ctxFor(env: Record<string, unknown>): WorkerContext {
  return {
    env,
    db: {},
    log: { warn: () => {} },
  } as unknown as WorkerContext;
}

function writeTempBinary(): string {
  const dir = mkdtempSync(join(tmpdir(), 'adpub-worker-bin-'));
  tempDirs.push(dir);
  const binary = join(dir, 'opencode');
  writeFileSync(binary, '#!/bin/sh\nexit 0\n');
  chmodSync(binary, 0o755);
  return binary;
}

function writeTempAuth(): string {
  const dir = mkdtempSync(join(tmpdir(), 'adpub-worker-auth-'));
  tempDirs.push(dir);
  const file = join(dir, 'opencode-auth.json');
  writeFileSync(file, JSON.stringify({ type: 'service_account' }), { mode: 0o600 });
  process.env[AUTH_ENV] = file;
  return file;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  if (previousAuthSet) {
    process.env[AUTH_ENV] = previousAuth as string;
  } else {
    delete process.env[AUTH_ENV];
  }
});

describe('createWorkerAi: backend de análise', () => {
  it('sem chave Anthropic não há cliente de IA', () => {
    expect(createWorkerAi(ctxFor(baseEnv({ ANTHROPIC_API_KEY: '' })))).toBeUndefined();
  });

  it('provedor anthropic conserva o classify como backend de conteúdo', () => {
    const ai = createWorkerAi(ctxFor(baseEnv()))!;
    expect(ai).toBeDefined();
    expect(ai.contentBackend().model).toBe('claude-classify');
  });

  it('provedor opencode entrega Muse como backend de conteúdo', () => {
    const binary = writeTempBinary();
    writeTempAuth();
    const ai = createWorkerAi(
      ctxFor(baseEnv({ AI_ANALYSIS_PROVIDER: 'opencode', OPENCODE_BIN: binary })),
    )!;
    expect(ai.contentBackend().model).toBe(MUSE);
  });

  it('opencode sem binário utilizável é erro explícito, sem fallback', () => {
    writeTempAuth();
    expect(() =>
      createWorkerAi(
        ctxFor(
          baseEnv({ AI_ANALYSIS_PROVIDER: 'opencode', OPENCODE_BIN: '/ausente/opencode' }),
        ),
      ),
    ).toThrow(/sem binário utilizável/);
  });

  it('opencode sem autenticação Go é erro explícito, sem fallback', () => {
    const binary = writeTempBinary();
    process.env[AUTH_ENV] = join(tmpdir(), 'adpub-auth-ausente.json');
    expect(() =>
      createWorkerAi(
        ctxFor(baseEnv({ AI_ANALYSIS_PROVIDER: 'opencode', OPENCODE_BIN: binary })),
      ),
    ).toThrow(/sem autenticação Go/);
  });

  it('opencode sem modelo é erro explícito, sem fallback', () => {
    const binary = writeTempBinary();
    writeTempAuth();
    expect(() =>
      createWorkerAi(
        ctxFor(
          baseEnv({
            AI_ANALYSIS_PROVIDER: 'opencode',
            OPENCODE_BIN: binary,
            OPENCODE_ANALYSIS_MODEL: '',
          }),
        ),
      ),
    ).toThrow(/sem modelo/);
  });
});
