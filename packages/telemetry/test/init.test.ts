import { afterEach, describe, expect, it } from 'vitest';
import { initTelemetry, type Telemetry } from '../src/index.js';

let active: Telemetry | undefined;

afterEach(async () => {
  await active?.shutdown();
  active = undefined;
});

describe('initTelemetry (T019)', () => {
  it('fica desligado sem DSN e sem endpoint OTLP', async () => {
    active = await initTelemetry({ service: 'adpub-test' });

    expect(active.enabled).toBe(false);
    expect(active.traces).toBe(false);
    expect(active.errors).toBe(false);
    expect(() => active?.captureError(new Error('ignorado'))).not.toThrow();
  });

  it('não instala os handlers globais do Sentry quando desligado', async () => {
    expect((globalThis as { __SENTRY__?: unknown }).__SENTRY__).toBeUndefined();
    active = await initTelemetry({ service: 'adpub-test' });

    // O SDK grava `__SENTRY__` no import; se ficou undefined, nada foi carregado.
    expect((globalThis as { __SENTRY__?: unknown }).__SENTRY__).toBeUndefined();
  });

  it('liga o Sentry com DSN e captura erro sem lançar', async () => {
    active = await initTelemetry({
      service: 'adpub-test',
      sentryDsn: 'https://chave@o0.ingest.sentry.io/1',
      environment: 'test',
    });

    expect(active.enabled).toBe(true);
    expect(active.errors).toBe(true);
    expect(active.traces).toBe(false);
    expect(() => active?.captureError(new Error('erro de teste'), { token: 'EAAsegredo' })).not.toThrow();
  });
});
