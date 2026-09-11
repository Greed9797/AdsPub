import { maskText } from '@adpub/crypto';
import pino, { type DestinationStream, type Logger, type LoggerOptions } from 'pino';

/**
 * Observabilidade opcional (T019): rastros OpenTelemetry.
 *
 * Nada roda sem configuração — sem `OTEL_EXPORTER_OTLP_ENDPOINT` o processo
 * nem carrega o SDK. Isso mantém dev/CI leves e é a razão do `import()`
 * dinâmico aqui dentro.
 */
export interface TelemetryOptions {
  /** Nome do serviço nos rastros (`adpub-api`, `adpub-worker`). */
  service: string;
  otlpEndpoint?: string | undefined;
}

export interface Telemetry {
  /** `true` quando o exportador de rastros foi inicializado. */
  readonly enabled: boolean;
  readonly traces: boolean;
  shutdown(): Promise<void>;
}

/** O mascaramento de texto vive em `@adpub/crypto`, junto de `mask`/`redact`. */
export { maskText } from '@adpub/crypto';

/**
 * Atributos de span que o `getNodeAutoInstrumentations` preenche com a URL
 * chamada. Mutação no lugar: é o objeto que o exportador vai serializar.
 */
export function scrubSpanAttributes(attributes: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(attributes)) {
    if (typeof value === 'string') attributes[key] = maskText(value);
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
 * Logger padrão de API e worker.
 *
 * `pino.redact` cobre chaves conhecidas, mas o segredo também viaja **dentro de
 * texto**: URL, mensagem de erro da Meta, stack. Mascarar em `formatters.log`
 * ou em `hooks.logMethod` não resolve: os dois rodam **antes** dos serializers
 * (`pino/lib/tools.js`), então `req.url` do Fastify — que só existe depois —
 * escapava. `hooks.streamWrite` é o único ponto após serializers, formatters e
 * redact: mascara a linha já pronta, cobrindo todo caminho de log de uma vez.
 */
export function redactingLogger(level: string, destination?: DestinationStream): Logger {
  const options: LoggerOptions = {
    level,
    redact: { paths: LOG_REDACT_PATHS, censor: '[redacted]' },
    hooks: { streamWrite: (line) => maskText(line) },
  };
  return destination ? pino(options, destination) : pino(options);
}

const DISABLED: Telemetry = {
  enabled: false,
  traces: false,
  shutdown: async () => {},
};

export async function initTelemetry(options: TelemetryOptions): Promise<Telemetry> {
  const shutdowns: Array<() => Promise<void>> = [];
  let traces = false;

  if (options.otlpEndpoint) {
    // Dinâmico de propósito: os SDKs do OpenTelemetry aplicam monkey-patch em
    // http/pg/redis ao serem carregados. Import estático ligaria isso em todo
    // processo (dev, CI, testes), mesmo sem coletor configurado.
    const [{ NodeSDK }, { OTLPTraceExporter }, { getNodeAutoInstrumentations }] = await Promise.all(
      [
        import('@opentelemetry/sdk-node'),
        import('@opentelemetry/exporter-trace-otlp-http'),
        import('@opentelemetry/auto-instrumentations-node'),
      ],
    );
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

  if (!traces) return DISABLED;

  return {
    enabled: true,
    traces,
    async shutdown() {
      for (const stop of shutdowns) await stop();
    },
  };
}
