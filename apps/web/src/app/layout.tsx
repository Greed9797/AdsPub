import type { Metadata } from 'next';
import { Bricolage_Grotesque, Oswald } from 'next/font/google';
import Link from 'next/link';
import './globals.css';
import { currentSession } from '@/lib/session';
import { AppNav, type NavGroup, type NavItem } from '@/components/app-nav';

export const metadata: Metadata = {
  title: 'AdPub',
  description: 'Publicação de anúncios Meta em lote',
};

/** Similar pública da Aloevera Display (licenciada): geométrica expressiva. */
const display = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-display',
});

/** Condensada estilo refs (AXIS/BAS): títulos, KPIs e números grandes. */
const condensed = Oswald({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  display: 'swap',
  variable: '--font-condensed',
});

const NAV_GROUPS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: 'Operar',
    items: [
      { href: '/', label: 'Lotes' },
      { href: '/criativos', label: 'Criativos' },
      { href: '/contas', label: 'Contas' },
    ],
  },
  {
    title: 'Analisar',
    items: [
      { href: '/performance', label: 'Performance' },
      { href: '/inteligencia', label: 'Inteligência', flag: 'FEATURE_AI_ANALYSIS' },
      { href: '/relatorios', label: 'Relatórios', flag: 'FEATURE_REPORTS' },
    ],
  },
  {
    title: 'Gerenciar',
    items: [
      { href: '/clientes', label: 'Clientes' },
      { href: '/saude', label: 'Saúde' },
      { href: '/auditoria', label: 'Auditoria' },
      { href: '/usuarios', label: 'Usuários' },
    ],
  },
];

/** T-009-3: funcionalidade desligada some da navegação (API dá 503). */
function visibleNav(): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    title: group.title,
    items: group.items
      .filter((item) => !item.flag || process.env[item.flag] !== '0')
      .map((item) => ({ href: item.href, label: item.label })),
  }));
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentSession();

  return (
    <html lang="pt-BR" className={`${display.variable} ${condensed.variable}`}>
      <body className="min-h-screen">
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-[10px] focus:bg-[var(--color-brand-solid)] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-[var(--color-ink-on-brand)]"
        >
          Pular para o conteúdo
        </a>
        {user ? (
          <div className="min-h-screen lg:flex">
            <aside className="hidden w-64 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)] lg:block">
              <div className="no-scrollbar sticky top-0 flex max-h-screen flex-col gap-8 overflow-y-auto p-5">
                <Link href="/" className="font-cond px-2 pt-1 text-2xl font-semibold tracking-[0.02em]">
                  AdPub<span className="text-[var(--color-brand)]">.</span>
                </Link>
                <AppNav groups={visibleNav()} variant="sidebar" />
              </div>
            </aside>
            <div className="flex min-w-0 flex-1 flex-col">
              <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
                  <Link href="/" className="font-cond text-xl font-semibold tracking-[0.02em] lg:hidden">
                    AdPub<span className="text-[var(--color-brand)]">.</span>
                  </Link>
                  <div className="flex-1" />
                  <span className="hidden max-w-48 truncate text-xs text-[var(--color-muted)] sm:block">
                    {user.email}
                  </span>
                  <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--color-muted)]">
                    {user.role}
                  </span>
                  <form action="/api/auth/logout" method="post">
                    <button
                      type="submit"
                      className="rounded-[8px] px-2 py-1.5 text-xs font-medium text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
                    >
                      Sair
                    </button>
                  </form>
                </div>
                <AppNav groups={visibleNav()} variant="strip" />
              </header>
              <main id="conteudo" className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6">{children}</main>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-6xl p-6">{children}</div>
        )}
      </body>
    </html>
  );
}
