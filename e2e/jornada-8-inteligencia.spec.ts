/**
 * Jornada 8 (SPEC-007): o gestor gera o relatório na conta, vê fatos e
 * hipóteses e transforma em rascunho — sem tocar na Meta.
 */
import { expect, test } from './fixtures.js';

test('inteligência gera relatório e rascunho', async ({ page, seed }) => {
  await page.goto('/inteligencia');

  await page.getByLabel('Conta').selectOption({ label: seed.account.name });
  await page.getByRole('button', { name: 'Usar conta' }).click();

  await page.getByLabel('De', { exact: true }).fill('2026-09-01');
  await page.getByLabel('Até').fill('2026-09-02');
  await page.getByRole('button', { name: 'Gerar relatório' }).click();

  await expect(page.getByRole('heading', { name: 'Fatos' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Hipóteses' })).toBeVisible();

  await page.getByPlaceholder('Briefing do teste').fill('Abertura em close, mesma oferta.');
  await page.getByRole('button', { name: 'Gerar rascunho' }).click();
  await expect(page.getByText(/Rascunho: .* \(lote em draft/)).toBeVisible();

  await page.getByPlaceholder('Hipótese em uma frase').fill('Close baixa o CPA.');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByText(/Aprendizado:/)).toBeVisible();

  await page.getByPlaceholder('Resultado observado').fill('CPA subiu.');
  await page.getByLabel('Resultado do teste').selectOption('negative');
  await page.getByRole('button', { name: 'Registrar resultado' }).click();
  await expect(page.getByPlaceholder('Resultado observado')).toHaveValue('');
});
