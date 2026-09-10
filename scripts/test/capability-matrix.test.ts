import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * T-001-2b (AC-001-06): a matriz de capacidades é doc testado. Linha
 * `validada` sem evidência (comando, ambiente, conta, data) quebra o teste.
 * Campo só-listado-no-SDK nunca recebe `validada`.
 */
const MATRIX = new URL('../../docs/capability-matrix.md', import.meta.url);

function rows(): Array<{ capacidade: string; estado: string; evidencia: string }> {
  const text = readFileSync(MATRIX, 'utf8');
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|') && !line.includes('---') && !line.startsWith('| Capacidade'))
    .map((line) => {
      const [, capacidade = '', estado = '', evidencia = ''] = line.split('|').map((c) => c.trim());
      return { capacidade, estado, evidencia };
    });
}

describe('matriz de capacidades', () => {
  it('toda capacidade validada tem evidência rastreável', () => {
    const linhas = rows();
    expect(linhas.length).toBeGreaterThan(0);
    for (const linha of linhas) {
      expect(['validada', 'não-validada', 'indisponível']).toContain(linha.estado);
      if (linha.estado === 'validada') {
        // Evidência = onde rodou + em qual conta (ou teste unitário) + quando.
        expect(linha.evidencia).toMatch(/Graph falsa|conta real|test\.ts/);
        expect(linha.evidencia).toMatch(/act_|\.test\.ts|\d{4}-\d{2}-\d{2}/);
      }
    }
  });

  it('capacidades só-do-SDK seguem não-validadas', () => {
    const linhas = rows();
    const soSdk = linhas.filter((l) => /SDK lista|só-listado/i.test(l.evidencia));
    expect(soSdk.length).toBeGreaterThan(0);
    for (const linha of soSdk) {
      expect(linha.estado).toBe('não-validada');
    }
  });
});
