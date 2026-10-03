import { readFile } from 'node:fs/promises';

import { expect, test } from './fixtures.js';
import { SEED_FILE, type SeedData } from './seed-handoff.js';
import { semearLotes } from './seed-lotes.js';

// Prefixo exclusivo: o banco do e2e é compartilhado entre specs, então tudo aqui
// é isolado por `?q=RDS6`.
const Q = 'RDS6';

test.describe('lista de lotes desktop (RDS-10..14)', () => {
  // Semeia uma vez: a contagem do quadro depende de existir exatamente este conjunto.
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    const seed = JSON.parse(await readFile(SEED_FILE, 'utf8')) as SeedData;
    await semearLotes(seed, [
      { nome: `${Q} Alfa`, status: 'ready', aprovado: true, anuncios: ['ready', 'ready', 'ready'] },
      { nome: `${Q} Beta`, status: 'partial', anuncios: ['published', 'failed', 'blocked', 'in_review'] },
      { nome: `${Q} Gama`, status: 'draft', anuncios: ['draft', 'draft', 'needs_reconciliation'] },
      { nome: `${Q} Delta`, status: 'publishing', anuncios: ['uploading_media', 'queued', 'approved'] },
      { nome: `${Q} Vazio`, status: 'draft', anuncios: [] },
    ]);
  });

  test.beforeEach(async ({ seed }) => {
    expect(seed.admin.role).toBe('admin');
  });

  test('o quadro soma 1 ponto por anúncio e conta os que precisam de atenção', async ({ page }) => {
    await page.goto(`/?q=${Q}`);
    const quadro = page.getByRole('region', { name: 'Quadro de estados' });
    await expect(quadro).toContainText('13 anúncios');
    await expect(quadro).toContainText('3 precisam de atenção');
    await expect(quadro.getByRole('link', { name: /^Pronto 3$/ })).toBeVisible();
    await expect(quadro.getByRole('link', { name: /^Falhou 1$/ })).toBeVisible();
    await expect(quadro.getByRole('link', { name: /^Conferir 1$/ })).toBeVisible();
    await expect(quadro.getByRole('link', { name: /^Publicando 1$/ })).toBeVisible();
  });

  test('clicar num grupo filtra a lista e marca o grupo ativo', async ({ page }) => {
    await page.goto(`/?q=${Q}`);
    await page.getByRole('region', { name: 'Quadro de estados' }).getByRole('link', { name: /^Falhou/ }).click();
    await expect(page).toHaveURL(/estado=falhou/);
    const linhas = page.getByRole('row').filter({ hasText: Q });
    await expect(linhas).toHaveCount(1);
    await expect(linhas.first()).toContainText(`${Q} Beta`);
    await expect(page.getByRole('link', { name: /^Falhou/ })).toHaveAttribute('aria-current', 'true');
  });

  test('o chip Precisam de atenção reúne bloqueado, reprovado, falhou e conferir', async ({ page }) => {
    await page.goto(`/?q=${Q}&estado=atencao`);
    const linhas = page.getByRole('row').filter({ hasText: Q });
    await expect(linhas).toHaveCount(2);
    await expect(linhas.filter({ hasText: 'Beta' })).toHaveCount(1);
    await expect(linhas.filter({ hasText: 'Gama' })).toHaveCount(1);
    await expect(page.getByRole('link', { name: /^Precisam de atenção/ })).toHaveAttribute('aria-current', 'true');
  });

  test('a barra de pipeline mede 18 px por anúncio e some em lote vazio', async ({ page }) => {
    await page.goto(`/?q=${Q}`);
    const beta = page.getByRole('row').filter({ hasText: `${Q} Beta` });
    const barra = beta.getByRole('img', { name: /4 anúncios/ });
    await expect(barra).toBeVisible();
    const caixa = await barra.boundingBox();
    expect(Math.round(caixa?.width ?? 0)).toBe(72);

    const vazio = page.getByRole('row').filter({ hasText: `${Q} Vazio` });
    await expect(vazio.getByRole('img')).toHaveCount(0);
    await expect(vazio).toContainText('Sem anúncios');
  });

  test('cada linha mostra o selo do lote e abre o lote', async ({ page, seed }) => {
    await page.goto(`/?q=${Q}`);
    const alfa = page.getByRole('row').filter({ hasText: `${Q} Alfa` });
    await expect(alfa).toContainText('Pronto');
    await expect(alfa).toContainText(seed.account.name);
    await alfa.getByRole('link', { name: `${Q} Alfa` }).click();
    await expect(page).toHaveURL(/\/lotes\/[0-9a-f-]{36}$/);
  });

  test('a fila de publicação lista só lotes prontos e aprovados e leva a revisão', async ({ page }) => {
    await page.goto(`/?q=${Q}`);
    const fila = page.getByRole('region', { name: 'Fila de publicação' });
    await expect(fila).toContainText('1 lote pronto para publicar');
    await fila.getByRole('link', { name: 'Revisar e publicar' }).click();
    await expect(page).toHaveURL(/\/lotes\/[0-9a-f-]{36}/);
    await expect(page.getByRole('heading', { name: `${Q} Alfa` })).toBeVisible();
  });

  test('sem resultado mostra o vazio com a ação de limpar', async ({ page }) => {
    await page.goto('/?q=nenhum-lote-assim-xyz');
    await expect(page.getByText('Nenhum lote encontrado')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Fila de publicação' })).toHaveCount(0);
  });

  test('o quadro e a tabela não geram rolagem horizontal em 1440px', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/?q=${Q}`);
    const estouro = await page.evaluate<number>(
      'document.documentElement.scrollWidth - document.documentElement.clientWidth',
    );
    expect(estouro).toBeLessThanOrEqual(0);
  });
});
