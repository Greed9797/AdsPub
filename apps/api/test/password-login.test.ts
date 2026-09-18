import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { z } from 'zod';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LOGIN_FAILED_MESSAGE, hashPassword, mintSessionToken } from '@adpub/auth';
import {
  createDb,
  createUser,
  setUserActive,
  truncateAllTables,
  type Database,
} from '@adpub/db';
import { buildApp } from '../src/app.js';
import type { ApiDeps } from '../src/lib/deps.js';
import {
  LOGIN_MAX_FAILURES,
  LOGIN_WINDOW_SECONDS,
  memoryLoginThrottle,
  redisLoginThrottle,
} from '../src/lib/login-throttle.js';

const execFile = promisify(execFileCallback);
const POSTGRES_BASE_URL =
  process.env['E2E_POSTGRES_BASE_URL'] ?? 'postgres://adpub:adpub@127.0.0.1:55432';
const DATABASE = 'adpub_api_test';
const AUTH_SECRET = 'api-test-secret-api-test-secret-01';
const DOMAIN = 'empresa.com.br';
const PASSWORD = 'senha-correta-0123456789';
const createdUserSchema = z.object({ id: z.string().uuid() });
process.env['ADPUB_ALLOW_TRUNCATE'] = '1';

let db: Database;
let app: FastifyInstance;

function testDeps(throttle: ApiDeps['loginThrottle'] | null = memoryLoginThrottle()): ApiDeps {
  return {
    db,
    storage: {},
    queues: {},
    env: {
      authSecret: AUTH_SECRET,
      allowedDomain: DOMAIN,
      metaApiVersion: 'v25.0',
      metaTier: 'limited',
      usePolicyAi: false,
      featureAiAnalysis: true,
      featureReports: true,
      featureInsights: true,
    },
    loginThrottle: throttle ?? undefined,
    metaClientFor: async () => {
      throw new Error('sem Meta neste teste');
    },
    metaClientForToken: () => {
      throw new Error('sem Meta neste teste');
    },
  } as unknown as ApiDeps;
}

const loginHeaders = { 'x-adpub-login-secret': AUTH_SECRET };

async function passwordLogin(email: string, password: string, target: FastifyInstance = app) {
  return target.inject({
    method: 'POST',
    url: '/api/v1/auth/password/login',
    headers: loginHeaders,
    payload: { email, password },
  });
}

async function seedUser(input: {
  email: string;
  role?: 'admin' | 'coordinator' | 'manager' | 'viewer';
  active?: boolean;
  password?: string;
}) {
  const user = await createUser(db, {
    email: input.email,
    name: 'Teste',
    role: input.role ?? 'manager',
    passwordHash: hashPassword(input.password ?? PASSWORD),
  });
  if (input.active === false) await setUserActive(db, user.id, false);
  return user;
}

async function adminToken(email = 'admin@empresa.com.br'): Promise<string> {
  const user = await seedUser({ email, role: 'admin' });
  return mintSessionToken(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    AUTH_SECRET,
  );
}

beforeAll(async () => {
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
  const created = createDb(`${POSTGRES_BASE_URL}/${DATABASE}`, { max: 4, onNotice: () => {} });
  db = created.db;
  app = await buildApp(testDeps());
}, 120_000);

beforeEach(async () => {
  await truncateAllTables(db, `${POSTGRES_BASE_URL}/${DATABASE}`);
});

afterAll(async () => {
  await app?.close();
  await db?.$client.end({ timeout: 5 });
});

