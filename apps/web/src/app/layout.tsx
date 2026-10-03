import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { cookies } from 'next/headers';
import '@fontsource-variable/nunito';
import './globals.css';
import '../styles/tokens.css';
import '../styles/base.css';
import { currentSession } from '@/lib/session';
import { AppSideNav, AppTopNav, type NavGroup, type NavItem } from '@/components/app-nav';
import type { SessionUser } from '@adpub/shared';
import { Providers } from '@/components/providers';
import { AppShell } from '@astryxdesign/core/AppShell';

export const metadata: Metadata = {
  title: 'AdPub',
  description: 'Publicação de anúncios Meta em lote',
};

const NAV_GROUPS: Array<{ title: string; items: Array<NavItem & { roles?: string[] }> }> = [
  {
    title: 'Publicação',
    items: [
      { href: '/', label: 'Anúncios' },
      { href: '/criativos', label: 'Biblioteca de mídia' },
      { href: '/contas', label: 'Conexões Meta' },
      { href: '/whatsapp', label: 'WhatsApp' },
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
      { href: '/saude', label: 'Saúde das contas' },
      { href: '/auditoria', label: 'Auditoria', roles: ['admin', 'coordinator'] },
      { href: '/usuarios', label: 'Usuários', roles: ['admin'] },
    ],
  },
];

/** T-009-3: funcionalidade desligada some da navegação (API dá 503). Ocultar não substitui 403 da API. */
function visibleNav(role?: string): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    title: group.title,
    items: group.items
      .filter((item) => !item.flag || process.env[item.flag] !== '0')
      .filter((item) => !item.roles || (role ? item.roles.includes(role) : true))
      .map((item) => ({ href: item.href, label: item.label })),
  }));
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let user: SessionUser | undefined;
  try {
    user = await currentSession();
  } catch {
    // API fora: mostra layout sem sessão (erro recuperável na página).
  }
  const savedMode = (await cookies()).get('adpub_theme')?.value;
  const mode = savedMode === 'light' || savedMode === 'dark' ? savedMode : 'system';
  const groups = visibleNav(user?.role);

  return (
    <html lang="pt-BR" className={`${GeistSans.variable} ${GeistMono.variable}`} data-theme={mode}>
      <body>
        <a className="skip-link" href="#conteudo">
          Ir para o conteúdo
        </a>
        <Providers initialMode={mode}>
          {user ? (
            <AppShell
              height="auto"
              variant="section"
              contentPadding={0}
              sideNav={<AppSideNav groups={groups} />}
              topNav={<AppTopNav email={user.email} role={user.role} groups={groups} />}
            >
              <div className="app-content" id="conteudo">
                {children}
              </div>
            </AppShell>
          ) : (
            <main className="auth-layout" id="conteudo">
              {children}
            </main>
          )}
        </Providers>
      </body>
    </html>
  );
}
