/**
 * Jornada 13 (US2 observável): a importação do Drive sai da requisição. A tela
 * confirma o pedido, acompanha o job e mostra o resultado quando o worker
 * termina — sem depender do Redis. O harness roda o worker embutido: mesma
 * função que a fila chama. Sem config do Google, o job falha com o motivo à
 * vista em vez de sumir na fila.
 */
import { expect, test } from './fixtures.js';

test('importação do Drive acompanha o job até o motivo da falha', async ({ page, seed }) => {
  await page.goto(`/criativos?client_id=${seed.client.id}`);

  await page.getByLabel('URL da pasta').fill('https://drive.google.com/drive/folders/pasta-1');
  await page.getByRole('button', { name: 'Iniciar importação' }).click();

  await expect(page.getByText('A importação falhou')).toBeVisible();
  await expect(page.getByText(/GOOGLE_SERVICE_ACCOUNT_JSON/)).toBeVisible();
});
