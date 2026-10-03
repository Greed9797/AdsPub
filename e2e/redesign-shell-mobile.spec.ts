import { expect, test } from './fixtures.js';

test.describe('casca mobile (RDS-06)', () => {
  test.beforeEach(async ({ seed }) => {
    expect(seed.admin.role).toBe('admin');
  });

  test('em 390 px a barra inferior mostra Lotes, Criativos, Performance, Contas e Mais', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const barra = page.getByRole('navigation', { name: 'Navegação do app' });
    await expect(barra).toBeVisible();
    for (const nome of ['Lotes', 'Criativos', 'Performance', 'Contas', 'Mais']) {
      await expect(barra.getByRole('link', { name: nome })).toBeVisible();
    }
    await expect(barra.getByRole('link', { name: 'Lotes' })).toHaveAttribute('aria-current', 'page');
    // As abas do desktop saem do caminho.
    await expect(page.getByRole('navigation', { name: 'Principal' })).toBeHidden();
  });

  test('em 1440 px a barra inferior não aparece', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('navigation', { name: 'Navegação do app' })).toBeHidden();
  });

  test('/mais lista os destinos do admin, a aparência e o Sair, sem rolar na horizontal', async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/mais');
    await expect(page.getByRole('heading', { name: 'Mais' })).toBeVisible();
    for (const nome of ['Inteligência', 'Relatórios', 'Conexões Meta', 'WhatsApp', 'Clientes', 'Saúde das contas', 'Auditoria', 'Usuários']) {
      await expect(page.getByRole('link', { name: new RegExp(`^${nome}`) })).toBeVisible();
    }
    await expect(page.getByRole('link', { name: /^Mais/ })).toHaveAttribute('aria-current', 'page');
    await page.getByRole('button', { name: 'Escuro' }).click();
    expect((await context.cookies()).find((c) => c.name === 'adpub_theme')?.value).toBe('dark');
    await expect(page.getByRole('button', { name: 'Sair do AdPub' })).toBeVisible();
    const largura = await page.evaluate<{ doc: number; janela: number }>(
      '({ doc: document.documentElement.scrollWidth, janela: window.innerWidth })',
    );
    expect(largura.doc).toBeLessThanOrEqual(largura.janela);
  });
});
