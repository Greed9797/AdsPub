/**
 * Jornada 11: a revisão fecha o ciclo na tela — o gestor vê por que o item
 * está bloqueado dentro do editor, corrige, e a aprovação só vale para o
 * conteúdo validado: qualquer edição depois disso volta a travar a publicação
 * até revalidar (é o que a API exige).
 */
import { criarLoteComIa, expect, test } from './fixtures.js';

test('revisão mostra o problema, corrige e exige revalidar depois de editar', async ({
  page,
  seed,
}) => {
  await criarLoteComIa(page, seed, 'Inverno - Revisão', seed.reviewAccount.name);

  const primeiroItem = page.getByRole('row').filter({ hasText: 'single-image' }).first();

  // Sem validar, a publicação fica travada com o motivo à vista.
  await expect(page.getByText('Valide o lote para liberar a publicação.')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Publicar/ })).toBeDisabled();

  // Link fora do domínio do cliente bloqueia o item; o editor mostra o erro
  // junto do campo que resolve.
  await primeiroItem.getByRole('button', { name: 'Editar' }).click();
  await page.getByLabel(/^Link/).fill('https://dominio-errado.com/oferta');
  await page.getByRole('button', { name: 'Salvar item' }).click();
  await expect(page.getByRole('heading', { name: 'Editar anúncio' })).toHaveCount(0);
  await expect(primeiroItem).toContainText('Bloqueado');

  await primeiroItem.getByRole('button', { name: 'Editar' }).click();
  await expect(page.getByText(/domínio/i).first()).toBeVisible();
  await page.getByLabel(/^Link/).fill(seed.landing);
  await page.getByRole('button', { name: 'Salvar item' }).click();
  await expect(page.getByRole('heading', { name: 'Editar anúncio' })).toHaveCount(0);
  await expect(primeiroItem).toContainText('Pronto');

  // Validar libera a publicação e a tela mostra desde quando vale.
  await page.getByRole('button', { name: 'Validar lote' }).click();
  await expect(page.getByText('lote liberado para publicar')).toBeVisible();
  await expect(page.getByText(/Validado em .* — liberado para publicar/)).toBeVisible();
  await expect(page.getByRole('button', { name: /^Publicar/ })).toBeEnabled();

  // Editar depois de validar derruba a aprovação: a tela avisa e o botão
  // fecha, em vez de prometer uma publicação que a API recusa.
  await primeiroItem.getByRole('button', { name: 'Editar' }).click();
  await page.getByLabel('Título').fill('Título revisado na conferência');
  await page.getByRole('button', { name: 'Salvar item' }).click();
  await expect(page.getByRole('heading', { name: 'Editar anúncio' })).toHaveCount(0);

  await expect(
    page.getByText('O lote mudou depois da validação. Valide de novo para liberar a publicação.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /^Publicar/ })).toBeDisabled();

  await page.getByRole('button', { name: 'Validar lote' }).click();
  await expect(page.getByRole('button', { name: /^Publicar/ })).toBeEnabled();
});
