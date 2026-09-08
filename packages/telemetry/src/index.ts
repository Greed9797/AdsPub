import { redact } from '@adpub/crypto';
import pino, { type DestinationStream, type Logger, type LoggerOptions } from 'pino';

/**
 * Observabilidade opcional (T019): rastros OpenTelemetry e erros no Sentry.
 *
 * Nada roda sem configuração — sem `SENTRY_DSN` e sem `OTEL_EXPORTER_OTLP_ENDPOINT`
 * o processo nem carrega os SDKs. Isso mantém dev/CI leves e é a razão dos
 * `import()` dinâmicos aqui dentro.
 */
export interface TelemetryOptions {
  /** Nome do serviço nos rastros (`adpub-api`, `adpub-worker`). */
  service: string;
  sentryDsn?: string | undefined;
  otlpEndpoint?: string | undefined;
  environment?: string | undefined;
  /** Fração de transações amostradas quando o Sentry está ligado. */
  tracesSampleRate?: number;
}

export interface Telemetry {
  /** `true` se pelo menos um dos dois back-ends foi inicializado. */
  readonly enabled: boolean;
  readonly traces: boolean;
  readonly errors: boolean;
  captureError(error: unknown, context?: Record<string, unknown>): void;
  shutdown(): Promise<void>;
}

interface RequestLike {
  url?: string | undefined;
  query_string?: unknown;
}

interface SentryEventLike {
  request?: RequestLike | undefined;
}

/** Chaves que a Meta e o Google carregam na query string (client.ts monta assim). */
const SENSITIVE_QUERY = ['access_token', 'appsecret_proof', 'token', 'client_secret', 'refresh_token'];

const QUERY_PATTERN = new RegExp(`((?:^|[?&])(?:${SENSITIVE_QUERY.join('|')})=)([^&\\s"']+)`, 'gi');

/**
 * Mascara segredo em query string dentro de qualquer texto — URL completa,
 * `query_string` solta, mensagem de erro ou stack. Mascarar por chave não basta:
 * o token da Graph viaja como parâmetro, dentro de uma string.
 */
export function maskSecretsInText(text: string): string {
  return text.replace(QUERY_PATTERN, '$1[redacted]');
}

/** Aplica `maskSecretsInText` em toda string alcançável do valor. */
function maskDeep<T>(value: T, depth = 0): T {
  if (typeof value === 'string') return maskSecretsInText(value) as T;
  if (depth > 8 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => maskDeep(item, depth + 1)) as T;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = maskDeep(item, depth + 1);
  }
  return out as T;
}

/**
 * Constituição VI/SC-006: nenhum token sai daqui. `redact` cuida das chaves
 * conhecidas; o passo de texto cobre o que o Sentry monta sozinho — URL do
 * request, `breadcrumbs[].data.url` do integration HTTP, mensagem e stack.
 */
export function scrubEvent<T extends SentryEventLike>(event: T): T {
  return maskDeep(redact(event));
}

/** Mesmo tratamento no ponto de entrada do breadcrumb, antes de virar evento. */
export function scrubBreadcrumb<T>(breadcrumb: T): T {
  return maskDeep(redact(breadcrumb));
}

/**
 * Atributos de span que o `getNodeAutoInstrumentations` preenche com a URL
 * chamada. Mutação no lugar: é o objeto que o exportador vai serializar.
 */
export function scrubSpanAttributes(attributes: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(attributes)) {
    if (typeof value === 'string') attributes[key] = maskSecretsInText(value);
  }
}

/** Chaves cujo valor inteiro é segredo, independente de formato. */
export const LOG_REDACT_PATHS = [
  'token',
  '*.token',
  'access_token',
  '*.access_token',
  'appsecret_proof',
  '*.appsecret_proof',
  'authorization',
  '*.authorization',
  'headers.authorization',
];

/**
 * Logger padrão de API e worker: `redact` por chave mais mascaramento de
 * segredo em texto (mensagem, stack, URL), porque `pino.redact` só olha chaves.
 */
export function redactingLogger(level: string, destination?: DestinationStream): Logger {
  const options: LoggerOptions = {
    level,
    redact: { paths: LOG_REDACT_PATHS, censor: '[redacted]' },
    formatters: { log: (object) => maskDeep(object) },
    hooks: {
      logMethod(args, method) {
        method.apply(this, args.map((arg) => maskDeep(arg)) as typeof args);
      },
    },
  };
  return destination ? pino(options, destination) : pino(options);
}

const DISABLED: Telemetry = {
  enabled: false,
  traces: false,
  errors: false,
  captureError: () => {},
  shutdown: async () => {},
};

export async function initTelemetry(options: TelemetryOptions): Promise<Telemetry> {
  const shutdowns: Array<() => Promise<void>> = [];
  let traces = false;
  let errors = false;
  let capture: (error: unknown, context?: Record<string, unknown>) => void = () => {};

  if (options.otlpEndpoint) {
    // Dinâmico de propósito: os SDKs do OpenTelemetry aplicam monkey-patch em
    // http/pg/redis ao serem carregados. Import estático ligaria isso em todo
    // processo (dev, CI, testes), mesmo sem coletor configurado.
    const [{ NodeSDK }, { OTLPTraceExporter }, { getNodeAutoInstrumentations }] = await Promise.all([
      import('@opentelemetry/sdk-node'),
      import('@opentelemetry/exporter-trace-otlp-http'),
      import('@opentelemetry/auto-instrumentations-node'),
    ]);
    /** A URL chamada vai crua no atributo do span: mascara antes de exportar. */
    type ExportArgs = Parameters<InstanceType<typeof OTLPTraceExporter>['export']>;
    class ScrubbingExporter extends OTLPTraceExporter {
      override export(...[spans, done]: ExportArgs): void {
        for (const span of spans) scrubSpanAttributes(span.attributes);
        super.export(spans, done);
      }
    }
    const sdk = new NodeSDK({
      serviceName: options.service,
      traceExporter: new ScrubbingExporter({ url: `${options.otlpEndpoint}/v1/traces` }),
      instrumentations: [getNodeAutoInstrumentations()],
    });
    sdk.start();
    shutdowns.push(() => sdk.shutdown());
    traces = true;
  }

  if (options.sentryDsn) {
    // Mesmo motivo: `@sentry/node` instala handlers globais no import.
    const Sentry = await import('@sentry/node');
    Sentry.init({
      dsn: options.sentryDsn,
      serverName: options.service,
      ...(options.environment ? { environment: options.environment } : {}),
      tracesSampleRate: options.tracesSampleRate ?? 0,
      sendDefaultPii: false,
      beforeSend: (event) => scrubEvent(event),
      beforeSendTransaction: (event) => scrubEvent(event),
      beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
    });
    capture = (error, context) => {
      const extra = context ? scrubBreadcrumb(redact(context)) : undefined;
      Sentry.captureException(error, extra ? { extra } : undefined);
    };
    shutdowns.push(async () => {
      await Sentry.close(2_000);
    });
    errors = true;
  }

  if (!traces && !errors) return DISABLED;

  return {
    enabled: true,
    traces,
    errors,
    captureError: capture,
    async shutdown() {
      for (const stop of shutdowns) await stop();
    },
  };
}
