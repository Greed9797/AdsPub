import type { Metadata } from 'next';
import { Bricolage_Grotesque, Geist, Geist_Mono, Instrument_Serif, Oswald } from 'next/font/google';
import './globals.css';
import { currentSession } from '@/lib/session';
import { AppSideNav, AppTopNav, type NavGroup, type NavItem } from '@/components/app-nav';
import { Providers } from '@/components/providers';
import { AppShell } from '@astryxdesign/core/AppShell';

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

/** ID Pulmão W3: Geist corpo/display, Geist Mono técnico, Instrument Serif editorial. */
const geist = Geist({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-geist',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-geist-mono',
});

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: ['400'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-instrument-serif',
});

const NAV_GROUPS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: 'Operar',
    items: [
      { href: '/', label: 'Anúncios' },
      { href: '/criativos', label: 'Fotos e vídeos' },
      { href: '/contas', label: 'Conexões' },
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
      { href: '/saude', label: 'Contas' },
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
    <html
      lang="pt-BR"
      className={`${display.variable} ${condensed.variable} ${geist.variable} ${geistMono.variable} ${instrumentSerif.variable}`}
    >
      <body className="min-h-screen">
        <Providers>
        <div className="ambient-backdrop" aria-hidden="true">
          <div className="ambient-orb ambient-orb-1" />
          <div className="ambient-orb ambient-orb-2" />
          <div className="ambient-orb ambient-orb-3" />
          <div className="ambient-orb ambient-orb-4" />
        </div>
        <div className="noise-overlay" aria-hidden="true" />
        <div className="relative z-[2]">
        {user ? (
          <AppShell
            height="auto"
            contentPadding={0}
            sideNav={<AppSideNav groups={visibleNav()} />}
            topNav={<AppTopNav email={user.email} role={user.role} />}
          >
            <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">{children}</div>
          </AppShell>
        ) : (
          <div className="mx-auto max-w-6xl p-6">{children}</div>
        )}
        </div>
        </Providers>
      </body>
    </html>
  );
}
