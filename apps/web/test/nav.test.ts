import { describe, expect, it } from 'vitest';

import { activeTabId, mobileGroups, screenLabel, visibleTabs } from '../src/lib/nav';

const labels = (tabs: ReturnType<typeof visibleTabs>, id: string) =>
  tabs.find((tab) => tab.id === id)?.items?.map((item) => item.label);

describe('nav: abas (RDS-04)', () => {
  it('mostra as 5 abas na ordem do Figma', () => {
    expect(visibleTabs('admin', {}).map((tab) => tab.label)).toEqual([
      'Lotes',
      'Criativos',
      'Performance',
      'Contas',
      'Gestão',
    ]);
  });

  it('Lotes, Criativos e Performance são links diretos', () => {
    const tabs = visibleTabs('admin', {});
    expect(tabs.slice(0, 3).map((tab) => tab.href)).toEqual(['/', '/criativos', '/performance']);
  });
});

describe('nav: menus por papel e flag (RDS-05)', () => {
  it('Contas lista Conexões Meta, WhatsApp e Saúde das contas', () => {
    const contas = visibleTabs('admin', {}).find((tab) => tab.id === 'contas');
    expect(contas?.items).toEqual([
      { href: '/contas', label: 'Conexões Meta' },
      { href: '/whatsapp', label: 'WhatsApp' },
      { href: '/saude', label: 'Saúde das contas' },
    ]);
  });

  it('o admin vê Inteligência, Relatórios, Clientes, Auditoria e Usuários', () => {
    expect(labels(visibleTabs('admin', {}), 'gestao')).toEqual([
      'Inteligência',
      'Relatórios',
      'Clientes',
      'Auditoria',
      'Usuários',
    ]);
  });

  it('o coordenador vê Auditoria mas não Usuários', () => {
    const gestao = labels(visibleTabs('coordinator', {}), 'gestao');
    expect(gestao).toContain('Auditoria');
    expect(gestao).not.toContain('Usuários');
  });

  it.each(['manager', 'viewer'])('%s não vê Auditoria nem Usuários', (role) => {
    const gestao = labels(visibleTabs(role, {}), 'gestao');
    expect(gestao).not.toContain('Auditoria');
    expect(gestao).not.toContain('Usuários');
    expect(gestao).toContain('Clientes');
  });

  it('FEATURE_AI_ANALYSIS=0 oculta Inteligência e FEATURE_REPORTS=0 oculta Relatórios', () => {
    const gestao = labels(visibleTabs('admin', { FEATURE_AI_ANALYSIS: '0', FEATURE_REPORTS: '0' }), 'gestao');
    expect(gestao).not.toContain('Inteligência');
    expect(gestao).not.toContain('Relatórios');
  });

  it('flag ausente ou diferente de 0 mantém o item', () => {
    const gestao = labels(visibleTabs('admin', { FEATURE_AI_ANALYSIS: '1' }), 'gestao');
    expect(gestao).toContain('Inteligência');
    expect(gestao).toContain('Relatórios');
  });
});

describe('nav: aba ativa e rótulo da tela', () => {
  it.each([
    ['/', 'lotes'],
    ['/lotes/novo', 'lotes'],
    ['/lotes/abc-123', 'lotes'],
    ['/criativos', 'criativos'],
    ['/performance', 'performance'],
    ['/contas', 'contas'],
    ['/whatsapp', 'contas'],
    ['/saude', 'contas'],
    ['/inteligencia', 'gestao'],
    ['/relatorios', 'gestao'],
    ['/clientes', 'gestao'],
    ['/auditoria', 'gestao'],
    ['/usuarios', 'gestao'],
  ])('%s fica na aba %s', (pathname, id) => {
    expect(activeTabId(pathname)).toBe(id);
  });

  it('rota desconhecida não marca aba', () => {
    expect(activeTabId('/nao-existe')).toBeUndefined();
  });

  it.each([
    ['/', 'Lotes'],
    ['/lotes/novo', 'Novo lote'],
    ['/lotes/abc-123', 'Lote'],
    ['/saude', 'Saúde das contas'],
    ['/usuarios', 'Usuários'],
  ])('o rótulo da tela %s é %s', (pathname, label) => {
    expect(screenLabel(pathname)).toBe(label);
  });
});

describe('nav: página Mais no mobile (RDS-06)', () => {
  const nomes = (role: string, env: Record<string, string> = {}) =>
    mobileGroups(role, env).map((grupo) => [grupo.title, grupo.items.map((item) => item.label)]);

  it('o admin vê os 3 grupos do Figma com os 8 destinos', () => {
    expect(nomes('admin')).toEqual([
      ['Analisar', ['Inteligência', 'Relatórios']],
      ['Contas e canais', ['Conexões Meta', 'WhatsApp']],
      ['Gerenciar', ['Clientes', 'Saúde das contas', 'Auditoria', 'Usuários']],
    ]);
  });

  it('cada destino traz a descrição curta do Figma', () => {
    const itens = mobileGroups('admin', {}).flatMap((grupo) => grupo.items);
    expect(itens.find((item) => item.href === '/saude')?.description).toBe('fila, erros e limite diário');
    expect(itens.find((item) => item.href === '/whatsapp')?.description).toBe('números e modelos');
  });

  it('o viewer não vê Auditoria nem Usuários, como no desktop', () => {
    const gerenciar = mobileGroups('viewer', {}).find((grupo) => grupo.title === 'Gerenciar');
    expect(gerenciar?.items.map((item) => item.label)).toEqual(['Clientes', 'Saúde das contas']);
  });

  it('flag desligada tira o destino e, sem destinos, o grupo some', () => {
    const grupos = mobileGroups('admin', { FEATURE_AI_ANALYSIS: '0', FEATURE_REPORTS: '0' });
    expect(grupos.map((grupo) => grupo.title)).toEqual(['Contas e canais', 'Gerenciar']);
  });

  it('a página Mais marca a aba Mais no mobile', () => {
    expect(activeTabId('/mais')).toBe('mais');
    expect(activeTabId('/clientes')).toBe('gestao');
  });
});
