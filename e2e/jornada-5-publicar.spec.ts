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

  // A publicação é irreversível do lado da Meta: a UI pede confirmação.
  page.once('dialog', (dialog) => {
    expect(dialog.message()).toContain('Confirma publicar 2 item(ns)?');
    void dialog.accept();
  });
  await page.getByRole('button', { name: 'Publicar 2 item(ns)' }).click();

  await expect(page.getByText('enfileirados: 2')).toBeVisible();
  await expect(page.getByText(`saldo diário: ${seed.account.dailyAdCap - 2}`)).toBeVisible();

  const itens = page.getByRole('row').filter({ hasText: 'single_image' });
  await expect(itens).toHaveCount(2);
  for (const item of await itens.all()) {
    await expect(item).toContainText('published');
    await expect(item.getByRole('link')).toHaveAttribute(
      'href',
      /adsmanager\.facebook\.com.*selected_ad_ids=\d+/,
    );
  }
});
