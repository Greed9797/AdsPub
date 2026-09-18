import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { opencodeInvoker } from '../src/opencode.js';
import type { AiToolRequest } from '../src/invoker.js';

/**
 * Etapa 5: protocolo e isolamento do adaptador OpenCode, sem modelo real.
 * A fixture é um executável Node descartável (tmp + chmod +x), um por modo,
 * porque o adaptador só passa ambiente mínimo ao subprocesso — o modo vai
 * embutido no próprio binário. Prova protocolo/isolamento; a visão real é
 * provada na etapa 3, fora deste gate.
 */

const AUTH_ENV = 'OPENCODE_AUTH_FILE';
const previousAuth: string | undefined = process.env[AUTH_ENV];
const previousAuthSet = Object.hasOwn(process.env, AUTH_ENV);
const tempDirs: string[] = [];

function track(dir: string): string {
  tempDirs.push(dir);
  return dir;
}

function baseRequest(overrides: Partial<AiToolRequest> = {}): AiToolRequest {
  return {
    model: 'opencode-go/muse-spark-1.3-contributor',
    system: 'sistema de teste',
    prompt: 'descreva as imagens',
    toolName: 'submit_content_analysis',
    toolDescription: 'devolve JSON conforme schema',
    inputSchema: { type: 'object' },
    timeoutMs: 10_000,
    ...overrides,
  };
}

type FixtureMode =
  | 'ok'
  | 'invalid-json'
  | 'error-event'
  | 'hang'
  | 'oversize-stdout'
  | 'oversize-stderr'
  | 'tool-use'
  | 'missing-metrics';

/**
 * Executável fixture: `agent list` prova o agente restrito; `run` emite
 * NDJSON conforme a fixture de protocolo da versão fixada. `recordFile`
 * recebe um JSON por invocação `run` (útil para provar isolamento).
 */
function writeFixture(mode: FixtureMode, recordFile?: string): string {
  const dir = track(mkdtempSync(join(tmpdir(), 'adpub-opencode-fixture-')));
  const binary = join(dir, 'opencode-fixture');
  const script = `#!/usr/bin/env node
const fs = require('node:fs');
const mode = ${JSON.stringify(mode)};
const recordFile = ${JSON.stringify(recordFile ?? null)};
const argv = process.argv.slice(2);
function ndjson(obj) { process.stdout.write(JSON.stringify(obj) + '\\n'); }
if (argv[0] === 'agent') {
  process.stdout.write('Agents:\\n  adpub-analysis (primary)\\n');
  process.exit(0);
}
if (argv[0] !== 'run') { process.stderr.write('unknown command'); process.exit(2); }
if (recordFile) {
  const dirIdx = argv.indexOf('--dir');
  const files = argv.filter((a, i) => argv[i - 1] === '--file');
  fs.appendFileSync(recordFile, JSON.stringify({ dir: dirIdx >= 0 ? argv[dirIdx + 1] : null, files }) + '\\n');
}
const session = 'sess-' + Math.random().toString(36).slice(2);
const okTokens = { input: 10, output: 20, reasoning: 0, cache: { read: 0, write: 0 } };
const finalJson = JSON.stringify({ observations: [], limitations: [] });
switch (mode) {
  case 'ok':
    ndjson({ type: 'step_start', sessionID: session });
    ndjson({ type: 'text', sessionID: session, part: { id: 'p1', text: finalJson } });
    ndjson({ type: 'step_finish', sessionID: session, part: { reason: 'stop', tokens: okTokens } });
    process.exit(0);
    break;
  case 'invalid-json':
    ndjson({ type: 'text', sessionID: session, part: { id: 'p1', text: 'isto não é JSON {{{' } });
    ndjson({ type: 'step_finish', sessionID: session, part: { reason: 'stop', tokens: okTokens } });
    process.exit(0);
    break;
  case 'error-event':
    ndjson({ type: 'error', sessionID: session, error: { data: { message: 'quota esgotada' } } });
    process.exit(0);
    break;
  case 'hang':
    setInterval(() => {}, 1000);
    break;
  case 'oversize-stdout':
    for (let i = 0; i < 33; i++) fs.writeSync(1, Buffer.alloc(65536, 'x'));
    process.exit(0);
    break;
  case 'oversize-stderr':
    for (let i = 0; i < 3; i++) fs.writeSync(2, Buffer.alloc(65536, 'e'));
    ndjson({ type: 'text', sessionID: session, part: { id: 'p1', text: finalJson } });
    ndjson({ type: 'step_finish', sessionID: session, part: { reason: 'stop', tokens: okTokens } });
    process.exit(0);
    break;
  case 'tool-use':
    ndjson({ type: 'tool_use', sessionID: session, part: { id: 't1' } });
    process.exit(0);
    break;
  case 'missing-metrics':
    ndjson({ type: 'text', sessionID: session, part: { id: 'p1', text: finalJson } });
    ndjson({ type: 'step_finish', sessionID: session, part: { reason: 'stop' } });
    process.exit(0);
    break;
  default:
    process.exit(3);
}
`;
  writeFileSync(binary, script, { mode: 0o755 });
  chmodSync(binary, 0o755);
  return binary;
}

