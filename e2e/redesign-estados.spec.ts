import { SESSION_COOKIE, mintSessionToken } from '@adpub/auth';

import { AUTH_SECRET } from './env.js';
import { expect, test } from './fixtures.js';
import { semearUsuario } from './seed-lotes.js';

test.describe('estados de erro, não encontrado e permissão (RDS-70, RDS-71, RDS-73)', () => {
  test.beforeEach(async ({ seed }) => {
    expect(seed.admin.role).toBe('admin');
  });

  test('quando a API recusa a leitura, a rota mostra o erro com o código e "Tentar de novo"', async ({ page }) => {
    await page.goto('/performance?ad_account_id=act_conta_que_nao_existe');
    await expect(page.getByRole('heading', { name: 'Algo falhou ao carregar' })).toBeVisible();
    await expect(page.getByText(/Código da requisição:/)).toBeVisible();
    const tentar = page.getByRole('button', { name: 'Tentar de novo' });
    await expect(tentar).toBeVisible();
    await tentar.click();
    await expect(page.getByRole('heading', { name: 'Algo falhou ao carregar' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Voltar aos lotes' })).toHaveAttribute('href', '/');
  });

  test('rota inexistente e lote inexistente mostram "não encontrado" com o caminho de volta', async ({ page }) => {
    const resposta = await page.goto('/rota-que-nao-existe');
    expect(resposta?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Voltar aos lotes' })).toHaveAttribute('href', '/');

    await page.goto('/lotes/00000000-0000-4000-8000-000000000000');
    await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
  });

  test('papel sem permissão vê o motivo e volta aos lotes, em vez de cair na home sem explicação', async ({ page, context, seed }) => {
    const token = await mintSessionToken(await semearUsuario('viewer', [seed.account.id]), AUTH_SECRET);
    await context.addCookies([
      { name: SESSION_COOKIE, value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax', expires: Math.floor(Date.now() / 1000) + 3600 },
    ]);
    await page.goto('/usuarios');
    await expect(page.getByRole('heading', { name: 'Você não tem acesso a esta página' })).toBeVisible();
    await expect(page.getByText(/Seu papel hoje é Leitor/)).toBeVisible();
    await page.getByRole('link', { name: 'Voltar aos lotes' }).click();
    await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
  });
});
