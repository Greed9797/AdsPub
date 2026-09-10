/**
 * Registro visual da identidade W3 nos dois temas (dark + light).
 * Roda dentro da suite e2e; falha se o toggle não trocar o tema.
 */
import { expect, test } from './fixtures.js';

test('temas dark e light renderizam performance', async ({ page, seed }) => {
  await page.goto('/performance');

  await page.getByLabel('Conta').selectOption({ label: seed.account.name });
  await page.getByRole('button', { name: 'Consultar' }).click();
  await expect(page.getByText('Gasto:')).toBeVisible();

  await page.screenshot({ path: 'test-results/tema-dark.png' });
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'light');

  await page.getByRole('button', { name: 'Mudar para tema claro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByText('Gasto:')).toBeVisible();
  await page.screenshot({ path: 'test-results/tema-light.png' });

  await page.getByRole('button', { name: 'Mudar para tema escuro' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'light');
});
