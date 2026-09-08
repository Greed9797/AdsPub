import Link from 'next/link';
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
  searchParams: Promise<{ erro?: string }>;
}) {
  if (await currentSession()) redirect('/');
  const { erro } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8">
        <h1 className="text-xl font-semibold">AdPub</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Publicação de anúncios Meta em lote.
        </p>
        {erro ? (
          <p className="mt-4 rounded-lg border border-[var(--color-danger)] bg-[var(--color-danger)]/10 p-3 text-sm">
            {MESSAGES[erro] ?? MESSAGES.falha}
          </p>
        ) : null}
        <Link
          href="/api/auth/login"
          className="mt-6 block rounded-lg bg-[var(--color-brand)] px-4 py-2 text-center text-sm font-medium text-white"
        >
          Entrar com Google
        </Link>
      </div>
    </main>
  );
}
