/**
 * Jornada 7 (SPEC-005): o gestor filtra a conta e vê números com origem e
 * definição — ou indisponível com motivo, nunca zero inventado.
 */
import { expect, test } from './fixtures.js';

test('performance mostra totais e limitações do recorte', async ({ page, seed }) => {
  await page.goto('/performance');

  await page.getByLabel('Conta').selectOption({ label: seed.account.name });
  await page.getByRole('button', { name: 'Consultar' }).click();

  await expect(page.getByText('Impressões', { exact: true })).toBeVisible();
  await expect(page.getByText(/definições v1/)).toBeVisible();
});
