import { readFile } from 'node:fs/promises';

import { expect, test } from './fixtures.js';
import { SEED_FILE, type SeedData } from './seed-handoff.js';
import { semearLotes } from './seed-lotes.js';

const Q = 'RDS10';
let cabe = '';
let excede = '';
let andamento = '';
let conferir = '';

test.describe('revisão final, andamento e conferência (RDS-23..26)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    const seed = JSON.parse(await readFile(SEED_FILE, 'utf8')) as SeedData;
    [cabe, excede, andamento, conferir] = (await semearLotes(seed, [
      { nome: `${Q} Cabe`, status: 'ready', aprovado: true, refsExistentes: true, anuncios: ['ready', 'ready'] },
      {
        nome: `${Q} Excede`, status: 'ready', aprovado: true, refsExistentes: true,
        anuncios: ['ready', 'ready', 'ready', 'ready', 'ready', 'ready', 'ready'],
      },
      { nome: `${Q} Andamento`, status: 'publishing', refsExistentes: true, etapa: 'create_creative', anuncios: ['creating_creative', 'published', 'queued'] },
      { nome: `${Q} Conferir`, status: 'partial', refsExistentes: true, etapa: 'create_ad', anuncios: ['needs_reconciliation'] },
    ])) as [string, string, string, string];
  });

  test.beforeEach(async ({ seed }) => {
    expect(seed.admin.role).toBe('admin');
  });

  test('a revisão final mostra lote, conta, anúncios, validação e o aviso de que tudo nasce pausado', async ({ page, seed }) => {
    await page.goto(`/lotes/${cabe}`);
    await page.getByRole('button', { name: 'Publicar 2 anúncios', exact: true }).click();
    const revisao = page.getByRole('dialog');
    await expect(revisao.getByRole('heading', { name: 'Publicar 2 anúncios?' })).toBeVisible();
    await expect(revisao).toContainText('Revisão final antes de criar na Meta');
    await expect(revisao.getByRole('row').filter({ hasText: `${Q} Cabe` })).toContainText(seed.account.name);
    await expect(revisao).toContainText('pausados');
    await expect(revisao).toContainText('A validação ainda vale');
    await expect(revisao.getByRole('checkbox')).toHaveCount(0);
    await expect(revisao.getByRole('button', { name: 'Confirmar publicação' })).toBeEnabled();
    await revisao.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('acima do saldo diário avisa quantos não entram e só publica depois de aceitar', async ({ page }) => {
    await page.goto(`/lotes/${excede}`);
    await page.getByRole('button', { name: 'Publicar 7 anúncios', exact: true }).click();
    const revisao = page.getByRole('dialog');
    await expect(revisao).toContainText(/Limite diário da conta/);
    await expect(revisao).toContainText(/Os outros \d+ não entram na fila hoje/);
    const confirmar = revisao.getByRole('button', { name: 'Confirmar publicação' });
    await expect(confirmar).toBeDisabled();
    await revisao.getByRole('checkbox', { name: /Publicar só o que cabe hoje/ }).check();
    await expect(confirmar).toBeEnabled();
    await revisao.getByRole('button', { name: 'Cancelar', exact: true }).click();
  });

  test('o andamento aparece na página, com a contagem do lote, e não numa janela', async ({ page }) => {
    await page.goto(`/lotes/${andamento}`);
    const status = page.getByRole('status').filter({ hasText: 'Lote em processamento' });
    await expect(status).toContainText('1 de 3 anúncios na Meta');
    await expect(status.getByRole('progressbar', { name: 'Anúncios já criados na Meta' })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('item em conferência mostra o painel e só deixa decidir, sem recriar sozinho', async ({ page }) => {
    await page.goto(`/lotes/${conferir}`);
    await expect(page.getByRole('heading', { name: 'Conferência pendente na Meta' })).toBeVisible();
    await expect(page.getByText(/não recria nada sozinho/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Adotar e retomar' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Descartar item' })).toBeVisible();
    await page.getByRole('button', { name: 'Descartar item' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Descreva o que você conferiu' })).toBeVisible();
  });

  test('a revisão cabe em 390 px sem rolagem horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/lotes/${cabe}`);
    await page.getByRole('button', { name: 'Publicar 2 anúncios', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Publicar 2 anúncios?' })).toBeVisible();
    const estouro = await page.evaluate<number>('document.documentElement.scrollWidth - document.documentElement.clientWidth');
    expect(estouro).toBeLessThanOrEqual(0);
  });
});
