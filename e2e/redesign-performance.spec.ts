import { readFile } from 'node:fs/promises';

import { expect, test } from './fixtures.js';
import { SEED_FILE, type SeedData } from './seed-handoff.js';
import { semearObservacoes } from './seed-lotes.js';

test.describe('performance (RDS-55, RDS-59)', () => {
  test.describe.configure({ mode: 'serial' });

  // A conta de revisão guarda as observações: a principal segue sem dados para as outras jornadas.
  test.beforeAll(async () => {
    const seed = JSON.parse(await readFile(SEED_FILE, 'utf8')) as SeedData;
    await semearObservacoes(seed.reviewAccount.id, seed.client.id, [
      { anuncio: 'RDS18 Alfa', dia: '2026-09-10', gasto: 60, impressoes: 4000, resultados: 3 },
      { anuncio: 'RDS18 Alfa', dia: '2026-09-11', gasto: 40, impressoes: 3000, resultados: 2 },
      { anuncio: 'RDS18 Beta', dia: '2026-09-10', gasto: 50, impressoes: 2500, resultados: 0 },
    ]);
  });

  test.beforeEach(async ({ seed }) => {
    expect(seed.admin.role).toBe('admin');
  });

  test('período e origem aparecem sempre, antes e depois de consultar', async ({ page, seed }) => {
    await page.goto('/performance');
    const escopo = page.getByLabel('Período e origem dos dados');
    await expect(escopo).toContainText('Período: todo o histórico');
    await expect(escopo).toContainText('Origem: todas as fontes');

    await page.goto(`/performance?ad_account_id=${seed.reviewAccount.id}&from=2026-09-01&to=2026-09-30&source=file`);
    await expect(escopo).toContainText('Período: 01/09/2026 a 30/09/2026');
    await expect(escopo).toContainText('Origem: arquivo importado');
    await expect(page.getByText(/definições v1/)).toBeVisible();
  });

  test('os KPIs batem com o total da tabela', async ({ page, seed }) => {
    await page.goto(`/performance?ad_account_id=${seed.reviewAccount.id}`);
    const kpis = page.getByRole('region', { name: 'Totais' });
    await expect(kpis).toContainText('150,00');
    await expect(kpis).toContainText('9.500');
    await expect(page.locator('[data-total="gasto"]')).toHaveText('150,00');

    const alfa = page.getByRole('row').filter({ hasText: 'RDS18 Alfa' });
    await expect(alfa).toContainText('100,00');
    await expect(alfa).toContainText('20,00');
    const beta = page.getByRole('row').filter({ hasText: 'RDS18 Beta' });
    await expect(beta).toContainText('—');
  });

  test('o que a API não tem fica de fora, sem número inventado', async ({ page, seed }) => {
    await page.goto(`/performance?ad_account_id=${seed.reviewAccount.id}`);
    await expect(page.getByText(/Gasto por dia/)).toHaveCount(0);
    await page.goto(`/performance?ad_account_id=${seed.account.id}`);
    await expect(page.getByRole('region', { name: 'Totais' })).toContainText('Gasto');
    await expect(page.getByText('Sem observações no recorte')).toBeVisible();
  });
});
