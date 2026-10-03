import { readFile } from 'node:fs/promises';

import { expect, test } from './fixtures.js';
import { SEED_FILE, type SeedData } from './seed-handoff.js';
import { semearLotes } from './seed-lotes.js';

const Q = 'RDS7';

test.describe('lista de lotes mobile (RDS-15)', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeAll(async () => {
    const seed = JSON.parse(await readFile(SEED_FILE, 'utf8')) as SeedData;
    await semearLotes(seed, [
      { nome: `${Q} Alfa`, status: 'ready', aprovado: true, anuncios: ['ready', 'ready'] },
      { nome: `${Q} Beta`, status: 'partial', anuncios: ['published', 'failed', 'blocked'] },
    ]);
  });

  test.beforeEach(async ({ seed }) => {
    expect(seed.admin.role).toBe('admin');
  });

  test('mostra o resumo com o total e a legenda, sem a grade de grupos', async ({ page }) => {
    await page.goto(`/?q=${Q}`);
    const quadro = page.getByRole('region', { name: 'Quadro de estados' });
    await expect(quadro).toContainText('5');
    await expect(quadro).toContainText('2 pronto');
    await expect(quadro).toContainText('1 falhou');
    await expect(quadro.getByRole('link', { name: /^Pronto/ })).toBeHidden();
  });

  test('lista cartões em vez de tabela, com nome, contagem, atenção e selo', async ({ page }) => {
    await page.goto(`/?q=${Q}`);
    await expect(page.getByRole('row')).toHaveCount(0);
    const cartoes = page.getByRole('list', { name: 'Lotes' }).getByRole('listitem');
    await expect(cartoes).toHaveCount(2);
    const beta = cartoes.filter({ hasText: `${Q} Beta` });
    await expect(beta).toContainText('3 anúncios');
    await expect(beta).toContainText('2 precisam de atenção');
    await expect(beta).toContainText('Parcial');
    await expect(cartoes.filter({ hasText: `${Q} Alfa` })).toHaveAttribute('data-fila', 'true');
  });

  test('o cartão abre o lote', async ({ page }) => {
    await page.goto(`/?q=${Q}`);
    await page.getByRole('link', { name: new RegExp(`${Q} Alfa`) }).click();
    await expect(page).toHaveURL(/\/lotes\/[0-9a-f-]{36}$/);
  });

  test('sem resultado mostra o vazio, e a página não rola na horizontal', async ({ page }) => {
    await page.goto('/?q=nenhum-lote-assim-xyz');
    await expect(page.getByText('Nenhum lote encontrado')).toBeVisible();
    await page.goto(`/?q=${Q}`);
    const estouro = await page.evaluate<number>(
      'document.documentElement.scrollWidth - document.documentElement.clientWidth',
    );
    expect(estouro).toBeLessThanOrEqual(0);
  });
});
