/**
 * Jornada 6 (SPEC-003): o gestor importa um CSV, revisa a prévia linha a
 * linha e confirma — sem número inventado.
 */
import { fileURLToPath } from 'node:url';
import { expect, test } from './fixtures.js';

const CSV = fileURLToPath(new URL('./fixtures/relatorio.csv', import.meta.url));

test('relatório CSV vira observação confirmada', async ({ page, seed }) => {
  await page.goto('/relatorios');

  await page.getByLabel('Cliente').selectOption({ label: seed.client.name });
  await page.getByRole('button', { name: 'Usar cliente' }).click();

  await page.getByLabel('Arquivo CSV ou XLSX').setInputFiles(CSV);
  await page.getByRole('button', { name: 'Enviar e pré-visualizar' }).click();

  await expect(page.getByText('1 válida(s)')).toBeVisible();
  await expect(page.getByText('Linha 1')).toBeVisible();

  await page.getByRole('button', { name: /Confirmar 1 observação/ }).click();
  await expect(page.getByText('1 observação(ões) confirmadas.')).toBeVisible();
});
