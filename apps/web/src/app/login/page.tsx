import Link from 'next/link';
import { safeNextPath } from '@adpub/auth';
import { currentSession } from '@/lib/session';
import { redirect } from 'next/navigation';

const MESSAGES: Record<string, string> = {
  dominio: 'Esse e-mail não é do domínio corporativo.',
  inativo: 'Seu usuário está inativo. Fale com um admin.',
  state: 'Sessão de login expirada. Tente de novo.',
  falha: 'Não foi possível concluir o login.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; next?: string }>;
}) {
  if (await currentSession()) redirect('/');
  const { erro, next } = await searchParams;
  // Só caminho interno volta depois do login (evita redirecionamento aberto).
  const safeNext = safeNextPath(next);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] p-8">
        <h1 className="font-cond text-3xl font-semibold tracking-[0.02em]">
          AdPub<span className="text-[var(--color-brand)]">.</span>
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Publicação de anúncios Meta em lote.
        </p>
        {erro ? (
          <p className="mt-4 rounded-lg border border-[var(--color-danger)] bg-[var(--color-danger)]/10 p-3 text-sm">
            {MESSAGES[erro] ?? MESSAGES.falha}
          </p>
        ) : null}
        <Link
          href={safeNext ? `/api/auth/login?next=${encodeURIComponent(safeNext)}` : '/api/auth/login'}
          className="mt-6 flex h-10 items-center justify-center rounded-[10px] bg-[var(--color-brand-solid)] px-4 text-sm font-semibold text-[var(--color-ink-on-brand)] hover:bg-[var(--color-brand-deep)] hover:text-white"
        >
          Entrar com Google
        </Link>
      </div>
    </main>
  );
}
