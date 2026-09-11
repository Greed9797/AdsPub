'use client';

import Link from 'next/link';

import { buttonClass, PageHead, secondaryButtonClass } from '@/components/ui';

/** Falha de rota (ex.: API fora): explica, tenta de novo, oferece saída. */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="space-y-6">
      <PageHead
        title="Algo falhou ao carregar"
        description="Confira se a API está no ar e tente de novo."
        action={
          <div className="flex gap-2">
            <button type="button" onClick={reset} className={buttonClass}>
              Tentar de novo
            </button>
            <Link href="/" className={secondaryButtonClass}>
              Voltar para Lotes
            </Link>
          </div>
        }
      />
      {error.digest ? (
        <p className="text-xs tabular-nums text-[var(--color-muted)]">ref {error.digest}</p>
      ) : null}
    </main>
  );
}
