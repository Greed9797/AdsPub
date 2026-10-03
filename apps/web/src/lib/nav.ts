export type TabId = 'lotes' | 'criativos' | 'performance' | 'contas' | 'gestao';

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

type RawLink = NavLink & Rule;

const MENUS: Record<'contas' | 'gestao', RawLink[]> = {
  contas: [
    { href: '/contas', label: 'Conexões Meta' },
    { href: '/whatsapp', label: 'WhatsApp' },
    { href: '/saude', label: 'Saúde das contas' },
  ],
  gestao: [
    { href: '/inteligencia', label: 'Inteligência', flag: 'FEATURE_AI_ANALYSIS' },
    { href: '/relatorios', label: 'Relatórios', flag: 'FEATURE_REPORTS' },
    { href: '/clientes', label: 'Clientes' },
    { href: '/auditoria', label: 'Auditoria', roles: ['admin', 'coordinator'] },
    { href: '/usuarios', label: 'Usuários', roles: ['admin'] },
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
