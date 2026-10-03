import { describe, expect, it } from 'vitest';

import { alertasDaConta, linhasDeSaude, resumoDeSaude } from '../src/lib/saude-view';
import type { AccountHealth } from '../src/lib/types';

const conta = (extra: Partial<AccountHealth> = {}): AccountHealth => ({
  ad_account_id: 'act_1',
  name: 'Conta',
  connection_status: 'active',
  rate_usage: {},
  paused_until: null,
  published_today: 0,
  daily_cap: 5,
  pending_jobs: 0,
  error_rate_1h: 0,
  p95_latency_ms: 100,
  ...extra,
});

describe('saude-view (RDS-53)', () => {
  it('conta saudável não tem alerta', () => {
    expect(alertasDaConta(conta())).toEqual([]);
  });

  it('lista cada motivo de atenção', () => {
    const alertas = alertasDaConta(
      conta({ connection_status: 'revoked', published_today: 5, error_rate_1h: 0.25, paused_until: '2026-10-04T10:00:00Z' }),
    );
    expect(alertas).toHaveLength(4);
    expect(alertas[0]).toBe('Conexão Revogada');
    expect(alertas).toContain('Teto diário de anúncios atingido');
    expect(alertas.some((a) => a.startsWith('Erro em 25.0%'))).toBe(true);
  });

  it('o limite de erro é estrito: 10% exato não alerta', () => {
    expect(alertasDaConta(conta({ error_rate_1h: 0.1 }))).toEqual([]);
  });

  it('contas em atenção sobem para o topo e o resto mantém a ordem', () => {
    const linhas = linhasDeSaude([
      conta({ ad_account_id: 'a' }),
      conta({ ad_account_id: 'b', published_today: 5 }),
      conta({ ad_account_id: 'c' }),
      conta({ ad_account_id: 'd', published_today: 5, error_rate_1h: 0.5 }),
    ]);
    expect(linhas.map((l) => l.ad_account_id)).toEqual(['d', 'b', 'a', 'c']);
  });

  it('o resumo conta contas, atenção, teto e a média de erro', () => {
    const resumo = resumoDeSaude(linhasDeSaude([conta({ published_today: 5 }), conta({ error_rate_1h: 0.2 })]));
    expect(resumo).toEqual({ contas: 2, emAtencao: 2, noTeto: 1, erroMedio: 0.1 });
  });

  it('o resumo sem contas é zero, sem divisão', () => {
    expect(resumoDeSaude([])).toEqual({ contas: 0, emAtencao: 0, noTeto: 0, erroMedio: 0 });
  });
});
