/**
 * Jornada 12 (US7): duplicar um lote para outra conta abre um plano revisável —
 * itens replicados, estrutura recriada com especificação e nada aprovado. O que
 * a Meta não informa (orçamento/público) aparece como pendência do plano, e a
 * publicação continua travada até o gestor validar na conta nova.
 */
import { criarLoteComIa, expect, test } from './fixtures.js';

test('lote duplicado abre como plano revisável na conta de destino', async ({ page, seed }) => {
  await criarLoteComIa(page, seed, 'Inverno - Origem');
  const origem = page.url();

  await page.getByText('Duplicar lote', { exact: true }).click();
  await page.getByLabel('Conta de destino').selectOption({ label: seed.reviewAccount.name });
  await page.getByLabel('Nome do novo lote').fill('Inverno - Cópia SP');
  await page.getByRole('button', { name: 'Duplicar para a conta' }).click();
  // A navegação é assíncrona (server action + router.push): esperar a URL nova
  // (UUID diferente da origem) em vez de afirmar no instante do clique.
  await page.waitForURL(
    (url) => /\/lotes\/[0-9a-f-]{36}$/.test(url.toString()) && url.toString() !== origem,
  );
  expect(page.url()).not.toBe(origem);
  await expect(page.getByRole('heading', { name: 'Inverno - Cópia SP' })).toBeVisible();
  await expect(page.getByText(seed.reviewAccount.name).first()).toBeVisible();

  // Itens vieram com as copies do original.
  await expect(page.getByRole('row').filter({ hasText: 'Imagem única' })).toHaveCount(2);
  await expect(page.getByText('Coleção de inverno com 20% OFF até sexta.')).toBeVisible();

  // Sem aprovação herdada: publicar exige validar na conta nova.
  await expect(page.getByText('Valide o lote para liberar a publicação.')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Publicar/ })).toBeDisabled();

  await page.getByRole('button', { name: 'Validar lote' }).click();
  await expect(page.getByText('lote liberado para publicar')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Publicar/ })).toBeEnabled();
});
