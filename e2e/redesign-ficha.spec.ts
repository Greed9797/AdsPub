import { readFile } from 'node:fs/promises';

import { expect, test } from './fixtures.js';
import { SEED_FILE, type SeedData } from './seed-handoff.js';
import { semearLotes } from './seed-lotes.js';

const Q = 'RDS9';
let aprovado = '';
let bloqueado = '';

test.describe('ficha do anúncio (RDS-21, RDS-22, RDS-28)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    const seed = JSON.parse(await readFile(SEED_FILE, 'utf8')) as SeedData;
    [aprovado, bloqueado] = (await semearLotes(seed, [
      { nome: `${Q} Aprovado`, status: 'ready', aprovado: true, anuncios: ['ready'], refsExistentes: true },
      { nome: `${Q} Bloqueado`, status: 'draft', comErro: true, refsExistentes: true, anuncios: ['blocked'] },
    ])) as [string, string];
  });

  test.beforeEach(async ({ seed }) => {
    expect(seed.admin.role).toBe('admin');
  });

  test('abrir um anúncio mostra a ficha com prévia, dados e campos, sem trocar de página', async ({ page }) => {
    await page.goto(`/lotes/${aprovado}`);
    const url = page.url();
    await page.getByRole('row').filter({ hasText: 'AD-01' }).getByRole('button', { name: 'Editar' }).click();

    const ficha = page.getByRole('dialog');
    await expect(ficha.getByRole('heading', { name: 'Editar anúncio' })).toBeVisible();
    await expect(ficha.getByRole('complementary', { name: 'Prévia do anúncio' })).toBeVisible();
    await expect(ficha.getByRole('group', { name: 'Campanha e conjunto' }).or(ficha.getByLabel('Campanha e conjunto'))).toContainText('23850000000000101 · já existe na Meta');
    await expect(ficha.getByLabel('Texto principal')).toHaveValue('Texto');
    expect(page.url()).toBe(url);

    await ficha.getByRole('button', { name: 'Fechar' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('salvar avisa que a aprovação cai e o lote pede nova validação', async ({ page }) => {
    await page.goto(`/lotes/${aprovado}`);
    await page.getByRole('row').filter({ hasText: 'AD-01' }).getByRole('button', { name: 'Editar' }).click();
    const ficha = page.getByRole('dialog');
    await expect(ficha).toContainText('Salvar derruba a aprovação do lote');
    await ficha.getByLabel('Título').fill('Título novo da ficha');
    await ficha.getByRole('button', { name: 'Salvar item' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText(/valide de novo para liberar a publicação/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Publicar/ })).toBeDisabled();
  });

  test('cada erro de validação lista o anúncio, o campo e o que corrigir', async ({ page }) => {
    await page.goto(`/lotes/${bloqueado}`);
    await page.getByRole('row').filter({ hasText: 'AD-01' }).getByRole('button', { name: 'Editar' }).click();
    const checklist = page.getByRole('dialog').getByRole('region', { name: 'Validação do anúncio' });
    await expect(checklist).toContainText('Link de destino ausente');
    await expect(checklist).toContainText('AD-01');
    await expect(checklist).toContainText('campo copy.link');
    await expect(checklist).toContainText('Como resolver: Cole o link da página de destino.');
  });

  test('em 390 px a ficha ocupa a largura toda sem rolagem horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/lotes/${aprovado}`);
    await page.getByRole('row').filter({ hasText: 'AD-01' }).getByRole('button', { name: 'Editar' }).click();
    const caixa = await page.getByRole('dialog').boundingBox();
    expect(Math.round(caixa?.width ?? 0)).toBe(390);
    const estouro = await page.evaluate<number>('document.documentElement.scrollWidth - document.documentElement.clientWidth');
    expect(estouro).toBeLessThanOrEqual(0);
  });
});
