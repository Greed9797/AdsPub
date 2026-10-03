import { readFile } from 'node:fs/promises';

import { expect, test } from './fixtures.js';
import { SEED_FILE, type SeedData } from './seed-handoff.js';
import { definirTetoDaConta } from './seed-lotes.js';

const TOKEN_DO_SEED = 'EAA-token-de-e2e-nao-real-0123456789';

test.describe('contas Meta (RDS-51)', () => {
  test.describe.configure({ mode: 'serial' });

  test.afterAll(async () => {
    const seed = JSON.parse(await readFile(SEED_FILE, 'utf8')) as SeedData;
    await definirTetoDaConta(seed.account.id, seed.account.dailyAdCap);
  });

  test.beforeEach(async ({ seed }) => {
    expect(seed.admin.role).toBe('admin');
  });

  test('a conexão mostra a situação e as ações de testar, sincronizar e trocar token', async ({ page, seed }) => {
    await page.goto('/contas');
    const conexao = page.getByRole('row').filter({ hasText: seed.connection.label });
    await expect(conexao).toContainText('Ativa');
    await expect(conexao.getByRole('button', { name: 'Testar' })).toBeVisible();
    await expect(conexao.getByRole('button', { name: 'Sincronizar' })).toBeVisible();
    await expect(conexao.getByRole('button', { name: 'Trocar token' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Criar conexão' })).toBeVisible();
  });

  test('testar a conexão responde na própria linha', async ({ page, seed }) => {
    await page.goto('/contas');
    const conexao = page.getByRole('row').filter({ hasText: seed.connection.label });
    await conexao.getByRole('button', { name: 'Testar' }).click();
    await expect(conexao).toContainText('Ligação funcionando. Pode sincronizar.');
  });

  test('a ficha edita o teto diário da conta e salva', async ({ page, seed }) => {
    await page.goto('/contas');
    const conta = page.getByRole('row').filter({ hasText: seed.account.id });
    await conta.getByRole('button', { name: 'Editar padrões' }).click();
    const ficha = page.getByRole('dialog').filter({ hasText: seed.account.name });
    await expect(ficha.getByRole('heading', { name: 'Padrões de publicação' })).toBeVisible();
    await ficha.getByLabel('Teto diário de anúncios').fill('7');
    await ficha.getByRole('button', { name: 'Salvar' }).click();
    await expect(ficha.getByText('Padrões de publicação salvos.')).toBeVisible();
    await ficha.getByRole('button', { name: 'Fechar' }).click();
    await expect(conta).toContainText('7');
  });

  test('o token nunca volta para a tela', async ({ page, seed }) => {
    await page.goto('/contas');
    await expect(page.getByRole('row').filter({ hasText: seed.connection.label })).toBeVisible();
    expect(await page.content()).not.toContain(TOKEN_DO_SEED);
    for (const campo of await page.locator('input[type="password"]').all()) {
      await expect(campo).toHaveValue('');
    }
  });
});
