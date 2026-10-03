import { expect, test } from './fixtures.js';
import { semearLotes } from './seed-lotes.js';

test.describe('novo lote (RDS-30..34)', () => {
  test.beforeEach(async ({ seed }) => {
    expect(seed.admin.role).toBe('admin');
  });

  test('mostra as 3 etapas, o resumo e a barra de ação', async ({ page, seed }) => {
    await page.goto('/lotes/novo');
    const etapas = page.getByRole('navigation', { name: 'Etapas de criação' });
    for (const nome of ['Cliente e conta', 'Como montar', 'Fotos e vídeos']) {
      await expect(etapas).toContainText(nome);
    }
    const resumo = page.getByRole('complementary', { name: 'Resumo da criação' });
    await expect(resumo).toContainText(seed.client.name);
    await expect(resumo).toContainText('Anúncios a preparar');
    await expect(page.getByText('Nada será publicado nesta etapa')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Criar lote/ })).toBeVisible();
  });

  test('modo IA e manual são cartões selecionáveis e enviam o mesmo valor de antes', async ({ page }) => {
    await page.goto('/lotes/novo');
    const ia = page.getByRole('radio', { name: /Planejamento com IA/ });
    const manual = page.getByRole('radio', { name: /Criação manual/ });
    await expect(ia).toBeChecked();
    await expect(ia).toHaveAttribute('name', 'mode');
    await expect(ia).toHaveValue('ai');
    await manual.check();
    await expect(manual).toBeChecked();
    await expect(manual).toHaveValue('manual');
    await expect(page.getByLabel('Sobre o que anunciar')).not.toHaveAttribute('required', '');
    await expect(page.getByRole('complementary', { name: 'Resumo da criação' })).toContainText('Definidos no construtor');
  });

  test('o resumo conta mídias × variações e avisa quando passa do saldo diário da conta', async ({ page, seed }) => {
    // A conta de revisão fica sem saldo hoje: 5 anúncios publicados e teto de 5.
    await semearLotes(seed, [
      { nome: 'RDS11 Saldo', status: 'done', conta: 'revisao', publicadoHoje: true, etapa: 'done', anuncios: ['published', 'published', 'published', 'published', 'published'] },
    ]);
    await page.goto('/lotes/novo');
    const resumo = page.getByRole('complementary', { name: 'Resumo da criação' });
    await page.getByRole('checkbox', { name: new RegExp(seed.asset.filename) }).check();
    await page.getByLabel(/Textos diferentes por foto/).fill('3');
    await expect(resumo.locator('.ap-resumo__total dd')).toHaveText('3');

    await page.getByLabel('Conta de anúncios').selectOption({ label: seed.reviewAccount.name });
    const aviso = resumo.getByRole('status').filter({ hasText: 'Acima do limite diário da conta' });
    await expect(aviso).toContainText('aceita mais 0 anúncios hoje');
    await expect(aviso).toContainText('Os outros 3 não entram na fila hoje');

    await page.getByLabel('Conta de anúncios').selectOption({ label: seed.account.name });
    await expect(page.getByText('Acima do limite diário da conta')).toHaveCount(0);
  });

  test('sem mídia o erro aparece junto das mídias e o que foi digitado continua lá', async ({ page }) => {
    await page.goto('/lotes/novo');
    await page.getByLabel('Nome do lote').fill('Lote de teste RDS11');
    await page.getByLabel('Sobre o que anunciar').fill('Oferta de teste.');
    await page.getByRole('button', { name: /^Criar lote/ }).click();
    const erro = page.locator('#midias').getByRole('alert');
    await expect(erro).toContainText('Selecione pelo menos um criativo');
    await expect(page.getByLabel('Nome do lote')).toHaveValue('Lote de teste RDS11');
    await expect(page.getByLabel('Sobre o que anunciar')).toHaveValue('Oferta de teste.');
  });

  test('enquanto o lote é criado o botão fica desabilitado', async ({ page, seed }) => {
    await page.route('**/lotes/novo*', async (route) => {
      if (route.request().method() === 'POST') {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      await route.continue();
    });
    await page.goto('/lotes/novo');
    await page.getByLabel('Nome do lote').fill('Lote lento RDS11');
    await page.getByLabel('Sobre o que anunciar').fill('Oferta de teste.');
    await page.getByRole('checkbox', { name: new RegExp(seed.asset.filename) }).check();
    const criar = page.getByRole('button', { name: /^Criar lote/ });
    await criar.click();
    await expect(page.getByRole('button', { name: 'Criando...' })).toBeDisabled();
  });
});