describe('bootstrap do primeiro admin', () => {
  it('disponível no banco vazio, cria admin e desliga para sempre', async () => {
    const empty = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/password/bootstrap',
      headers: loginHeaders,
    });
    expect(empty.statusCode).toBe(200);
    expect(empty.json().available).toBe(true);

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password/bootstrap',
      headers: loginHeaders,
      payload: { email: 'admin@empresa.com.br', name: 'Admin', password: 'admin-senha-0123456789' },
    });
    expect(created.statusCode).toBe(200);
    expect(created.json()).toMatchObject({ email: 'admin@empresa.com.br', role: 'admin' });

    const after = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/password/bootstrap',
      headers: loginHeaders,
    });
    expect(after.json().available).toBe(false);

    const again = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password/bootstrap',
      headers: loginHeaders,
      payload: { email: 'outro@empresa.com.br', name: 'Outro', password: 'outra-senha-0123456789' },
    });
    expect(again.statusCode).toBe(404);
  });

  it('exige o segredo compartilhado e o domínio', async () => {
    const noSecret = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/password/bootstrap',
    });
    expect(noSecret.statusCode).toBe(403);

    const outside = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password/bootstrap',
      headers: loginHeaders,
      payload: { email: 'alguem@gmail.com', name: 'Alguém', password: 'gmail-senha-0123456789' },
    });
    expect(outside.statusCode).toBe(403);
  });
});

describe('POST /auth/password/login', () => {
  it('sucesso retorna o usuário e audita user.login', async () => {
    await seedUser({ email: 'gestor@empresa.com.br' });
    const response = await passwordLogin('gestor@empresa.com.br', PASSWORD);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ email: 'gestor@empresa.com.br', role: 'manager' });

    const rows = await db.execute(
      `select action from audit_log where action = 'user.login' limit 1`,
    );
    expect(rows.length).toBe(1);
  });

  it('desconhecido, senha errada, inativo e fora do domínio: mesmo 401 genérico', async () => {
    await seedUser({ email: 'ativo@empresa.com.br' });
    await seedUser({ email: 'inativo@empresa.com.br', active: false });

    const cases = [
      passwordLogin('ninguem@empresa.com.br', PASSWORD),
      passwordLogin('ativo@empresa.com.br', 'senha-errada-0000000000'),
      passwordLogin('inativo@empresa.com.br', PASSWORD),
      passwordLogin('alguem@gmail.com', PASSWORD),
    ];
    const responses = await Promise.all(cases);
    for (const response of responses) {
      expect(response.statusCode).toBe(401);
      expect(response.json().detail).toBe(LOGIN_FAILED_MESSAGE);
    }
    const details = new Set(responses.map((response) => response.json().detail));
    expect(details.size).toBe(1);
  });

  it('exige o segredo compartilhado', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password/login',
      payload: { email: 'a@empresa.com.br', password: PASSWORD },
    });
    expect(response.statusCode).toBe(403);
  });

  it(`trava em 429 após ${LOGIN_MAX_FAILURES} falhas`, async () => {
    const email = 'alvo@empresa.com.br';
    await seedUser({ email });
    for (let attempt = 0; attempt < LOGIN_MAX_FAILURES; attempt += 1) {
      const response = await passwordLogin(email, 'senha-errada-0000000000');
      expect(response.statusCode).toBe(401);
    }
    const blocked = await passwordLogin(email, 'senha-errada-0000000000');
    expect(blocked.statusCode).toBe(429);
    // Mesmo a senha certa não passa enquanto o throttle vigora.
    const evenRight = await passwordLogin(email, PASSWORD);
    expect(evenRight.statusCode).toBe(429);
  });

  it('fail-closed: sem leitura do throttle, responde 429', async () => {
    const broken = await buildApp(
      testDeps({
        failures: async () => {
          throw new Error('redis fora');
        },
        registerFailure: async () => 1,
        clear: async () => {},
      }),
    );
    try {
      const response = await passwordLogin('a@empresa.com.br', PASSWORD, broken);
      expect(response.statusCode).toBe(429);
    } finally {
      await broken.close();
    }
  });

  it('a rota antiga do Google não existe mais', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: loginHeaders,
      payload: { email: 'a@empresa.com.br', name: '' },
    });
    // Fora da lista pública e sem rota: o porteiro barra com 401.
    expect(response.statusCode).toBe(401);
  });
  it('sem throttle configurado o login continua funcionando', async () => {
    const bare = await buildApp(testDeps(null));
    try {
      await createUser(db, {
        email: 'solto@empresa.com.br',
        name: 'Solto',
        role: 'manager',
        passwordHash: hashPassword(PASSWORD),
      });
      const response = await passwordLogin('solto@empresa.com.br', PASSWORD, bare);
      expect(response.statusCode).toBe(200);
    } finally {
      await bare.close();
    }
  });
});

