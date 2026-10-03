import { readFile } from 'node:fs/promises';

import type { BrowserContext, Page } from '@playwright/test';

import { expect, test } from './fixtures.js';
import { SEED_FILE, type SeedData } from './seed-handoff.js';
import { semearLotes } from './seed-lotes.js';
import { SONDA_CONTRASTE, SONDA_CORTE, SONDA_ROLAGEM_HORIZONTAL } from './visual-probes.js';

type Tema = 'light' | 'dark';
const TELAS = [
  { nome: 'desktop', width: 1440, height: 900 },
  { nome: 'mobile', width: 390, height: 844 },
] as const;

let rotas: Array<{ nome: string; url: string }> = [];

async function usarTema(context: BrowserContext, tema: Tema): Promise<void> {
  await context.addCookies([{ name: 'adpub_theme', value: tema, domain: '127.0.0.1', path: '/' }]);
}

async function abrir(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForLoadState('networkidle');
}

test.describe('verificação visual (RDS-91)', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  test.beforeAll(async () => {
    const seed = JSON.parse(await readFile(SEED_FILE, 'utf8')) as SeedData;
    const [lote] = await semearLotes(seed, [
      {
        nome: 'RDS25 Lote visual', status: 'partial', etapa: 'ensure_adset', refs: { campanha: 'created', conjunto: 'failed' },
        anuncios: ['published', 'failed', 'blocked', 'ready', 'in_review'], comErro: false,
      },
    ]);
    rotas = [
      { nome: 'lotes', url: '/' },
      { nome: 'lote-aberto', url: `/lotes/${lote}` },
      { nome: 'novo-lote', url: '/lotes/novo' },
      { nome: 'criativos', url: `/criativos?client_id=${seed.client.id}` },
      { nome: 'contas', url: '/contas' },
      { nome: 'clientes', url: '/clientes' },
      { nome: 'saude', url: '/saude' },
      { nome: 'whatsapp', url: '/whatsapp' },
      { nome: 'performance', url: `/performance?ad_account_id=${seed.reviewAccount.id}` },
      { nome: 'inteligencia', url: `/inteligencia?ad_account_id=${seed.account.id}` },
      { nome: 'relatorios', url: `/relatorios?client_id=${seed.client.id}` },
      { nome: 'auditoria', url: '/auditoria' },
      { nome: 'usuarios', url: '/usuarios' },
      { nome: 'mais', url: '/mais' },
    ];
  });

  test.beforeEach(async ({ seed }) => {
    expect(seed.admin.role).toBe('admin');
  });

  test('nenhuma rota rola na horizontal em 390 px, no claro e no escuro', async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const falhas: string[] = [];
    for (const tema of ['light', 'dark'] as const) {
      await usarTema(context, tema);
      for (const rota of rotas) {
        await abrir(page, rota.url);
        const estouro = await page.evaluate<number>(SONDA_ROLAGEM_HORIZONTAL);
        if (estouro > 0) falhas.push(`${rota.nome} (${tema}): ${estouro}px a mais`);
      }
    }
    expect(falhas, falhas.join('\n')).toEqual([]);
  });

  test('todo texto tem contraste de pelo menos 4,5:1 (3:1 para texto grande) no claro e no escuro', async ({ page, context }) => {
    const falhas: string[] = [];
    for (const tela of TELAS) {
      await page.setViewportSize({ width: tela.width, height: tela.height });
      for (const tema of ['light', 'dark'] as const) {
        await usarTema(context, tema);
        for (const rota of rotas) {
          await abrir(page, rota.url);
          const achados = await page.evaluate<Array<{ texto: string; ratio: number; minimo: number; no: string; cor: string; fundo: string }>>(SONDA_CONTRASTE);
          for (const a of achados.slice(0, 5)) {
            falhas.push(`${rota.nome} ${tela.nome} ${tema}: "${a.texto}" ${a.ratio}:1 (mín ${a.minimo}) ${a.no} ${a.cor} sobre ${a.fundo}`);
          }
        }
      }
    }
    expect(falhas, falhas.join('\n')).toEqual([]);
  });

  test('nenhum texto fica cortado nas capturas de 1440 e 390 px, que ficam guardadas para conferir com o Figma', async ({ page, context }) => {
    const falhas: string[] = [];
    for (const tela of TELAS) {
      await page.setViewportSize({ width: tela.width, height: tela.height });
      for (const tema of ['light', 'dark'] as const) {
        await usarTema(context, tema);
        for (const rota of rotas) {
          await abrir(page, rota.url);
          const achados = await page.evaluate<Array<{ no: string; texto: string; scroll: string; caixa: string }>>(SONDA_CORTE);
          for (const a of achados.slice(0, 5)) {
            falhas.push(`${rota.nome} ${tela.nome} ${tema}: ${a.no} "${a.texto}" (conteúdo ${a.scroll}, caixa ${a.caixa})`);
          }
          if (tema === 'light') {
            await page.screenshot({ path: `e2e/.artifacts/visual/${rota.nome}-${tela.nome}.png`, fullPage: true });
          }
        }
      }
    }
    expect(falhas, falhas.join('\n')).toEqual([]);
  });
});
