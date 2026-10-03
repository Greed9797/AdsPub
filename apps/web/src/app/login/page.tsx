import Link from 'next/link';
import { redirect } from 'next/navigation';
import { safeNextPath } from '@adpub/auth';

import { Icon } from '@/components/icons';
import { abaAtiva, abasDoAcesso } from '@/lib/acesso';
import { currentSession } from '@/lib/session';
import { bootstrapDisponivel } from './actions';
import { BootstrapForm } from './bootstrap-form';
import { LoginForm } from './login-form';

const PASSOS = ['Monte o lote com a ajuda da IA', 'Revise e valide cada anúncio', 'Confirme: nasce tudo pausado'];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; next?: string; aba?: string }>;
}) {
  if (await currentSession()) redirect('/');
  const { erro, next, aba } = await searchParams;
  const safeNext = safeNextPath(next);
  const bootstrap = await bootstrapDisponivel();
  const ativa = abaAtiva(bootstrap, aba);
  const abas = abasDoAcesso(bootstrap);
  const hrefDaAba = (id: string) => {
    const query = new URLSearchParams({ aba: id });
    if (safeNext) query.set('next', safeNext);
    return `/login?${query}`;
  };

  return (
    <div className="ap-auth">
      <header className="ap-auth__brand">
        <span className="ap-auth__mark" aria-hidden="true">
          <Icon name="layers" size={18} />
        </span>
        <span>
          <span className="ap-t-body-strong ap-auth__name">AdPub</span>
          <span className="ap-t-ref ap-auth__tag">Publicação em lote</span>
        </span>
      </header>

      <section className="ap-auth__hero" aria-label="Sobre o AdPub">
        <p className="ap-t-display ap-auth__title">Publique em lote.</p>
        <p className="ap-t-display ap-auth__title ap-auth__title--soft">Revise antes de gastar.</p>
        <p className="ap-t-body-l ap-auth__lead">
          Cada anúncio passa por validação, e tudo nasce pausado na Meta. Quem ativa a verba é uma pessoa.
        </p>
      </section>

      <section className="ap-auth__card" aria-label="Acesso">
        <nav className="ap-auth__tabs" aria-label="Tipo de acesso">
          {abas.map((item) => (
            <Link
              key={item.id}
              href={hrefDaAba(item.id)}
              aria-current={item.id === ativa ? 'page' : undefined}
              className="ap-auth__tab ap-t-body"
            >
              {item.rotulo}
            </Link>
          ))}
        </nav>
        {ativa === 'primeiro' ? (
          <>
            <h1 className="ap-t-block ap-auth__h">Criar administrador</h1>
            <p className="ap-t-small ap-auth__desc">
              Nome, e-mail corporativo e senha com no mínimo 12 caracteres. Esta aba some depois que a senha existir.
            </p>
            {erro ? (
              <p role="alert" className="ap-note" data-tone="danger">
                Não foi possível concluir o login. Confira os dados e tente de novo.
              </p>
            ) : null}
            <BootstrapForm />
          </>
        ) : (
          <>
            <h1 className="ap-t-block ap-auth__h">Entrar no AdPub</h1>
            <p className="ap-t-small ap-auth__desc">Use o e-mail corporativo e a senha que o admin passou para você.</p>
            {erro ? (
              <p role="alert" className="ap-note" data-tone="danger">
                Não foi possível concluir o login. Confira e-mail, senha e tente de novo.
              </p>
            ) : null}
            <LoginForm next={safeNext} />
            <p className="ap-t-small ap-auth__foot">
              <Icon name="shield" size={14} /> Muitas tentativas erradas seguidas bloqueiam o acesso por até 10 minutos.
              Esqueceu a senha? Peça a um admin para redefinir.
            </p>
          </>
        )}
      </section>

      <ol className="ap-auth__steps ap-t-small">
        {PASSOS.map((passo, i) => (
          <li key={passo}>
            <span className="ap-t-num-s ap-auth__n">{i + 1}</span> {passo}
          </li>
        ))}
      </ol>
    </div>
  );
}