function writeAuthFile(): string {
  const dir = track(mkdtempSync(join(tmpdir(), 'adpub-opencode-auth-')));
  const file = join(dir, 'auth.json');
  writeFileSync(file, JSON.stringify({ type: 'service_account', project_id: 'e2e' }), {
    mode: 0o600,
  });
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

describe('opencodeInvoker (fixture local, sem CLI real)', () => {
  it('resposta multimodal válida vira AiToolResult com tokens', async () => {
    writeAuthFile();
    const invoke = opencodeInvoker({ binary: writeFixture('ok') });
    const result = await invoke(
      baseRequest({
        images: [
          { mediaType: 'image/jpeg', data: Buffer.from('frame-a').toString('base64') },
          { mediaType: 'image/jpeg', data: Buffer.from('frame-b').toString('base64') },
        ],
      }),
    );
    expect(result.input).toEqual({ observations: [], limitations: [] });
    expect(result.inputTokens).toBe(10);
    expect(result.outputTokens).toBe(20);
  });

  it('JSON final inválido falha sem consertar a saída', async () => {
    writeAuthFile();
    const invoke = opencodeInvoker({ binary: writeFixture('invalid-json') });
    await expect(invoke(baseRequest())).rejects.toThrow(/JSON final inválido/);
  });

  it('binário inexistente falha explícito antes de qualquer spawn', async () => {
    writeAuthFile();
    const invoke = opencodeInvoker({ binary: '/definitivamente/ausente/opencode' });
    await expect(invoke(baseRequest())).rejects.toThrow(/binário ausente/);
  });

  it('evento de erro com exit 0 falha com a mensagem do provedor', async () => {
    writeAuthFile();
    const invoke = opencodeInvoker({ binary: writeFixture('error-event') });
    await expect(invoke(baseRequest())).rejects.toThrow(/quota esgotada/);
  });

  it('timeout curto encerra o subprocesso sem travar o gate', async () => {
    writeAuthFile();
    const invoke = opencodeInvoker({ binary: writeFixture('hang') });
    await expect(invoke(baseRequest({ timeoutMs: 300 }))).rejects.toThrow(/timeout de 300ms/);
  });

  it('stdout além de 2 MiB é falha, não truncamento aceito', async () => {
    writeAuthFile();
    const invoke = opencodeInvoker({ binary: writeFixture('oversize-stdout') });
    await expect(invoke(baseRequest())).rejects.toThrow(/limite de stdout/);
  }, 20_000);

  it('stderr além de 64 KiB é falha, não truncamento aceito', async () => {
    writeAuthFile();
    const invoke = opencodeInvoker({ binary: writeFixture('oversize-stderr') });
    await expect(invoke(baseRequest())).rejects.toThrow(/limite de stderr/);
  }, 20_000);

  it('tentativa de tool_use reprova a chamada', async () => {
    writeAuthFile();
    const invoke = opencodeInvoker({ binary: writeFixture('tool-use') });
    await expect(invoke(baseRequest())).rejects.toThrow(/tentou usar ferramenta/);
  });

  it('métricas obrigatórias ausentes são erro de protocolo', async () => {
    writeAuthFile();
    const invoke = opencodeInvoker({ binary: writeFixture('missing-metrics') });
    await expect(invoke(baseRequest())).rejects.toThrow(/não concluiu/);
  });

  it('duas requisições não compartilham sessão/arquivos', async () => {
    writeAuthFile();
    const dir = track(mkdtempSync(join(tmpdir(), 'adpub-opencode-record-')));
    const recordFile = join(dir, 'runs.ndjson');
    writeFileSync(recordFile, '');
    const invoke = opencodeInvoker({ binary: writeFixture('ok', recordFile) });
    await invoke(baseRequest());
    await invoke(baseRequest());
    const lines = readFileSync(recordFile, 'utf8')
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as { dir: string; files: string[] });
    expect(lines).toHaveLength(2);
    // Diretórios temporários exclusivos por chamada (sessão nova, sem reuso).
    expect(lines[0]!.dir).toBeTruthy();
    expect(lines[1]!.dir).toBeTruthy();
    expect(lines[0]!.dir).not.toBe(lines[1]!.dir);
  });
});
