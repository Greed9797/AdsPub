import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { cookies } from 'next/headers';
import '@fontsource-variable/nunito';
import './globals.css';
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/components.css';
import '../styles/shell.css';
import '../styles/lotes.css';
import '../styles/ficha.css';
import '../styles/publish.css';
import '../styles/novo-lote.css';
import '../styles/acesso.css';
import { currentSession } from '@/lib/session';
import { BottomNav } from '@/components/shell/bottom-nav';
import { Footer } from '@/components/shell/footer';
import { TopBar } from '@/components/shell/top-bar';
import { api } from '@/lib/api';
import { visibleTabs } from '@/lib/nav';
import { carregarRotulo } from '@/lib/sync-label';
import type { AdAccount } from '@/lib/types';
import type { SessionUser } from '@adpub/shared';
import { Providers } from '@/components/providers';

export const metadata: Metadata = {
  title: 'AdPub',
  description: 'Publicação de anúncios Meta em lote',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let user: SessionUser | undefined;
  try {
    user = await currentSession();
  } catch {
    // API fora: mostra layout sem sessão (erro recuperável na página).
  }
  const savedMode = (await cookies()).get('adpub_theme')?.value;
  const mode = savedMode === 'light' || savedMode === 'dark' ? savedMode : 'system';
  const tabs = user ? visibleTabs(user.role, process.env) : [];
  const syncLabel = user ? await carregarRotulo(() => api<AdAccount[]>('/ad-accounts')) : undefined;

  return (
    <html lang="pt-BR" className={`${GeistSans.variable} ${GeistMono.variable}`} data-theme={mode}>
      <body>
        <a className="ap-skip" href="#conteudo">
          Ir para o conteúdo
        </a>
        <Providers initialMode={mode}>
          {user ? (
            <div className="ap-app">
              <TopBar tabs={tabs} user={{ name: user.name, email: user.email, role: user.role }} syncLabel={syncLabel} />
              <main className="ap-main" id="conteudo">
                {children}
              </main>
              <Footer />
              <BottomNav />
            </div>
          ) : (
            <main className="ap-auth-layout" id="conteudo">
              {children}
            </main>
          )}
        </Providers>
      </body>
    </html>
  );
}
