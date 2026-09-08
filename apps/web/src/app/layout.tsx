import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { currentSession } from '@/lib/session';

export const metadata: Metadata = {
  title: 'AdPub',
  description: 'Publicação de anúncios Meta em lote',
};

const NAV = [
  { href: '/', label: 'Lotes' },
  { href: '/criativos', label: 'Criativos' },
  { href: '/contas', label: 'Contas' },
  { href: '/clientes', label: 'Clientes' },
  { href: '/saude', label: 'Saúde' },
  { href: '/auditoria', label: 'Auditoria' },
  { href: '/usuarios', label: 'Usuários' },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentSession();

  return (
    <html lang="pt-BR">
      <body className="min-h-screen">
        {user ? (
          <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3">
              <Link href="/" className="text-sm font-semibold">
                AdPub
              </Link>
              <nav className="flex flex-1 gap-4 text-sm text-[var(--color-muted)]">
                {NAV.map((item) => (
                  <Link key={item.href} href={item.href} className="hover:text-[var(--color-text)]">
                    {item.label}
                  </Link>
                ))}
              </nav>
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
