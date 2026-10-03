import { fileURLToPath } from 'node:url';

import { expect, test } from './fixtures.js';

const CSV_VALIDO = fileURLToPath(new URL('./fixtures/relatorio-rds19.csv', import.meta.url));
const CSV_MISTO = fileURLToPath(new URL('./fixtures/relatorio-misto.csv', import.meta.url));

test.describe('inteligência e relatórios (RDS-56)', () => {
  test.beforeEach(async ({ seed }) => {
    expect(seed.admin.role).toBe('admin');
  });

  test('gerar relatório mostra fatos, hipóteses, testes e limitações', async ({ page, seed }) => {
    await page.goto('/inteligencia');
    await page.getByLabel('Conta').selectOption({ label: seed.account.name });
    await page.getByRole('button', { name: 'Usar conta' }).click();
    await page.getByLabel('De', { exact: true }).fill('2026-09-01');
    await page.getByLabel('Até').fill('2026-09-02');
    await page.getByRole('button', { name: 'Gerar relatório' }).click();
    for (const titulo of ['Fatos', 'Hipóteses', 'Próximos testes', 'Limitações']) {
      await expect(page.getByRole('heading', { name: titulo })).toBeVisible();
    }
    await expect(page.getByText(/Baseado em/)).toBeVisible();
  });

  test('a importação mostra a prévia e avisa que só vale depois de confirmar', async ({ page, seed }) => {
    await page.goto('/relatorios');
    await page.getByLabel('Cliente').selectOption({ label: seed.client.name });
    await page.getByRole('button', { name: 'Usar cliente' }).click();
    await page.getByLabel('Arquivo CSV ou XLSX').setInputFiles(CSV_VALIDO);
    await page.getByRole('button', { name: 'Enviar e pré-visualizar' }).click();

    await expect(page.getByText('1 válida(s)')).toBeVisible();
    await expect(page.getByText('A importação só vale depois de confirmar')).toBeVisible();
    await expect(page.getByText('observação(ões) confirmadas.')).toHaveCount(0);
    await page.getByRole('button', { name: /Confirmar 1 observação/ }).click();
    await expect(page.getByText('1 observação(ões) confirmadas.')).toBeVisible();
  });

  test('linha inválida aparece com o motivo e fica fora da confirmação', async ({ page, seed }) => {
    await page.goto(`/relatorios?client_id=${seed.client.id}`);
    await page.getByLabel('Arquivo CSV ou XLSX').setInputFiles(CSV_MISTO);
    await page.getByRole('button', { name: 'Enviar e pré-visualizar' }).click();

    await expect(page.getByText('1 válida(s)')).toBeVisible();
    await expect(page.getByText('1 inválida(s)')).toBeVisible();
    const invalida = page.getByRole('listitem').filter({ hasText: 'Linha 2' });
    await expect(invalida).toBeVisible();
    await expect(invalida).toContainText('row.missing_period');
    await expect(page.getByRole('button', { name: /Confirmar 1 observação/ })).toBeVisible();
  });

  test('o leitor não gera nem importa', async ({ page, context, seed }) => {
    const { mintSessionToken, SESSION_COOKIE } = await import('@adpub/auth');
    const { AUTH_SECRET } = await import('./env.js');
    const { semearUsuario } = await import('./seed-lotes.js');
    const token = await mintSessionToken(await semearUsuario('viewer', [seed.account.id]), AUTH_SECRET);
    await context.addCookies([
      { name: SESSION_COOKIE, value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax', expires: Math.floor(Date.now() / 1000) + 3600 },
    ]);
    await page.goto(`/relatorios?client_id=${seed.client.id}`);
    await expect(page.getByText('Somente leitura')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enviar e pré-visualizar' })).toHaveCount(0);
  });
});
