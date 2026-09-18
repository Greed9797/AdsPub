/**
 * Jornada 1 (US1): o admin conecta a Business Manager e sincroniza o
 * inventário — a conexão fica ativa com o tier reportado pela Graph e a conta
 * importada aparece com os padrões de página, Instagram, pixel e teto diário.
 * A Graph API é a falsa de `scripts/lib/fake-graph.ts`.
 */
import { expect, test } from './fixtures.js';

test('conexão sincronizada e conta com padrões aparecem em /contas', async ({ page, seed }) => {
  await page.goto('/contas');

  const conexao = page.getByRole('row').filter({ hasText: seed.connection.label });
  await expect(conexao).toContainText(seed.connection.businessId);
  await expect(conexao).toContainText('Ativa');
  await expect(conexao).toContainText(seed.connection.apiTier);

  const conta = page.getByRole('row').filter({ hasText: seed.account.id });
  await expect(conta).toContainText(seed.account.name);
  await expect(conta).toContainText('Real (R$) / São Paulo');
  await expect(conta).toContainText(seed.client.name);
  await expect(conta).toContainText(seed.account.pageId);
  await expect(conta).toContainText(seed.account.igUserId);
  await expect(conta).toContainText(seed.account.pixelId);
  await expect(conta).toContainText(String(seed.account.dailyAdCap));

  // O gestor vai para a Meta pelo link pronto, nunca digitando o act_ à mão.
  await expect(conta.getByRole('link', { name: 'Abrir' })).toHaveAttribute(
    'href',
    /adsmanager\.facebook\.com.*act=1030000000001/,
  );
});

test('contas em 390px: rolagem contida na tabela e ações alcançáveis', async ({
  page,
  seed,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/contas');

  // Dados, não títulos incidentais: conta e identificadores legíveis.
  const conta = page.getByRole('row').filter({ hasText: seed.account.id });
  await expect(conta).toContainText(seed.account.name);
  await expect(conta).toContainText(seed.account.pageId);
  await expect(conta).toContainText(seed.account.igUserId);

  // A rolagem horizontal fica dentro da região da tabela, sem vazar a página.
  // tsconfig.scripts não tem lib DOM: globals via globalThis sem tipos da DOM.
  const pagina = await page.evaluate((): { scroll: number; largura: number } => {
    const g = globalThis as unknown as {
      document: { documentElement: { scrollWidth: number } };
      innerWidth: number;
    };
    return { scroll: g.document.documentElement.scrollWidth, largura: g.innerWidth };
  });
  expect(pagina.scroll).toBeLessThanOrEqual(pagina.largura);
  // A rolagem acontece no contêiner efetivo da linha (a tabela Astryx tem o
  // próprio wrapper de scroll dentro da região): ele contém a rolagem e a
  // página não vaza.
  interface ScrollBox {
    parentElement: ScrollBox | null;
    scrollWidth: number;
    clientWidth: number;
  }
  const rolagem = await conta.evaluate((row: { parentElement: ScrollBox | null }) => {
    let el: ScrollBox | null = row.parentElement;
    while (el) {
      if (el.scrollWidth > el.clientWidth + 1) {
        return { total: el.scrollWidth, visivel: el.clientWidth };
      }
      el = el.parentElement;
    }
    return null;
  });
  expect(rolagem, 'contêiner de rolagem da linha').not.toBeNull();
  expect(rolagem!.total).toBeGreaterThan(rolagem!.visivel);

  // Ações alcançáveis com scroll e teclado: o foco leva o link à vista e o
  // clique rola o contêiner até o botão.
  await conta.getByRole('link', { name: 'Abrir' }).focus();
  await expect(conta.getByRole('link', { name: 'Abrir' })).toBeVisible();
  await conta.getByRole('button', { name: 'Editar padrões' }).click();
  await expect(page.getByRole('heading', { name: 'Padrões de publicação' })).toBeVisible();
  await page.getByRole('button', { name: 'Fechar' }).click();
  await expect(page.getByRole('heading', { name: 'Padrões de publicação' })).not.toBeVisible();

  await page.screenshot({ path: 'e2e/.artifacts/jornada-1-contas-390.png' });
  await page.getByLabel('Tema').selectOption('dark');
  await expect(conta).toContainText(seed.account.name);
  await page.screenshot({ path: 'e2e/.artifacts/jornada-1-contas-390-escuro.png' });
  await page.getByLabel('Tema').selectOption('system');
});

test('contas nos dois temas: alteração não salva não persiste e tema persiste', async ({
  page,
  seed,
}) => {
  await page.goto('/contas');
  await page.setViewportSize({ width: 1440, height: 900 });
  const conta = page.getByRole('row').filter({ hasText: seed.account.id });
  await expect(conta).toContainText(seed.account.name);

  // Fechar com alteração não salva: o rascunho segue no cliente, mas nada
  // persiste — após reload o editor volta ao valor gravado da conta.
  // O editor é por conta e o seed tem mais de uma: escopo no diálogo da conta.
  const editor = page.getByRole('dialog').filter({ hasText: seed.account.name });
  await conta.getByRole('button', { name: 'Editar padrões' }).click();
  await editor.getByLabel('Página padrão').fill('000000000000000');
  await page.getByRole('button', { name: 'Fechar' }).click();
  await expect(page.getByRole('heading', { name: 'Padrões de publicação' })).not.toBeVisible();
  await expect(conta).toContainText(seed.account.pageId);
  await page.reload();
  await conta.getByRole('button', { name: 'Editar padrões' }).click();
  await expect(editor.getByLabel('Página padrão')).toHaveValue(seed.account.pageId);
  await page.getByRole('button', { name: 'Fechar' }).click();

  // Escuro primeiro (diferença visual máxima contra o padrão do harness).
  await page.getByLabel('Tema').selectOption('dark');
  await expect(conta).toContainText(seed.account.name);
  await page.screenshot({ path: 'e2e/.artifacts/jornada-1-contas-escuro.png' });

  await page.getByLabel('Tema').selectOption('light');
  await expect(conta).toContainText(seed.account.name);
  await page.screenshot({ path: 'e2e/.artifacts/jornada-1-contas-claro.png' });

  // Tema persiste após reload (cookie adpub_theme).
  await page.reload();
  await expect(page.getByLabel('Tema')).toHaveValue('light');
  await expect(page.getByRole('row').filter({ hasText: seed.account.id })).toContainText(
    seed.account.name,
  );
});
