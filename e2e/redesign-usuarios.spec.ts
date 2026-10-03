import { expect, test } from './fixtures.js';
import { semearUsuario } from './seed-lotes.js';

const EMAIL_NOVO = 'rds21-novo@empresa.com.br';

test.describe('usuários (RDS-58)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await semearUsuario('manager');
  });

  test.beforeEach(async ({ seed }) => {
    expect(seed.admin.role).toBe('admin');
  });

  test('a tabela mostra papel, status e contas de cada usuário', async ({ page, seed }) => {
    await page.goto('/usuarios');
    const admin = page.getByRole('row').filter({ hasText: seed.admin.email });
    await expect(admin).toContainText('Administrador');
    await expect(admin).toContainText('Ativo');
    await expect(admin).toContainText('todas');
    const gerente = page.getByRole('row').filter({ hasText: 'rds-manager@empresa.com.br' });
    await expect(gerente).toContainText('Gerente');
    await expect(gerente).toContainText('Nenhuma');
  });

  test('criar usuário o coloca na tabela', async ({ page }) => {
    await page.goto('/usuarios');
    const novo = page.locator('form').filter({ has: page.getByLabel('Senha temporária (mínimo 12 caracteres)') });
    await novo.getByLabel('E-mail corporativo').fill(EMAIL_NOVO);
    await novo.getByLabel('Nome', { exact: true }).fill('RDS21 Novo');
    await novo.getByLabel('Papel').selectOption('viewer');
    await novo.getByLabel('Senha temporária (mínimo 12 caracteres)').fill('senha-temporaria-123');
    await novo.getByRole('button', { name: 'Criar usuário' }).click();
    await expect(page.getByText('Usuário criado.')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('row').filter({ hasText: EMAIL_NOVO })).toContainText('Leitor');
  });

  test('a ficha explica o papel escolhido e salva papel e contas', async ({ page, seed }) => {
    await page.goto('/usuarios');
    await page.getByRole('row').filter({ hasText: 'rds-manager@empresa.com.br' }).getByRole('button', { name: 'Editar usuário' }).click();
    const ficha = page.getByRole('dialog').filter({ hasText: 'rds-manager@empresa.com.br' });

    const papel = ficha.getByRole('region', { name: /pode/ });
    await expect(papel).toContainText('Criar, validar e publicar lotes');
    await expect(papel.getByRole('listitem').filter({ hasText: 'Criar, validar e publicar lotes' })).toContainText('— pode');
    await expect(papel.getByRole('listitem').filter({ hasText: 'Criar usuários' })).toContainText('— não pode');

    await ficha.getByLabel('Papel').selectOption('viewer');
    await expect(papel.getByRole('listitem').filter({ hasText: 'Criar, validar e publicar lotes' })).toContainText('— não pode');

    await ficha.getByLabel('Papel').selectOption('manager');
    await ficha.getByRole('checkbox', { name: seed.account.name }).check();
    await ficha.getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect(ficha.getByText('Atualizado com sucesso.')).toBeVisible();
    await ficha.getByRole('button', { name: 'Fechar' }).click();
    await expect(page.getByRole('row').filter({ hasText: 'rds-manager@empresa.com.br' })).toContainText(seed.account.name);
  });

  test('desativar e redefinir a senha continuam funcionando', async ({ page }) => {
    await page.goto('/usuarios');
    await page.getByRole('row').filter({ hasText: EMAIL_NOVO }).getByRole('button', { name: 'Editar usuário' }).click();
    const ficha = page.getByRole('dialog').filter({ hasText: EMAIL_NOVO });

    await ficha.getByLabel('Nova senha (mínimo 12 caracteres)').fill('outra-senha-bem-longa');
    await ficha.getByRole('button', { name: 'Redefinir senha' }).click();
    await expect(ficha.getByText('Senha redefinida.')).toBeVisible();

    await ficha.getByRole('checkbox', { name: 'Ativo' }).uncheck();
    await ficha.getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect(ficha.getByText('Atualizado com sucesso.')).toBeVisible();
    await ficha.getByRole('button', { name: 'Fechar' }).click();
    await expect(page.getByRole('row').filter({ hasText: EMAIL_NOVO })).toContainText('Inativo');
  });
});
