import { expect, test } from './fixtures.js';

const TOKEN = 'EAA-whatsapp-e2e-token-0001';
let contaUrl = '';

test.describe('whatsapp (RDS-54)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ seed }) => {
    expect(seed.admin.role).toBe('admin');
  });

  test('conectar um número lista a conta e nunca devolve o token', async ({ page, seed }) => {
    await page.goto('/whatsapp');
    await page.getByLabel('Cliente').selectOption({ label: seed.client.name });
    await page.getByLabel('Nome de exibição').fill('RDS17 Número');
    await page.getByLabel('WABA id').fill('700100200300');
    await page.getByLabel('Phone number id').fill('600100200300400');
    await page.getByLabel('Token do system user').fill(TOKEN);
    await page.getByRole('button', { name: 'Conectar conta' }).click();

    await expect(page.getByText('Conta conectada.')).toBeVisible();
    await expect(page.getByLabel('Token do system user')).toHaveValue('');
    const linha = page.getByRole('row').filter({ hasText: 'RDS17 Número' });
    await expect(linha).toContainText('Ativa');
    expect(await page.content()).not.toContain(TOKEN);

    await linha.getByRole('link', { name: 'RDS17 Número' }).click();
    await expect(page).toHaveURL(/conta=/);
    contaUrl = page.url();
    await expect(page.getByRole('row').filter({ hasText: 'CONNECTED' })).toContainText('+55 11 99999-0000');
    await expect(page.getByRole('row').filter({ hasText: 'pedido_pronto' })).toContainText('APPROVED');
    expect(await page.content()).not.toContain(TOKEN);
  });

  test('criar modelo o lista como pendente de análise', async ({ page }) => {
    await page.goto(contaUrl);
    await page.getByLabel('Nome', { exact: true }).fill('rds17_modelo');
    await page.getByLabel('Corpo').fill('Olá, seu pedido saiu para entrega.');
    await page.getByRole('button', { name: 'Criar modelo' }).click();
    await expect(page.getByRole('row').filter({ hasText: 'rds17_modelo' })).toContainText('PENDING');
  });

  test('enviar teste pede confirmação e só então chama a Meta', async ({ page }) => {
    await page.goto(contaUrl);
    await page.getByLabel('Telefone de destino').fill('5511999990000');
    await page.getByLabel('Modelo aprovado').selectOption({ label: 'pedido_pronto · pt_BR' });
    await page.getByRole('button', { name: 'Revisar envio' }).click();

    const confirmacao = page.getByRole('dialog');
    await expect(confirmacao).toContainText('pedido_pronto');
    await expect(confirmacao).toContainText('5511999990000');
    await expect(confirmacao).toContainText('A Meta só recebe o pedido depois desta confirmação.');
    await expect(page.getByText('Mensagem aceita pela Meta.')).toHaveCount(0);

    await confirmacao.getByRole('button', { name: 'Enviar' }).click();
    await expect(page.getByText('Mensagem aceita pela Meta.')).toBeVisible();
  });
});