describe('gestão de usuários (admin)', () => {
  it('cria, redefine senha e desativa/reativa', async () => {
    const token = await adminToken();
    const auth = { authorization: `Bearer ${token}` };

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: auth,
      payload: {
        email: 'novo@empresa.com.br',
        name: 'Novo',
        role: 'manager',
        password: 'temporaria-0123456789',
      },
    });
    expect(created.statusCode).toBe(200);
    const userId = createdUserSchema.parse(created.json()).id;

    const login = await passwordLogin('novo@empresa.com.br', 'temporaria-0123456789');
    expect(login.statusCode).toBe(200);

    const duplicated = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: auth,
      payload: {
        email: 'novo@empresa.com.br',
        name: 'Novo',
        role: 'manager',
        password: 'temporaria-0123456789',
      },
    });
    expect(duplicated.statusCode).toBe(409);

    const reset = await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${userId}`,
      headers: auth,
      payload: { password: 'redefinida-0123456789' },
    });
    expect(reset.statusCode).toBe(200);
    expect((await passwordLogin('novo@empresa.com.br', 'temporaria-0123456789')).statusCode).toBe(
      401,
    );
    expect((await passwordLogin('novo@empresa.com.br', 'redefinida-0123456789')).statusCode).toBe(
      200,
    );

    const deactivated = await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${userId}`,
      headers: auth,
      payload: { active: false },
    });
    expect(deactivated.statusCode).toBe(200);
    expect(deactivated.json().active).toBe(false);
    const whileInactive = await passwordLogin('novo@empresa.com.br', 'redefinida-0123456789');
    expect(whileInactive.statusCode).toBe(401);
    expect(whileInactive.json().detail).toBe(LOGIN_FAILED_MESSAGE);
  });

  it('não-admin não gerencia', async () => {
    const seeded = await seedUser({ email: 'gerente@empresa.com.br', role: 'manager' });
    const token = await mintSessionToken(
      { id: seeded.id, email: seeded.email, name: seeded.name, role: seeded.role },
      AUTH_SECRET,
    );
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${token}` },
      payload: { email: 'outro@empresa.com.br', name: 'O', role: 'viewer', password: PASSWORD },
    });
    expect(response.statusCode).toBe(403);
  });
});

describe('redisLoginThrottle', () => {
  it('conta, expira e limpa por chave', async () => {
    const redis = new Redis('redis://127.0.0.1:56379/14', { maxRetriesPerRequest: 1 });
    try {
      const throttle = redisLoginThrottle(redis);
      const key = `teste:${Date.now()}:a@empresa.com.br:127.0.0.1`;
      expect(await throttle.failures(key)).toBe(0);
      expect(await throttle.registerFailure(key, LOGIN_WINDOW_SECONDS)).toBe(1);
      expect(await throttle.registerFailure(key, LOGIN_WINDOW_SECONDS)).toBe(2);
      expect(await throttle.failures(key)).toBe(2);
      await throttle.clear(key);
      expect(await throttle.failures(key)).toBe(0);
    } finally {
      redis.disconnect();
    }
  });

  it('memoryLoginThrottle tem a mesma semântica', async () => {
    const throttle = memoryLoginThrottle();
    const key = 'a@empresa.com.br:127.0.0.1';
    expect(await throttle.failures(key)).toBe(0);
    await throttle.registerFailure(key, LOGIN_WINDOW_SECONDS);
    expect(await throttle.failures(key)).toBe(1);
    await throttle.clear(key);
    expect(await throttle.failures(key)).toBe(0);
  });
});

