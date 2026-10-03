export type TabId = 'lotes' | 'criativos' | 'performance' | 'contas' | 'gestao' | 'mais';

export interface NavLink {
  href: string;
  label: string;
}

export interface NavTab {
  id: TabId;
  label: string;
  /** Aba de link direto. */
  href?: string;
  /** Aba de menu. */
  items?: NavLink[];
}

interface Rule {
  /** Papéis que enxergam o item. Sem a lista, todos enxergam. */
  roles?: readonly string[];
  /** Env que desliga o item quando vale '0'. Só lida no servidor. */
  flag?: string;
}

type RawLink = NavLink & Rule & { description?: string };

const MENUS: Record<'contas' | 'gestao', RawLink[]> = {
  contas: [
    { href: '/contas', label: 'Conexões Meta', description: 'BM, contas e padrões' },
    { href: '/whatsapp', label: 'WhatsApp', description: 'números e modelos' },
    { href: '/saude', label: 'Saúde das contas', description: 'fila, erros e limite diário' },
  ],
  gestao: [
    { href: '/inteligencia', label: 'Inteligência', description: 'hipóteses para os próximos anúncios', flag: 'FEATURE_AI_ANALYSIS' },
    { href: '/relatorios', label: 'Relatórios', description: 'importar CSV ou Excel', flag: 'FEATURE_REPORTS' },
    { href: '/clientes', label: 'Clientes', description: 'contas e regras de cada cliente' },
    { href: '/auditoria', label: 'Auditoria', description: 'quem fez o quê', roles: ['admin', 'coordinator'] },
    { href: '/usuarios', label: 'Usuários', description: 'papéis e contas', roles: ['admin'] },
  ],
};

const DIRECT: ReadonlyArray<{ id: TabId; label: string; href: string }> = [
  { id: 'lotes', label: 'Lotes', href: '/' },
  { id: 'criativos', label: 'Criativos', href: '/criativos' },
  { id: 'performance', label: 'Performance', href: '/performance' },
];

const ROLE_LABEL: Readonly<Record<string, string>> = {
  admin: 'Administrador',
  coordinator: 'Coordenador',
  manager: 'Gestor',
  viewer: 'Leitor',
};

export function roleLabel(role: string): string {
  return ROLE_LABEL[role] ?? role;
}

function permitted(link: RawLink, role: string | undefined, env: Readonly<Record<string, string | undefined>>): boolean {
  if (link.flag && env[link.flag] === '0') return false;
  if (link.roles && role) return link.roles.includes(role);
  return true;
}

function menu(id: 'contas' | 'gestao', label: string, role: string | undefined, env: Readonly<Record<string, string | undefined>>): NavTab {
  const items = MENUS[id].filter((link) => permitted(link, role, env)).map(({ href, label: text }) => ({ href, label: text }));
  return { id, label, items };
}

/** As 5 abas do Figma. A aba de menu sem nenhum item visível some. */
export function visibleTabs(role: string | undefined, env: Readonly<Record<string, string | undefined>>): NavTab[] {
  const direct: NavTab[] = DIRECT.slice(0, 3).map(({ id, label, href }) => ({ id, label, href }));
  const menus = [menu('contas', 'Contas', role, env), menu('gestao', 'Gestão', role, env)].filter(
    (tab) => (tab.items?.length ?? 0) > 0,
  );
  return [...direct, ...menus];
}

export function activeTabId(pathname: string): TabId | undefined {
  if (pathname === '/' || pathname.startsWith('/lotes')) return 'lotes';
  if (pathname === '/mais') return 'mais';
  const direct = DIRECT.find((tab) => tab.href !== '/' && pathname === tab.href);
  if (direct) return direct.id;
  for (const id of ['contas', 'gestao'] as const) {
    if (MENUS[id].some((link) => link.href === pathname)) return id;
  }
  return undefined;
}

/** Nome da tela para o rodapé. */
export function screenLabel(pathname: string): string {
  if (pathname === '/') return 'Lotes';
  if (pathname === '/lotes/novo') return 'Novo lote';
  if (pathname.startsWith('/lotes/')) return 'Lote';
  if (pathname === '/mais') return 'Mais';
  const direct = DIRECT.find((tab) => tab.href === pathname);
  if (direct) return direct.label;
  const link = [...MENUS.contas, ...MENUS.gestao].find((item) => item.href === pathname);
  return link?.label ?? 'AdPub';
}

export interface MobileLink extends NavLink {
  description: string;
}

export interface MobileGroup {
  title: string;
  items: MobileLink[];
}

/** Agrupamento da página "Mais" (Figma M6). Mesma regra de papel e flag das abas do desktop. */
const MOBILE_GROUPS: ReadonlyArray<{ title: string; hrefs: readonly string[] }> = [
  { title: 'Analisar', hrefs: ['/inteligencia', '/relatorios'] },
  { title: 'Contas e canais', hrefs: ['/contas', '/whatsapp'] },
  { title: 'Gerenciar', hrefs: ['/clientes', '/saude', '/auditoria', '/usuarios'] },
];

export function mobileGroups(role: string | undefined, env: Readonly<Record<string, string | undefined>>): MobileGroup[] {
  const todos = [...MENUS.contas, ...MENUS.gestao];
  return MOBILE_GROUPS.map(({ title, hrefs }) => ({
    title,
    items: hrefs
      .map((href) => todos.find((link) => link.href === href))
      .filter((link): link is RawLink => link !== undefined && permitted(link, role, env))
      .map((link) => ({ href: link.href, label: link.label, description: link.description ?? '' })),
  })).filter((grupo) => grupo.items.length > 0);
}
