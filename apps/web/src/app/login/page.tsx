import { Icon } from '@/components/icons';
import { safeNextPath } from '@adpub/auth';
import { currentSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import { bootstrapDisponivel } from './actions';
import { BootstrapForm } from './bootstrap-form';
import { LoginForm } from './login-form';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; next?: string }>;
}) {
  if (await currentSession()) redirect('/');
  const { erro, next } = await searchParams;
  // Só caminho interno volta depois do login (evita redirecionamento aberto).
  const safeNext = safeNextPath(next);
  const bootstrap = await bootstrapDisponivel();

  return (
    <section className="auth-card">
      <div className="brand-lockup mb-6">
        <span className="brand-mark">
          <Icon name="layers" size={20} />
        </span>
        <span className="brand-name">AdPub</span>
      </div>
      {bootstrap ? (
        <>
          <h1 className="page-title">Primeiro acesso</h1>
          <p className="mt-3 mb-6 text-sm text-[var(--color-muted)]">
            Nenhum usuário com senha ainda. Crie o administrador inicial para começar — esta
            tela desaparece para sempre depois.
          </p>
          {erro ? (
            <p role="alert" className="notice notice-error mb-4">
              Não foi possível concluir o login.
            </p>
          ) : null}
          <BootstrapForm />
        </>
      ) : (
        <>
          <h1 className="page-title">Seu espaço de anúncios</h1>
          <p className="mt-3 mb-6 text-sm text-[var(--color-muted)]">
            Crie, revise e publique anúncios Meta em lote. Entre com seu e-mail corporativo
            para continuar.
          </p>
          {erro ? (
            <p role="alert" className="notice notice-error mb-4">
              Não foi possível concluir o login.
            </p>
          ) : null}
          <LoginForm next={safeNext} />
        </>
      )}
      <p className="mt-6 text-xs text-[var(--color-muted)]">Acesso restrito à equipe autorizada.</p>
    </section>
  );
}
