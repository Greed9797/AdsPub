/**
 * Fixtures das jornadas: injetam a sessão direto como cookie assinado.
 * O login do Google não roda no e2e (nenhuma chamada externa), então o teste
 * assina o mesmo JWT que o BFF assinaria depois do OAuth — sem backdoor no
 * produto: a API e a UI continuam exigindo um token válido.
 */
import { readFile } from 'node:fs/promises';

import { SESSION_COOKIE, mintSessionToken } from '@adpub/auth';
import { test as base, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

import { AUTH_SECRET } from './env.js';
import { SEED_FILE, type SeedData } from './seed-handoff.js';

export { expect };

interface Fixtures {
  /** Dados semeados por `scripts/e2e/server.ts` antes da API subir. */
  seed: SeedData;
}

export const test = base.extend<Fixtures>({
  seed: async ({ context }, use) => {
    const seed = JSON.parse(await readFile(SEED_FILE, 'utf8')) as SeedData;
    const token = await mintSessionToken(seed.admin, AUTH_SECRET);

    await context.addCookies([
      {
        name: SESSION_COOKIE,
        value: token,
        domain: '127.0.0.1',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
        expires: Math.floor(Date.now() / 1000) + 8 * 60 * 60,
      },
    ]);

    await use(seed);
  },
});

/**
 * Jornada 3 em forma reutilizável: a jornada 5 precisa de um lote já planejado
 * e o caminho honesto para chegar nele é o mesmo formulário do gestor.
 * `conta` permite isolar jornadas que publicam: o teto diário é por conta.
 */
export async function criarLoteComIa(
  page: Page,
  seed: SeedData,
  nome: string,
  conta: string = seed.account.name,
): Promise<void> {
  await page.goto('/lotes/novo');

  await page.getByLabel('Cliente').selectOption({ label: seed.client.name });
  await page.getByLabel('Conta de anúncios').selectOption({ label: conta });
  await page.getByLabel('Nome do lote').fill(nome);
  await page.getByRole('radio', { name: /Planejamento com IA/ }).check();
  await page.getByLabel(/Textos diferentes por foto/).fill('2');
  await page
    .getByLabel(/Sobre o que anunciar/)
    .fill('Vendas no site, 20% OFF na coleção de inverno, cupom INVERNO20.');

  await page.getByRole('checkbox', { name: new RegExp(seed.asset.filename) }).check();
  await page.getByRole('button', { name: 'Criar lote' }).click();

  await page.waitForURL(/\/lotes\/[0-9a-f-]{36}$/);
}
