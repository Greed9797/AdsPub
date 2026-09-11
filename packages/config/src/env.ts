import { z } from 'zod';

/**
 * Parsing de ambiente (T003). Falha rápido quando falta segredo obrigatório.
 * Os loaders são funções — nunca validam no import — para que build/test
 * do monorepo não exijam credenciais.
 */

const nonEmpty = z.string().min(1);

export const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: nonEmpty,
    REDIS_URL: nonEmpty.default('redis://localhost:6379'),

    S3_ENDPOINT: nonEmpty,
    S3_BUCKET: nonEmpty,
    S3_REGION: nonEmpty.default('us-east-1'),
    S3_ACCESS_KEY: nonEmpty,
    S3_SECRET_KEY: nonEmpty,

    /** 32 bytes em base64 — cifra dos tokens (Constituição IV). */
    MASTER_KEY: nonEmpty.refine((v) => Buffer.from(v, 'base64').length === 32, {
      message: 'MASTER_KEY deve ser 32 bytes em base64',
    }),

    META_APP_ID: nonEmpty,
    META_APP_SECRET: nonEmpty,
    /** Constituição VI: versão fixada por configuração. */
    META_API_VERSION: z.string().regex(/^v\d+\.\d+$/, 'META_API_VERSION deve ser como v25.0'),
    META_TIER: z.enum(['limited', 'full']).default('limited'),
    /** Base da Graph API. Só muda em teste (duplo local) ou atrás de proxy. */
    META_BASE_URL: z.string().url().default('https://graph.facebook.com'),

    AUTH_SECRET: nonEmpty,
    AUTH_ALLOWED_DOMAIN: nonEmpty,
    GOOGLE_CLIENT_ID: nonEmpty,
    GOOGLE_CLIENT_SECRET: nonEmpty,
    /** JSON da conta de serviço do Drive, em base64 ou texto puro. */
    GOOGLE_SERVICE_ACCOUNT_JSON: z.string().optional(),

    ANTHROPIC_API_KEY: nonEmpty,
    AI_MODEL_GENERATION: nonEmpty.default('claude-sonnet-4-6'),
    AI_MODEL_CLASSIFY: nonEmpty.default('claude-haiku-4-6'),
    AI_PLAN_TIMEOUT_MS: z.coerce.number().int().positive().default(40_000),

    /** T-009-3: flags matam inteligência, nunca o publish. */
    FEATURE_AI_ANALYSIS: z.enum(['1', '0']).default('1'),
    FEATURE_REPORTS: z.enum(['1', '0']).default('1'),
    FEATURE_INSIGHTS: z.enum(['1', '0']).default('1'),

    /**
     * Alertas operacionais no Telegram (R17). Os dois juntos ou nenhum: sem
     * `chat_id` não há para onde mandar, e o token sozinho é inútil.
     */
    TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
    TELEGRAM_CHAT_ID: z.string().min(1).optional(),

    API_PORT: z.coerce.number().int().positive().default(4000),
    API_URL: nonEmpty.default('http://localhost:4000'),
    WEB_URL: nonEmpty.default('http://localhost:3000'),

    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    /** Observabilidade opcional (T019): sem esta variável nada é carregado. */
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  })
  .refine(
    (env) => (env.TELEGRAM_BOT_TOKEN === undefined) === (env.TELEGRAM_CHAT_ID === undefined),
    {
      message: 'TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID precisam vir juntos',
      path: ['TELEGRAM_BOT_TOKEN'],
    },
  );

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export const webEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_URL: nonEmpty.default('http://localhost:4000'),
  WEB_URL: nonEmpty.default('http://localhost:3000'),
  AUTH_SECRET: nonEmpty,
  AUTH_ALLOWED_DOMAIN: nonEmpty,
  GOOGLE_CLIENT_ID: nonEmpty,
  GOOGLE_CLIENT_SECRET: nonEmpty,
});

export type WebEnv = z.infer<typeof webEnvSchema>;

function parse<T extends z.ZodType>(schema: T, source: NodeJS.ProcessEnv): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(raiz)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Configuração inválida:\n${problems}`);
  }
  return result.data;
}

let serverCache: ServerEnv | undefined;
export function loadServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  if (source === process.env && serverCache) return serverCache;
  const parsed = parse(serverEnvSchema, source);
  if (source === process.env) serverCache = parsed;
  return parsed;
}

let webCache: WebEnv | undefined;
export function loadWebEnv(source: NodeJS.ProcessEnv = process.env): WebEnv {
  if (source === process.env && webCache) return webCache;
  const parsed = parse(webEnvSchema, source);
  if (source === process.env) webCache = parsed;
  return parsed;
}

/** Só para testes. */
export function resetEnvCache(): void {
  serverCache = undefined;
  webCache = undefined;
}
