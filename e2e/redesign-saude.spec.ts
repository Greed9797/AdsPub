import { readFile } from 'node:fs/promises';

import { expect, test } from './fixtures.js';
import { SEED_FILE, type SeedData } from './seed-handoff.js';
import { semearLotes } from './seed-lotes.js';

test.describe('saúde das contas (RDS-53, RDS-59)', () => {
  test.describe.configure({ mode: 'serial' });

  // A conta de revisão (SP, depois de BR na ordem da API) bate o teto de 5 anúncios hoje.
  test.beforeAll(async () => {
    const seed = JSON.parse(await readFile(SEED_FILE, 'utf8')) as SeedData;
    await semearLotes(seed, [
      {
        nome: 'RDS16 Teto', status: 'done', conta: 'revisao', publicadoHoje: true, etapa: 'done',
        anuncios: ['published', 'published', 'published', 'published', 'published'],
      },
    ]);
  });

  test.beforeEach(async ({ seed }) => {
    expect(seed.admin.role).toBe('admin');
  });

  test('o resumo e a tabela usam só o que a API devolve', async ({ page }) => {
    await page.goto('/saude');
    const resumo = page.getByRole('region', { name: 'Resumo' });
    for (const rotulo of ['Contas', 'Em atenção', 'Erro médio 1h', 'No teto diário']) {
      await expect(resumo).toContainText(rotulo);
    }
    const cabecalho = page.getByRole('columnheader');
    await expect(cabecalho).toHaveText(['Conta', 'Situação', 'Conexão', 'Hoje / teto', 'Fila', 'Erro 1h', 'p95 latência', 'Pausado até', 'Rate limit']);
  });

  test('a conta em atenção sobe para o topo com o alerta', async ({ page, seed }) => {
    await page.goto('/saude');
    const alerta = page.getByRole('alert').filter({ hasText: 'precisa de atenção' });
    await expect(alerta).toContainText(seed.reviewAccount.name);
    await expect(alerta).toContainText('Teto diário de anúncios atingido');

    const linhas = page.getByRole('row').filter({ hasText: 'act_' });
    await expect(linhas.first()).toContainText(seed.reviewAccount.name);
    await expect(linhas.first()).toContainText('Atenção');
  });

  test('em 390 px a página não rola na horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/saude');
    await expect(page.getByRole('region', { name: 'Resumo' })).toBeVisible();
    const estouro = await page.evaluate<number>('document.documentElement.scrollWidth - document.documentElement.clientWidth');
    expect(estouro).toBeLessThanOrEqual(0);
  });
});
