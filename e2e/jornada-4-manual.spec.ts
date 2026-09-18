/**
 * Jornada 4 (construtor manual): o gestor monta o lote sem IA, com campanha e
 * conjunto novos, e o orçamento digitado em reais vira centavos exatos no
 * `batches.plan` — nunca lido de `campaign_ref`/`adset_ref`. A publicação usa
 * só a Graph falsa (que recusa tudo que não nasce PAUSED).
 */
import { createDb } from '@adpub/db';
import type { BatchPlan } from '@adpub/shared';

import { E2E_ENV } from './env.js';
import { expect, test } from './fixtures.js';
import type { SeedData } from './seed-handoff.js';
import type { Page } from '@playwright/test';

async function criarLoteManual(page: Page, seed: SeedData, nome: string): Promise<string> {
  await page.goto('/lotes/novo');

  await page.getByLabel('Cliente').selectOption({ label: seed.client.name });
  await page.getByLabel('Conta de anúncios').selectOption({ label: seed.account.name });
  await page.getByLabel('Nome do lote').fill(nome);
  await page.getByRole('combobox', { name: /^Modo/ }).selectOption('manual');
  await page.getByRole('button', { name: 'Criar lote' }).click();

  await page.waitForURL(/\/lotes\/[0-9a-f-]{36}$/);
  return page.url().match(/[0-9a-f-]{36}/)![0]!;
}

async function preencherCopiaValida(page: Page, seed: SeedData): Promise<void> {
  await page.getByRole('checkbox', { name: new RegExp(seed.asset.filename) }).check();
  await page.getByLabel('Texto principal').fill('Manual E2E: 20% OFF na coleção de inverno.');
  await page.getByLabel('Título').fill('Inverno com 20% OFF');
  await page.getByLabel('Descrição').fill('Só até sexta na loja.');
  await page.getByLabel('Link', { exact: true }).fill(seed.landing);
}

