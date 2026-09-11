/**
 * Jornada 3 (US3): briefing + criativo → o copiloto devolve o plano e o lote
 * abre com os itens gerados, nome pela nomenclatura do cliente e UTMs padrão
 * já aplicadas. A IA é um invoker fixo no servidor de apoio (sem rede).
 */
import { criarLoteComIa, expect, test } from './fixtures.js';

test('lote no modo IA gera itens com nome e UTM preenchidos', async ({ page, seed }) => {
  await criarLoteComIa(page, seed, 'Inverno - Semana 2');

  await expect(page.getByRole('heading', { name: 'Inverno - Semana 2' })).toBeVisible();
  await expect(page.getByText(`Conta: ${seed.account.name}`)).toBeVisible();

  // 1 criativo × 2 copies = 2 itens.
  await expect(page.getByRole('heading', { name: 'Itens (2)' })).toBeVisible();
  await expect(page.getByText('Coleção de inverno com 20% OFF até sexta.')).toBeVisible();
  await expect(page.getByText('Últimos dias: 20% OFF na coleção de inverno')).toBeVisible();

  // A pendência que a IA não resolveu sozinha fica à vista do gestor.
  await expect(page.getByText('orcamento')).toBeVisible();

  // Nomenclatura do cliente: {cliente}_{objetivo}_{data}_{criativo}_{formato}_{v}
  const primeiroItem = page.getByRole('row').filter({ hasText: 'single-image' }).first();
  await expect(primeiroItem).toContainText(/loja-teste_.*_inverno-e2e_single-image_\d+/);
  await expect(primeiroItem).toContainText('Pronto');

  // UTMs padrão do cliente entram na copy sem o gestor digitar.
  await primeiroItem.getByRole('button', { name: 'Editar' }).click();
  await expect(page.getByLabel('UTMs (url_tags)')).toHaveValue(
    new RegExp(`utm_source=${seed.client.utmSource}`),
  );
  await expect(page.getByLabel(/^Link/)).toHaveValue(seed.landing);
});
