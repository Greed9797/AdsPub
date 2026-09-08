import { redact } from '@adpub/crypto';

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

const SENSITIVE_QUERY = new Set(['access_token', 'appsecret_proof', 'token', 'client_secret']);

/**
 * Constituição VI/SC-006: nenhum token sai daqui. Além do `redact` por chave,
 * a URL do request é reescrita porque a Meta carrega o token na query string.
 */
export function scrubEvent<T extends SentryEventLike>(event: T): T {
  const scrubbed = redact(event);
  if (!scrubbed.request) return scrubbed;

  const request = { ...scrubbed.request };
  if (typeof request.url === 'string' && request.url.includes('?')) {
    const [base, query] = request.url.split('?', 2);
    const params = new URLSearchParams(query);
    for (const key of params.keys()) {
      if (SENSITIVE_QUERY.has(key)) params.set(key, '[redacted]');
    }
    request.url = `${base}?${params.toString()}`;
  }
  if (request.query_string !== undefined) request.query_string = '[redacted]';
  return { ...scrubbed, request };
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
    const sdk = new NodeSDK({
      serviceName: options.service,
      traceExporter: new OTLPTraceExporter({ url: `${options.otlpEndpoint}/v1/traces` }),
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
    });
    capture = (error, context) => {
      Sentry.captureException(error, context ? { extra: redact(context) } : undefined);
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