/** Lê `batches.plan` por UUID com query parametrizada e conexão encerrada. */
async function lerPlano(batchId: string): Promise<BatchPlan | null> {
  const { sql } = createDb(E2E_ENV.DATABASE_URL, { max: 1, onNotice: () => {} });
  try {
    const rows = await sql`select plan from batches where id = ${batchId}`;
    return (rows[0]?.plan as BatchPlan | null) ?? null;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

test('lote manual converte 1234.56 e 12,34 em centavos exatos e publica pausado', async ({
  page,
  seed,
}) => {
  const batchId = await criarLoteManual(page, seed, 'Inverno - Manual');

  // Destino novo nos dois níveis (sem cache sincronizado no harness).
  await page.getByText('Criar conjunto').click();
  await page.getByLabel('Nome do conjunto').fill('Conjunto Manual E2E');
  await page.locator('#destino-manual').getByLabel('Orçamento diário (R$)').fill('12,34');
  await page.getByText('Criar campanha').click();
  await page.getByLabel('Nome da campanha').fill('Campanha Manual E2E');
  await page.getByLabel('Orçamento diário (R$)').last().fill('1234.56');
  await preencherCopiaValida(page, seed);

  await page.getByRole('button', { name: 'Gerar itens do lote' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Imagem única' })).toHaveCount(1);

  // O orçamento vive no plano JSONB — campaign_ref/adset_ref não têm valor monetário.
  const plan = (await lerPlano(batchId))!;
  expect(plan, 'plano manual persistido').toBeTruthy();
  expect(plan.campaigns).toHaveLength(1);
  expect(plan.adsets).toHaveLength(1);
  expect(plan.campaigns[0]!.daily_budget_cents).toBe(123456);
  expect(plan.adsets[0]!.daily_budget_cents).toBe(1234);
  expect(plan.items[0]!.campaign_ref).toEqual({ kind: 'new', key: 'campanha-nova' });
  expect(plan.items[0]!.adset_ref).toEqual({ kind: 'new', key: 'conjunto-novo' });

  // Só a Graph falsa: ela recusa campanha/conjunto/anúncio que não nasça PAUSED.
  await page.getByRole('button', { name: 'Validar lote' }).click();
  await expect(page.getByText('lote liberado para publicar')).toBeVisible();

  await page.getByRole('button', { name: 'Publicar 1 anúncio', exact: true }).click();
  const confirmation = page.getByRole('dialog');
  await confirmation.getByRole('button', { name: 'Confirmar publicação' }).click();

  await expect(page.getByText('enfileirados: 1')).toBeVisible();
  const item = page.getByRole('row').filter({ hasText: 'Imagem única' });
  await expect(item).toContainText('Publicado');
  // Ida e volta real à Graph falsa, com o id Meta exposto ao gestor.
  await expect(item.getByRole('link')).toHaveAttribute(
    'href',
    /adsmanager\.facebook\.com.*selected_ad_ids=\d+/,
  );
  // Higiene entre jornadas: o teto diário da conta é compartilhado, então o
  // lote publicado sai (cascata nos rascunhos) para não consumir o saldo da jornada 5.
  const cleanup = createDb(E2E_ENV.DATABASE_URL, { max: 1, onNotice: () => {} });
  try {
    await cleanup.sql`delete from batches where id = ${batchId}`;
  } finally {
    await cleanup.sql.end({ timeout: 5 });
  }
});

test('orçamento 1e3 mostra erro e não persiste plano nem recursos', async ({ page, seed }) => {
  const batchId = await criarLoteManual(page, seed, 'Inverno - Manual inválido');

  await page.getByText('Criar conjunto').click();
  await page.getByLabel('Nome do conjunto').fill('Conjunto inválido');
  await page.locator('#destino-manual').getByLabel('Orçamento diário (R$)').fill('1e3');
  await page.getByText('Criar campanha').click();
  await page.getByLabel('Nome da campanha').fill('Campanha inválida');
  await preencherCopiaValida(page, seed);

  await page.getByRole('button', { name: 'Gerar itens do lote' }).click();
  await expect(page.getByText('Orçamento diário inválido.')).toBeVisible();

  // Nada persistido: sem plano e sem itens para validar/publicar.
  expect(await lerPlano(batchId)).toBeNull();
  await expect(page.getByText('Construtor manual')).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Imagem única' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Validar lote' })).toBeDisabled();
});

test('orçamento de campo abandonado não bloqueia o envio', async ({ page, seed }) => {
  // Um conjunto sincronizado para o destino existente virar opção no harness.
  const { sql } = createDb(E2E_ENV.DATABASE_URL, { max: 1, onNotice: () => {} });
  try {
    await sql`insert into campaigns_cache (id, ad_account_id, name, objective, status, effective_status, raw)
      values ('camp_e2e_j4', ${seed.account.id}, 'Campanha Sincronizada E2E', 'OUTCOME_SALES', 'PAUSED', 'PAUSED', '{}')
      on conflict (id) do nothing`;
    await sql`insert into adsets_cache (id, ad_account_id, campaign_id, name, optimization_goal, status, effective_status, raw)
      values ('adset_e2e_j4', ${seed.account.id}, 'camp_e2e_j4', 'Conjunto Sincronizado E2E', 'OFFSITE_CONVERSIONS', 'PAUSED', 'PAUSED', '{}')
      on conflict (id) do nothing`;
  } finally {
    await sql.end({ timeout: 5 });
  }

  const batchId = await criarLoteManual(page, seed, 'Inverno - Manual existente');

  // Digita um orçamento inválido no modo novo e o abandona ao trocar de destino.
  await page.getByText('Criar conjunto').click();
  await page.getByLabel('Nome do conjunto').fill('Conjunto abandonado');
  await page.locator('#destino-manual').getByLabel('Orçamento diário (R$)').fill('1e3');
  await page.getByText('Usar conjunto existente').click();
  await page.getByLabel('Conjunto de anúncios').selectOption('adset_e2e_j4');
  await expect(page.getByText(/Herdada do conjunto escolhido/)).toBeVisible();
  await preencherCopiaValida(page, seed);

  await page.getByRole('button', { name: 'Gerar itens do lote' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Imagem única' })).toHaveCount(1);

  // Destino existente: sem conjunto novo no plano e sem centavos herdados do campo oculto.
  const plan = (await lerPlano(batchId))!;
  expect(plan.adsets).toHaveLength(0);
  expect(plan.items[0]!.adset_ref).toEqual({ kind: 'existing', id: 'adset_e2e_j4' });
  expect(plan.items[0]!.campaign_ref).toEqual({ kind: 'existing', id: 'camp_e2e_j4' });
  // Higiene: o cache semeado serviu só a este teste.
  const cleanup = createDb(E2E_ENV.DATABASE_URL, { max: 1, onNotice: () => {} });
  try {
    await cleanup.sql`delete from adsets_cache where id = 'adset_e2e_j4'`;
    await cleanup.sql`delete from campaigns_cache where id = 'camp_e2e_j4'`;
  } finally {
    await cleanup.sql.end({ timeout: 5 });
  }
});
