/**
 * Jornada 1 (US1): o admin conecta a Business Manager e sincroniza o
 * inventário — a conexão fica ativa com o tier reportado pela Graph e a conta
 * importada aparece com os padrões de página, Instagram, pixel e teto diário.
 * A Graph API é a falsa de `scripts/lib/fake-graph.ts`.
 */
import { expect, test } from './fixtures.js';

test('conexão sincronizada e conta com padrões aparecem em /contas', async ({ page, seed }) => {
  await page.goto('/contas');

  await expect(page.getByRole('heading', { name: 'Contas', exact: true })).toBeVisible();

  const conexao = page.getByRole('row').filter({ hasText: seed.connection.label });
  await expect(conexao).toContainText(seed.connection.businessId);
  await expect(conexao).toContainText('active');
  await expect(conexao).toContainText(seed.connection.apiTier);

  const conta = page.getByRole('row').filter({ hasText: seed.account.id });
  await expect(conta).toContainText(seed.account.name);
  await expect(conta).toContainText(`${seed.account.currency} / ${seed.account.timezone}`);
  await expect(conta).toContainText(seed.client.name);
  await expect(conta).toContainText(seed.account.pageId);
  await expect(conta).toContainText(seed.account.igUserId);
  await expect(conta).toContainText(seed.account.pixelId);
  await expect(conta).toContainText(String(seed.account.dailyAdCap));

  // O gestor vai para a Meta pelo link pronto, nunca digitando o act_ à mão.
  await expect(conta.getByRole('link', { name: 'Abrir' })).toHaveAttribute(
    'href',
    /adsmanager\.facebook\.com.*act=1030000000001/,
  );
});
