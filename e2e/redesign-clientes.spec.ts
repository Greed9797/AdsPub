import { expect, test } from './fixtures.js';

test.describe('clientes (RDS-52)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ seed }) => {
    expect(seed.admin.role).toBe('admin');
  });

  test('a tabela lista os clientes com a política e o padrão de nomes', async ({ page, seed }) => {
    await page.goto('/clientes');
    const linha = page.getByRole('row').filter({ hasText: seed.client.name });
    await expect(linha).toBeVisible();
    await expect(linha.getByRole('button', { name: 'Editar cliente' })).toBeVisible();
    await expect(linha).toContainText(/Avisar|Bloquear violações/);
  });

  test('criar cliente: nome vazio mostra o erro, nome preenchido cria e lista', async ({ page }) => {
    await page.goto('/clientes');
    await page.getByRole('button', { name: 'Novo cliente' }).click();
    const ficha = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Novo cliente' }) });
    await ficha.getByRole('button', { name: 'Criar cliente' }).click();
    await expect(ficha.getByRole('alert')).toContainText('Informe o nome do cliente.');

    await ficha.getByLabel('Nome', { exact: true }).fill('RDS15 Cliente Novo');
    await ficha.getByRole('button', { name: 'Criar cliente' }).click();
    await expect(page.getByRole('row').filter({ hasText: 'RDS15 Cliente Novo' })).toBeVisible();
  });

  test('editar cliente: a ficha abre com os dados e salva a mudança', async ({ page }) => {
    await page.goto('/clientes');
    const linha = page.getByRole('row').filter({ hasText: 'RDS15 Cliente Novo' });
    await linha.getByRole('button', { name: 'Editar cliente' }).click();
    const ficha = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: /Editar RDS15 Cliente Novo/ }) });
    await expect(ficha.getByLabel('Nome', { exact: true })).toHaveValue('RDS15 Cliente Novo');
    await ficha.getByLabel('Política de validação').selectOption('block');
    await ficha.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(page.getByRole('row').filter({ hasText: 'RDS15 Cliente Novo' })).toContainText('Bloquear violações');
  });
});
