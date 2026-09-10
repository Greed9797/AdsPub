import type { Metadata } from 'next';
import { Bricolage_Grotesque } from 'next/font/google';
import Link from 'next/link';
import './globals.css';
import { currentSession } from '@/lib/session';
import { ThemeToggle } from '@/components/theme-toggle';

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

const NAV = [
  { href: '/', label: 'Lotes' },
  { href: '/criativos', label: 'Criativos' },
  { href: '/relatorios', label: 'Relatórios', flag: 'FEATURE_REPORTS' },
  { href: '/performance', label: 'Performance' },
  { href: '/inteligencia', label: 'Inteligência', flag: 'FEATURE_AI_ANALYSIS' },
  { href: '/contas', label: 'Contas' },
  { href: '/clientes', label: 'Clientes' },
  { href: '/saude', label: 'Saúde' },
  { href: '/auditoria', label: 'Auditoria' },
  { href: '/usuarios', label: 'Usuários' },
] as const;

/** T-009-3: funcionalidade desligada some da navegação (API dá 503). */
function visibleNav(): Array<{ href: string; label: string }> {
  return NAV.filter((item) => !('flag' in item) || process.env[item.flag] !== '0');
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentSession();

  return (
    <html lang="pt-BR" className={display.variable} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{document.documentElement.dataset.theme=localStorage.getItem('adpub-theme')||'dark'}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-screen">
        {user ? (
          <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3">
              <Link href="/" className="text-sm font-semibold tracking-[-0.02em]">
                AdPub<span className="text-[var(--color-brand)]">.</span>
              </Link>
              <nav className="flex flex-1 gap-4 text-sm font-medium uppercase tracking-[0.08em] text-[var(--color-muted)]">
                {visibleNav().map((item) => (
                  <Link key={item.href} href={item.href} className="hover:text-[var(--color-text)]">
                    {item.label}
                  </Link>
                ))}
              </nav>
              <ThemeToggle />
              <span className="text-xs text-[var(--color-muted)]">
                {user.email} · {user.role}
              </span>
              <form action="/api/auth/logout" method="post">
                <button type="submit" className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]">
                  Sair
                </button>
              </form>
            </div>
          </header>
        ) : null}
        <div className="mx-auto max-w-7xl p-6">{children}</div>
      </body>
    </html>
  );
}
