import { readFile } from 'node:fs/promises';

import { SESSION_COOKIE, mintSessionToken } from '@adpub/auth';

import { AUTH_SECRET } from './env.js';
import { expect, test } from './fixtures.js';
import { SEED_FILE, type SeedData } from './seed-handoff.js';
import { semearLotes, semearUsuario } from './seed-lotes.js';

const Q = 'RDS8';
let falha = '';
let concluido = '';

test.describe('lote aberto: anúncios e estrutura (RDS-20, RDS-27)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    const seed = JSON.parse(await readFile(SEED_FILE, 'utf8')) as SeedData;
    [falha, concluido] = await semearLotes(seed, [
      {
        nome: `${Q} Falha`, status: 'partial', etapa: 'ensure_adset', anuncios: ['failed', 'ready'],
        refs: { campanha: 'created', conjunto: 'failed' },
      },
      { nome: `${Q} Ok`, status: 'done', etapa: 'done', anuncios: ['published'], refs: { campanha: 'created', conjunto: 'created' } },
    ]) as [string, string];
  });

  test.beforeEach(async ({ seed }) => {
    expect(seed.admin.role).toBe('admin');
  });

  test('cada anúncio mostra 5 segmentos de etapa, a legenda e o selo de estado', async ({ page }) => {
    await page.goto(`/lotes/${falha}`);
    const linha = page.getByRole('row').filter({ hasText: 'AD-01' });
    const segmentos = linha.locator('.ap-etapas__bar i');
    await expect(segmentos).toHaveCount(5);
    await expect(segmentos.nth(1)).toHaveAttribute('data-estado', 'done');
    await expect(segmentos.nth(2)).toHaveAttribute('data-estado', 'failed');
    await expect(linha).toContainText('falhou em conjunto');
    await expect(linha).toContainText('Falhou');

    const pronto = page.getByRole('row').filter({ hasText: 'AD-02' });
    await expect(pronto).toContainText('ainda não enviado');
    await expect(pronto).toContainText('Pronto');
  });

  test('anúncio publicado tem as 5 etapas concluídas', async ({ page }) => {
    await page.goto(`/lotes/${concluido}`);
    const linha = page.getByRole('row').filter({ hasText: 'AD-01' });
    await expect(linha.locator('.ap-etapas__bar i[data-estado="done"]')).toHaveCount(5);
    await expect(linha).toContainText('concluído');
    await expect(linha).toContainText('Publicado');
  });

  test('a estrutura lista campanha e conjuntos com o estado de cada ref', async ({ page }) => {
    await page.goto(`/lotes/${falha}`);
    const estrutura = page.getByRole('list', { name: 'Estrutura compartilhada na Meta' });
    const campanha = estrutura.getByRole('listitem').filter({ hasText: 'Campanha' });
    await expect(campanha).toContainText('criada');
    await expect(campanha).toContainText('ID Meta 120001');
    const conjunto = estrutura.getByRole('listitem').filter({ hasText: 'Conjunto 1' });
    await expect(conjunto).toContainText('falhou');
    await expect(conjunto).toContainText('2 anúncios');
  });

  test('com papel viewer nenhuma ação de edição ou publicação aparece', async ({ page, context, seed }) => {
    const token = await mintSessionToken(await semearUsuario('viewer', [seed.account.id]), AUTH_SECRET);
    await context.addCookies([
      { name: SESSION_COOKIE, value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax', expires: Math.floor(Date.now() / 1000) + 3600 },
    ]);
    await page.goto(`/lotes/${falha}`);
    await expect(page.getByRole('row').filter({ hasText: 'AD-01' })).toBeVisible();
    for (const nome of ['Editar', 'Remover', 'Reprocessar', 'Validar lote', 'Publicar']) {
      await expect(page.getByRole('button', { name: new RegExp(nome) })).toHaveCount(0);
    }
  });
});
