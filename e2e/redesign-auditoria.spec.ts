import { expect, test } from './fixtures.js';
import { semearAuditoria } from './seed-lotes.js';

test.describe('auditoria (RDS-57)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await semearAuditoria([
      { action: 'rds20.create', entityType: 'rds20', entityId: 'item-1', after: { nome: 'Novo', teto: 5 } },
      { action: 'rds20.update', entityType: 'rds20', entityId: 'item-2', before: { teto: 5 }, after: { teto: 9 } },
      { action: 'outra.coisa', entityType: 'outra', entityId: 'x-1', after: { a: 1 } },
    ]);
  });

  test.beforeEach(async ({ seed }) => {
    expect(seed.admin.role).toBe('admin');
  });

  test('a tabela mostra data, ator, ação e entidade', async ({ page }) => {
    await page.goto('/auditoria?entity_type=rds20');
    await expect(page.getByRole('columnheader')).toHaveText(['Data', 'Ator', 'Ação', 'Entidade', 'Detalhes']);
    const linha = page.getByRole('row').filter({ hasText: 'rds20.update' });
    await expect(linha).toContainText('rds20@empresa.com.br');
    await expect(linha).toContainText('rds20 · item-2');
  });

  test('cada evento expande o antes e o depois, e a criação só tem o depois', async ({ page }) => {
    await page.goto('/auditoria?entity_type=rds20');
    const atualizacao = page.getByRole('row').filter({ hasText: 'rds20.update' });
    await atualizacao.getByText('Ver alterações').click();
    await expect(atualizacao.getByRole('region', { name: 'Antes' })).toContainText('"teto": 5');
    await expect(atualizacao.getByRole('region', { name: 'Depois' })).toContainText('"teto": 9');

    const criacao = page.getByRole('row').filter({ hasText: 'rds20.create' });
    await criacao.getByText('Ver alterações').click();
    await expect(criacao.getByRole('region', { name: 'Depois' })).toContainText('"nome": "Novo"');
    await expect(criacao.getByRole('region', { name: 'Antes' })).toHaveCount(0);
  });

  test('os filtros por entidade e por id continuam funcionando', async ({ page }) => {
    await page.goto('/auditoria');
    await page.getByLabel('Entidade', { exact: true }).fill('rds20');
    await page.getByLabel('ID da entidade').fill('item-1');
    await page.getByRole('button', { name: 'Aplicar filtros' }).click();
    await expect(page.getByRole('row').filter({ hasText: 'rds20.create' })).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'rds20.update' })).toHaveCount(0);
    await expect(page.getByRole('row').filter({ hasText: 'outra.coisa' })).toHaveCount(0);

    await page.goto('/auditoria?entity_type=nada-assim');
    await expect(page.getByText('Nenhum evento encontrado')).toBeVisible();
  });
});
