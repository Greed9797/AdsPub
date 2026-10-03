import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import { SEED_FILE, type SeedData } from './seed-handoff.js';
import { desligarSenhas } from './seed-lotes.js';

const SENHA_DO_ADMIN = 'e2e-admin-senha-0123456789';

test.describe('acesso com senha já criada (RDS-40..42)', () => {
  test('mostra só a aba Entrar quando o primeiro acesso não está disponível', async ({ page }) => {
    await page.goto('/login?aba=primeiro');
    const abas = page.getByRole('navigation', { name: 'Tipo de acesso' });
    await expect(abas.getByRole('link', { name: 'Entrar' })).toHaveAttribute('aria-current', 'page');
    await expect(abas.getByRole('link', { name: 'Primeiro acesso' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Entrar no AdPub' })).toBeVisible();
  });

  test('login inválido mostra a mensagem no formulário e mantém os campos', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('E-mail corporativo').fill('alguem@empresa.com.br');
    await page.getByLabel('Senha').fill('senha-errada-123');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.locator('form').getByRole('alert')).toContainText('E-mail ou senha inválidos.');
    await expect(page.getByLabel('E-mail corporativo')).toHaveValue('alguem@empresa.com.br');
    await expect(page.getByLabel('Senha')).toHaveValue('senha-errada-123');
  });

  test('login válido leva à lista de lotes', async ({ page }) => {
    const seed = JSON.parse(await readFile(SEED_FILE, 'utf8')) as SeedData;
    await page.goto('/login');
    await page.getByLabel('E-mail corporativo').fill(seed.admin.email);
    await page.getByLabel('Senha').fill(SENHA_DO_ADMIN);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
    await expect(page.getByRole('heading', { name: 'Lotes' })).toBeVisible();
  });

  test('em 390 px a tela de acesso não rola na horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/login');
    const estouro = await page.evaluate<number>('document.documentElement.scrollWidth - document.documentElement.clientWidth');
    expect(estouro).toBeLessThanOrEqual(0);
  });
});

test.describe('acesso sem nenhuma senha criada', () => {
  test.describe.configure({ mode: 'serial' });
  let restaurar: () => Promise<void>;

  test.beforeAll(async () => {
    restaurar = await desligarSenhas();
  });
  test.afterAll(async () => {
    await restaurar();
  });

  test('mostra as abas Entrar e Primeiro acesso, com o primeiro acesso à frente', async ({ page }) => {
    await page.goto('/login');
    const abas = page.getByRole('navigation', { name: 'Tipo de acesso' });
    await expect(abas.getByRole('link', { name: 'Entrar' })).toBeVisible();
    await expect(abas.getByRole('link', { name: 'Primeiro acesso' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { name: 'Criar administrador' })).toBeVisible();
    await expect(page.getByLabel('Seu nome')).toBeVisible();

    await abas.getByRole('link', { name: 'Entrar' }).click();
    await expect(page.getByRole('heading', { name: 'Entrar no AdPub' })).toBeVisible();
  });
});
