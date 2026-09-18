import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword, mintSessionToken } from '@adpub/auth';
import { createDb, createUser, truncateAllTables, type Database } from '@adpub/db';
import { mcpConfig } from '../src/config.js';
import { buildMcpApp } from '../src/app.js';
import { pkceChallenge } from '../src/oauth/hash.js';

/**
 * Fluxo completo do OAuth do MCP no banco de teste: registro dinâmico,
 * consentimento, PKCE, refresh com detecção de replay, revogação e chamada de
 * ferramenta. A API do AdPub é um `fetch` falso — nada sai para a rede.
 */

const execFile = promisify(execFileCallback);
const POSTGRES_BASE_URL =
  process.env['E2E_POSTGRES_BASE_URL'] ?? 'postgres://adpub:adpub@127.0.0.1:55432';
const DATABASE = 'adpub_mcp_test';
const AUTH_SECRET = 'mcp-test-secret-mcp-test-secret-01';
const PORT = 4311;
const PUBLIC_URL = `http://127.0.0.1:${PORT}/mcp`;
const REDIRECT_URI = 'https://cliente.exemplo/callback';

let db: Database;
let app: FastifyInstance;
let admin: { id: string; email: string; name: string; role: string };

async function prepareDatabase(): Promise<void> {
  const maintenance = createDb(`${POSTGRES_BASE_URL}/postgres`, { max: 1, onNotice: () => {} });
  try {
    const exists = await maintenance.sql`select 1 from pg_database where datname = ${DATABASE}`;
    if (exists.length === 0) await maintenance.sql.unsafe(`create database "${DATABASE}"`);
  } finally {
    await maintenance.sql.end({ timeout: 5 });
  }
  await execFile('pnpm', ['--filter', '@adpub/db', 'run', 'migrate'], {
    cwd: fileURLToPath(new URL('../../..', import.meta.url)),
    env: { ...process.env, DATABASE_URL: `${POSTGRES_BASE_URL}/${DATABASE}` },
  });
}

/** Resposta pode vir em JSON puro ou em SSE; o teste aceita as duas. */
async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (response.headers.get('content-type')?.includes('text/event-stream')) {
    const line = text
      .split('\n')
      .find((candidate) => candidate.startsWith('data: '));
    return JSON.parse((line ?? '').slice('data: '.length)) as Record<string, unknown>;
  }
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

async function mcPost(token: string, body: unknown): Promise<Response> {
  return fetch(PUBLIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function registerClient(): Promise<string> {
  const response = await fetch(`http://127.0.0.1:${PORT}/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Teste',
      redirect_uris: [REDIRECT_URI],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }),
  });
  expect(response.status).toBe(201);
  const body = (await response.json()) as { client_id: string };
  return body.client_id;
}

async function authorize(clientId: string, verifier: string, cookie: string): Promise<string> {
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    state: 'estado-123',
    code_challenge: pkceChallenge(verifier),
    code_challenge_method: 'S256',
    resource: PUBLIC_URL,
  });
  const page = await fetch(`http://127.0.0.1:${PORT}/authorize?${query}`, {
    headers: { cookie },
  });
  expect(page.status).toBe(200);
  const html = await page.text();
  const csrf = /name="csrf" value="([^"]+)"/.exec(html)?.[1] ?? '';
  expect(csrf).not.toBe('');

  const approved = await fetch(`http://127.0.0.1:${PORT}/authorize`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
    redirect: 'manual',
    body: new URLSearchParams({
      csrf,
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      state: 'estado-123',
      code_challenge: pkceChallenge(verifier),
      resource: PUBLIC_URL,
      scope_write: '1',
      decision: 'approve',
    }),
  });
  expect(approved.status).toBe(302);
  const location = new URL(approved.headers.get('location') ?? '');
  expect(location.searchParams.get('iss')).toBe(`http://127.0.0.1:${PORT}`);
  expect(location.searchParams.get('state')).toBe('estado-123');
  return location.searchParams.get('code') ?? '';
}

