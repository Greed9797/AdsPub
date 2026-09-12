/**
 * Jornada 9 (A9): a análise de conteúdo sai da requisição. A tela confirma o
 * pedido, acompanha o job e mostra os achados quando o worker termina.
 * O harness roda o worker embutido: mesma função que a fila chama.
 */
import { expect, test } from './fixtures.js';

test('análise de conteúdo roda em job e mostra os achados', async ({ page, seed }) => {
  await page.goto(`/criativos?client_id=${seed.client.id}`);

  const cartao = page.locator('article').filter({ hasText: seed.asset.filename });
  await expect(cartao).toBeVisible();

  await cartao.getByRole('button', { name: 'Analisar conteúdo' }).click();

  await expect(cartao.getByText(/A peça mostra a coleção de inverno/)).toBeVisible();
  await expect(cartao.getByText(/revisão 1/)).toBeVisible();
});
