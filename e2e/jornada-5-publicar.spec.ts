/**
 * Jornada 5 (US5): o gestor valida o lote, confirma a publicação e os anúncios
 * nascem na Meta (falsa) já com link para o Gerenciador de Anúncios. Tudo
 * PAUSED do outro lado — aqui checamos o que a UI mostra ao gestor.
 */
import { criarLoteComIa, expect, test } from './fixtures.js';

test('lote planejado é validado, publicado e vira anúncio com link', async ({ page, seed }) => {
  await criarLoteComIa(page, seed, 'Inverno - Publicação');

  await page.getByRole('button', { name: 'Validar lote' }).click();
  await expect(page.getByText('lote liberado para publicar')).toBeVisible();

  // Cancelar a confirmação não inicia a publicação.
  await page.getByRole('button', { name: 'Publicar 2 anúncios', exact: true }).click();
  const confirmation = page.getByRole('dialog');
  await expect(confirmation).toContainText(seed.account.name);
  await expect(confirmation.getByText(/veiculação.*cobrança/i)).toBeVisible();
  await confirmation.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(confirmation).not.toBeVisible();
  await expect(page.getByText('enfileirados: 2')).not.toBeVisible();
  await page.getByRole('button', { name: 'Publicar 2 anúncios', exact: true }).click();
  await confirmation.getByRole('button', { name: 'Confirmar publicação' }).click();

  await expect(page.getByText('enfileirados: 2')).toBeVisible();
  await expect(page.getByText(`saldo diário: ${seed.account.dailyAdCap - 2}`)).toBeVisible();

  const itens = page.getByRole('row').filter({ hasText: 'Imagem única' });
  await expect(itens).toHaveCount(2);
  for (const item of await itens.all()) {
    await expect(item).toContainText('Publicado');
    await expect(item.getByRole('link')).toHaveAttribute(
      'href',
      /adsmanager\.facebook\.com.*selected_ad_ids=\d+/,
    );
  }
});
