import { describe, expect, it } from 'vitest';
import { detectCreativeChange, statusFromEffective } from '../src/poll/status.js';

/** T-002-2 (AC-002-05/06): troca observada vira ambíguo; nunca divide métrica. */
describe('detectCreativeChange', () => {
  const binding = { metaCreativeId: 'cr1', variantId: 'v1' };

  it('mesmo criativo não muda nada', () => {
    expect(detectCreativeChange(binding, 'cr1')).toEqual({ changed: false });
  });

  it('criativo trocado marca mudança preservando a variante', () => {
    expect(detectCreativeChange(binding, 'cr2')).toEqual({ changed: true, variantId: 'v1' });
  });

  it('sem vínculo ou sem observado não afirma nada', () => {
    expect(detectCreativeChange(undefined, 'cr2')).toEqual({ changed: false });
    expect(detectCreativeChange(binding, undefined)).toEqual({ changed: false });
    expect(detectCreativeChange({ metaCreativeId: null, variantId: 'v1' }, 'cr2')).toEqual({
      changed: false,
    });
  });

  it('status efetivo continua mapeando como antes', () => {
    expect(statusFromEffective('PAUSED')).toBe('approved');
    expect(statusFromEffective('DISAPPROVED')).toBe('disapproved');
  });
});
