import { afterEach, describe, expect, it } from 'vitest';
import { initTelemetry, type Telemetry } from '../src/index.js';

let active: Telemetry | undefined;

afterEach(async () => {
  await active?.shutdown();
  active = undefined;
});

describe('initTelemetry (T019)', () => {
  it('fica desligado sem endpoint OTLP', async () => {
    active = await initTelemetry({ service: 'adpub-test' });

    expect(active.enabled).toBe(false);
    expect(active.traces).toBe(false);
    await expect(active.shutdown()).resolves.toBeUndefined();
  });
});
