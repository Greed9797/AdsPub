import { expect, test } from './fixtures.js';

test.describe('casca desktop (RDS-04, RDS-05, RDS-07)', () => {
  // A fixture `seed` injeta a sessão; os menus abaixo pressupõem papel admin.
  test.beforeEach(async ({ seed }) => {
    expect(seed.admin.role).toBe('admin');
  });

  test('toda rota autenticada mostra as 5 abas, a busca e o botão Sair', async ({ page }) => {
    for (const rota of ['/', '/criativos', '/performance']) {
      await page.goto(rota);
      const nav = page.getByRole('navigation', { name: 'Principal' });
      for (const nome of ['Lotes', 'Criativos', 'Performance', 'Contas', 'Gestão']) {
        await expect(nav.getByRole(nome === 'Contas' || nome === 'Gestão' ? 'button' : 'link', { name: nome })).toBeVisible();
      }
      await expect(page.getByRole('searchbox', { name: 'Busca global' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();
    }
  });

  test('a aba da rota atual fica marcada', async ({ page }) => {
    await page.goto('/criativos');
    await expect(
      page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Criativos' }),
    ).toHaveAttribute('aria-current', 'page');
  });

  test('os menus Contas e Gestão listam as páginas do admin', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Contas' }).click();
    for (const nome of ['Conexões Meta', 'WhatsApp', 'Saúde das contas']) {
      await expect(page.getByRole('menuitem', { name: nome })).toBeVisible();
    }
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menuitem', { name: 'WhatsApp' })).toBeHidden();
    await page.getByRole('button', { name: 'Gestão' }).click();
    for (const nome of ['Inteligência', 'Relatórios', 'Clientes', 'Auditoria', 'Usuários']) {
      await expect(page.getByRole('menuitem', { name: nome })).toBeVisible();
    }
    await page.getByRole('menuitem', { name: 'Auditoria' }).click();
    await expect(page).toHaveURL(/\/auditoria$/);
  });

  test('escolher Escuro grava o cookie, aplica data-theme e persiste ao recarregar', async ({ page, context }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Escuro' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const cookie = (await context.cookies()).find((c) => c.name === 'adpub_theme');
    expect(cookie?.value).toBe('dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('button', { name: 'Claro' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('a busca envia o termo para /?q= e o atalho / foca o campo', async ({ page }) => {
    await page.goto('/criativos');
    await page.keyboard.press('/');
    const busca = page.getByRole('searchbox', { name: 'Busca global' });
    await expect(busca).toBeFocused();
    await busca.fill('inverno');
    await busca.press('Enter');
    await expect(page).toHaveURL(/\/\?q=inverno/);
  });
});
