/**
 * Jornada 10: a Meta pode criar o objeto e perder a resposta. O AdPub nunca
 * recria sozinho — o item e a campanha compartilhada ficam parados esperando
 * alguém conferir. Aqui o gestor resolve os dois pela tela: informa o ID que
 * viu no Gerenciador, o lote volta a andar e nada é criado em dobro.
 */
import {
  claimRef,
  createDb,
  getRef,
  listDraftsOfBatch,
  markDraftsQueued,
  markRefReconcile,
  transitionDraft,
} from '@adpub/db';

import { E2E_DATABASE, POSTGRES_BASE_URL } from './env.js';
import { criarLoteComIa, expect, test } from './fixtures.js';

/** ID que o gestor "viu" no Gerenciador de Anúncios. */
const CAMPANHA_NA_META = '23850000000000101';

test('conferência pendente na Meta é resolvida pela tela e o lote segue', async ({
  page,
  seed,
}) => {
  await criarLoteComIa(page, seed, 'Inverno - Conferência', seed.reviewAccount.name);
  const batchId = new URL(page.url()).pathname.split('/').pop() as string;

  await page.getByRole('button', { name: 'Validar lote' }).click();
  await expect(page.getByText('lote liberado para publicar')).toBeVisible();

  // Estado que o pipeline grava quando a resposta do create se perde: item
  // parado no create do anúncio e campanha compartilhada congelada.
  const { db, sql } = createDb(`${POSTGRES_BASE_URL}/${E2E_DATABASE}`);
  try {
    const items = await listDraftsOfBatch(db, batchId);
    const item = items[0];
    if (!item) throw new Error('Lote semeado sem itens.');
    await markDraftsQueued(db, [item.id]);
    await transitionDraft(db, item.id, 'creating_ad', { step: 'create_ad', attempts: 1 });
    await transitionDraft(db, item.id, 'needs_reconciliation', {
      step: 'create_ad',
      attempts: 1,
      error: {
        message: 'Timeout ao criar o anúncio',
        translated: 'Resposta da Meta se perdeu após possível criação.',
        action: 'Confira na Meta e resolva a reconciliação do item.',
        step: 'create_ad',
      },
    });
    await claimRef(db, {
      batchId,
      refKey: 'campaign:c1',
      kind: 'campaign',
      spec: { name: 'Loja Teste_trafego_inverno' },
      owner: 'worker-e2e',
    });
    await markRefReconcile(db, batchId, 'campaign:c1', 'Timeout ao criar a campanha');

    await page.reload();

    await expect(
      page.getByRole('heading', { name: 'Conferência pendente na Meta' }),
    ).toBeVisible();
    await expect(page.getByText('Campanha compartilhada: campaign:c1')).toBeVisible();
    await expect(page.getByText('Timeout ao criar a campanha')).toBeVisible();

    // Adotar sem informar o que foi conferido não manda nada para a API.
    await page.getByRole('button', { name: 'Adotar o que existe na Meta' }).click();
    await expect(page.getByRole('alert').first()).toContainText('Descreva o que você conferiu');

    await page.getByLabel('ID da campanha na Meta').fill(CAMPANHA_NA_META);
    await page.getByLabel('O que você conferiu').first().fill('campanha existe na Meta');
    await page.getByRole('button', { name: 'Adotar o que existe na Meta' }).click();

    await expect(page.getByText('Campanha compartilhada: campaign:c1')).toHaveCount(0);
    const ref = await getRef(db, batchId, 'campaign:c1');
    expect(ref?.state).toBe('created');
    expect(ref?.metaId).toBe(CAMPANHA_NA_META);

    // Item: o gestor confere o anúncio criado e retoma dali — a fila do
    // harness roda o worker na hora, então o item termina publicado.
    await expect(page.getByText('Parou em Anúncio')).toBeVisible();
    await page.getByLabel('ID do anúncio criado na Meta').fill('23850000000000404');
    await page.getByLabel('O que você conferiu').last().fill('anúncio existe, sem resposta');
    await page.getByRole('button', { name: 'Adotar e retomar' }).click();

    const linha = page.getByRole('row').filter({ hasText: 'Imagem única' }).first();
    await expect(linha).toContainText('Publicado');
    await expect(
      page.getByRole('heading', { name: 'Conferência pendente na Meta' }),
    ).toHaveCount(0);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