async function tokenExchange(fields: Record<string, string>): Promise<Response> {
  return fetch(`http://127.0.0.1:${PORT}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
  });
}

beforeAll(async () => {
  await prepareDatabase();
  process.env['DATABASE_URL'] = `${POSTGRES_BASE_URL}/${DATABASE}`;
  process.env['AUTH_SECRET'] = AUTH_SECRET;
  process.env['MCP_PUBLIC_URL'] = PUBLIC_URL;
  process.env['MCP_PORT'] = String(PORT);
  process.env['API_URL'] = 'http://api.invalida';
  process.env['LOG_LEVEL'] = 'warn';
  process.env['ADPUB_ALLOW_TRUNCATE'] = '1';

  const created = createDb(process.env['DATABASE_URL'], { max: 4, onNotice: () => {} });
  db = created.db;
  await truncateAllTables(db, process.env['DATABASE_URL']);
  admin = await createUser(db, {
    email: 'admin@empresa.com.br',
    name: 'Admin Teste',
    role: 'admin',
    passwordHash: hashPassword('mcp-teste-senha-0123456789'),
  });

  app = await buildMcpApp({
    db,
    config: mcpConfig(),
    fetchImpl: (async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes('/ad-accounts')) {
        return Response.json([
          { id: 'act_1', name: 'Conta Teste', currency: 'BRL', client_id: null },
        ]);
      }
      return Response.json({ items: [], total: 0 });
    }) as typeof fetch,
  });
  await app.listen({ port: PORT, host: '127.0.0.1' });
}, 60_000);

afterAll(async () => {
  await app?.close();
  await db?.$client.end({ timeout: 5 });
});

describe('descoberta e porteiro', () => {
  it('publica os metadados do recurso e do authorization server', async () => {
    const resource = await fetch(
      `http://127.0.0.1:${PORT}/.well-known/oauth-protected-resource/mcp`,
    );
    const resourceBody = (await resource.json()) as Record<string, unknown>;
    expect(resourceBody['resource']).toBe(PUBLIC_URL);
    expect(resourceBody['authorization_servers']).toEqual([`http://127.0.0.1:${PORT}`]);

    const as = await fetch(`http://127.0.0.1:${PORT}/.well-known/oauth-authorization-server`);
    const asBody = (await as.json()) as Record<string, unknown>;
    expect(asBody['registration_endpoint']).toBe(`http://127.0.0.1:${PORT}/register`);
    expect(asBody['code_challenge_methods_supported']).toEqual(['S256']);
  });

  it('sem token, responde 401 com o desafio apontando para o recurso', async () => {
    const response = await mcPost('', { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain(
      `resource_metadata="http://127.0.0.1:${PORT}/.well-known/oauth-protected-resource/mcp"`,
    );
  });

  it('recusa redirect_uri não https no registro dinâmico', async () => {
    const response = await fetch(`http://127.0.0.1:${PORT}/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ redirect_uris: ['http://exemplo.invalido/callback'] }),
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toBe('invalid_redirect_uri');
  });
});

describe('fluxo de autorização', () => {
  it('manda para o login quando não há sessão', async () => {
    const clientId = await registerClient();
    const response = await fetch(
      `http://127.0.0.1:${PORT}/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&code_challenge=abc&code_challenge_method=S256`,
      { redirect: 'manual' },
    );
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toContain('/login?next=');
  });

  it('troca código por tokens, chama ferramenta e renova', async () => {
    const clientId = await registerClient();
    const sessionCookie = `adpub_session=${await mintSessionToken(
      { id: admin.id, email: admin.email, name: admin.name, role: 'admin' },
      AUTH_SECRET,
    )}`;

    const verifier = 'verificador-de-teste-com-mais-de-quarenta-e-tres-caracteres';
    const code = await authorize(clientId, verifier, sessionCookie);
    expect(code).not.toBe('');

    const exchanged = await tokenExchange({
      grant_type: 'authorization_code',
      client_id: clientId,
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
      resource: PUBLIC_URL,
    });
    expect(exchanged.status).toBe(200);
    const tokens = (await exchanged.json()) as {
      access_token: string;
      refresh_token: string;
      scope: string;
      token_type: string;
      expires_in: number;
    };
    expect(tokens.token_type).toBe('Bearer');
    expect(tokens.expires_in).toBe(3600);
    expect(tokens.scope).toBe('adpub:read adpub:write');

    const reused = await tokenExchange({
      grant_type: 'authorization_code',
      client_id: clientId,
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
      resource: PUBLIC_URL,
    });
    expect(reused.status).toBe(400);
    expect(((await reused.json()) as { error: string }).error).toBe('invalid_grant');

    const listed = await mcPost(tokens.access_token, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    });
    expect(listed.status).toBe(200);
    const tools = (await readJson(listed)) as {
      result: { tools: Array<{ name: string }> };
    };
    expect(tools.result.tools.map((tool) => tool.name)).toContain('publicar_lote');

    const called = await mcPost(tokens.access_token, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'listar_contas', arguments: {} },
    });
    const callBody = (await readJson(called)) as {
      result: { content: Array<{ text: string }>; isError?: boolean };
    };
    expect(callBody.result.isError).toBeUndefined();
    expect(callBody.result.content[0]?.text).toContain('Conta Teste');

    const refreshed = await tokenExchange({
      grant_type: 'refresh_token',
      client_id: clientId,
      refresh_token: tokens.refresh_token,
    });
    expect(refreshed.status).toBe(200);
    const next = (await refreshed.json()) as { access_token: string; refresh_token: string };
    expect(next.access_token).not.toBe(tokens.access_token);

    // Replay do refresh antigo derruba a corrente: o token novo também cai.
    const replayed = await tokenExchange({
      grant_type: 'refresh_token',
      client_id: clientId,
      refresh_token: tokens.refresh_token,
    });
    expect(replayed.status).toBe(400);
    expect(((await replayed.json()) as { error: string }).error).toBe('invalid_grant');

    const afterReplay = await mcPost(next.access_token, {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/list',
    });
    expect(afterReplay.status).toBe(401);
  });

  it('recusa code_verifier que não confere', async () => {
    const clientId = await registerClient();
    const sessionCookie = `adpub_session=${await mintSessionToken(
      { id: admin.id, email: admin.email, name: admin.name, role: 'admin' },
      AUTH_SECRET,
    )}`;
    const code = await authorize(
      clientId,
      'outro-verificador-com-mais-de-quarenta-e-tres-caracteres-ok',
      sessionCookie,
    );

    const response = await tokenExchange({
      grant_type: 'authorization_code',
      client_id: clientId,
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: 'verificador-errado-com-mais-de-quarenta-e-tres-caracteres',
      resource: PUBLIC_URL,
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toBe('invalid_grant');
  });

  it('revoga o token de acesso', async () => {
    const clientId = await registerClient();
    const sessionCookie = `adpub_session=${await mintSessionToken(
      { id: admin.id, email: admin.email, name: admin.name, role: 'admin' },
      AUTH_SECRET,
    )}`;
    const verifier = 'verificador-de-revogacao-com-mais-de-quarenta-e-tres-caracteres';
    const code = await authorize(clientId, verifier, sessionCookie);
    const exchanged = await tokenExchange({
      grant_type: 'authorization_code',
      client_id: clientId,
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
      resource: PUBLIC_URL,
    });
    const tokens = (await exchanged.json()) as { access_token: string };

    const revoked = await fetch(`http://127.0.0.1:${PORT}/revoke`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: tokens.access_token, client_id: clientId }),
    });
    expect(revoked.status).toBe(200);

    const after = await mcPost(tokens.access_token, {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/list',
    });
    expect(after.status).toBe(401);
  });
});
