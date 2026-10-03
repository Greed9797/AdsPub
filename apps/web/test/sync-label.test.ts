import { describe, expect, it } from 'vitest';

import { carregarRotulo, rotuloDeSincronizacao } from '../src/lib/sync-label';

/** 03/10/2026 17:00 em São Paulo. */
const AGORA = new Date('2026-10-03T20:00:00Z');

describe('sync-label: rótulo de sincronização (RDS-04, RDS-08)', () => {
  it('mostra "hoje" e a hora de São Paulo quando a sincronização é do mesmo dia', () => {
    expect(rotuloDeSincronizacao(['2026-10-03T17:32:00Z'], AGORA)).toBe('Sincronizado hoje, 14:32');
  });

  it('mostra dia e mês quando a sincronização é de outro dia', () => {
    expect(rotuloDeSincronizacao(['2026-10-02T17:32:00Z'], AGORA)).toBe('Sincronizado 02/10, 14:32');
  });

  it('usa a mais recente entre várias e ignora as nulas', () => {
    expect(
      rotuloDeSincronizacao([null, '2026-10-01T12:00:00Z', '2026-10-03T15:05:00Z', null], AGORA),
    ).toBe('Sincronizado hoje, 12:05');
  });

  it('não devolve rótulo quando nenhuma conta foi sincronizada', () => {
    expect(rotuloDeSincronizacao([], AGORA)).toBeUndefined();
    expect(rotuloDeSincronizacao([null, null], AGORA)).toBeUndefined();
  });

  it('IF a API de contas falha THEN devolve undefined sem lançar', async () => {
    const rotulo = await carregarRotulo(() => Promise.reject(new Error('API fora')), AGORA);
    expect(rotulo).toBeUndefined();
  });

  it('com a API respondendo, devolve o rótulo da conta mais recente', async () => {
    const rotulo = await carregarRotulo(
      () => Promise.resolve([{ last_synced_at: '2026-10-03T17:32:00Z' }, { last_synced_at: null }]),
      AGORA,
    );
    expect(rotulo).toBe('Sincronizado hoje, 14:32');
  });
});
