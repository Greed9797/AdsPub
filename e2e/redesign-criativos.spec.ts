import { expect, test } from './fixtures.js';
import { semearBiblioteca } from './seed-lotes.js';

let clientId = '';

test.describe('criativos (RDS-50, RDS-59)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    ({ clientId } = await semearBiblioteca('RDS13 Cliente', [
      { filename: 'ok-1.jpg', kind: 'image', status: 'ok' },
      { filename: 'ok-2.jpg', kind: 'image', status: 'ok' },
      { filename: 'aviso.mp4', kind: 'video', status: 'ok', warnings: ['Áudio MP3: prefira AAC.'] },
      { filename: 'recusada.mov', kind: 'video', status: 'rejected', errors: ['HEVC não aceito. Reexporte em MP4 H.264.'] },
    ]));
  });

  test.beforeEach(async ({ seed }) => {
    expect(seed.admin.role).toBe('admin');
  });

  test('o quadro conta aprovadas, com aviso e recusadas por tipo, sem inventar o que a API não tem', async ({ page }) => {
    await page.goto(`/criativos?client_id=${clientId}`);
    const quadro = page.getByRole('region', { name: 'Quadro de validação' });
    await expect(quadro).toContainText('3');
    await expect(quadro).toContainText('de 4 podem entrar em lote');
    await expect(quadro.getByRole('img', { name: '2 aprovadas, 0 com aviso, 0 recusadas' })).toBeVisible();
    await expect(quadro.getByRole('img', { name: '0 aprovadas, 1 com aviso, 1 recusadas' })).toBeVisible();
    // Nada de "Usada em N lotes" nem "Analisando com IA": a API não devolve esses números.
    await expect(page.getByText(/Usada em/)).toHaveCount(0);
    await expect(page.getByText(/Analisando com IA/)).toHaveCount(0);
  });

  test('a grade mostra o selo de estado e o motivo quando a mídia é recusada', async ({ page }) => {
    await page.goto(`/criativos?client_id=${clientId}`);
    const recusada = page.locator('article').filter({ hasText: 'recusada.mov' });
    await expect(recusada).toContainText('Recusada');
    await expect(recusada).toContainText('HEVC não aceito. Reexporte em MP4 H.264.');
    await expect(recusada.getByRole('checkbox')).toHaveCount(0);
    await expect(page.locator('article').filter({ hasText: 'aviso.mp4' })).toContainText('Com aviso');
    await expect(page.locator('article').filter({ hasText: 'ok-1.jpg' })).toContainText('Aprovada');
  });

  test('os chips filtram a lista pelo estado e mantêm o cliente', async ({ page }) => {
    await page.goto(`/criativos?client_id=${clientId}`);
    await page.getByRole('link', { name: /^Recusadas/ }).click();
    await expect(page).toHaveURL(/status=recusadas/);
    await expect(page).toHaveURL(new RegExp(`client_id=${clientId}`));
    await expect(page.locator('article')).toHaveCount(1);
    await expect(page.locator('article').first()).toContainText('recusada.mov');
  });

  test('selecionar mídias abre a barra e leva ao novo lote com elas marcadas', async ({ page }) => {
    await page.goto(`/criativos?client_id=${clientId}`);
    await page.getByRole('checkbox', { name: 'Selecionar ok-1.jpg' }).check();
    await page.getByRole('checkbox', { name: 'Selecionar aviso.mp4' }).check();
    const barra = page.getByRole('region', { name: 'Mídias selecionadas' });
    await expect(barra).toContainText('2 mídias selecionadas');
    await barra.getByRole('link', { name: 'Criar lote com estas mídias' }).click();
    await expect(page).toHaveURL(/\/lotes\/novo\?client_id=.*&assets=/);
    await expect(page.getByRole('checkbox', { name: /ok-1\.jpg/ })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: /aviso\.mp4/ })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: /ok-2\.jpg/ })).not.toBeChecked();
  });
});
