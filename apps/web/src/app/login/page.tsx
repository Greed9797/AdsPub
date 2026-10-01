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
  const safeNext = safeNextPath(next);
  const bootstrap = await bootstrapDisponivel();

  return (
    <>
      <aside className="auth-stage">
        <div className="brand-lockup">
          <span className="brand-mark">
            <Icon name="layers" size={18} />
          </span>
          <span className="brand-name">AdPub</span>
        </div>
        <div>
          <p className="auth-stage-title">
            {bootstrap ? 'Primeiro acesso da equipe' : 'Publique anúncios Meta em lote'}
          </p>
          <p>
            {bootstrap
              ? 'Crie o administrador inicial. Esta tela some depois que a senha existir.'
              : 'Revise criativos, conferência e verba antes de gastar. Entre com o e-mail da empresa.'}
          </p>
        </div>
        <p className="auth-stage-foot">Acesso restrito à equipe autorizada.</p>
      </aside>
      <section className="auth-panel">
        <div className="auth-card">
          {bootstrap ? (
            <>
              <h2 className="page-title">Criar administrador</h2>
              <p className="page-description mb-6">Nome, e-mail corporativo e senha com no mínimo 12 caracteres.</p>
              {erro ? (
                <p role="alert" className="notice notice-error mb-4">
                  Não foi possível concluir o login. Confira os dados e tente de novo.
                </p>
              ) : null}
              <BootstrapForm />
            </>
          ) : (
            <>
              <h1 className="page-title">Entrar</h1>
              <p className="page-description mb-6">Use o e-mail corporativo e a senha da sua conta AdPub.</p>
              {erro ? (
                <p role="alert" className="notice notice-error mb-4">
                  Não foi possível concluir o login. Confira e-mail, senha e tente de novo.
                </p>
              ) : null}
              <LoginForm next={safeNext} />
            </>
          )}
        </div>
      </section>
    </>
  );
}
