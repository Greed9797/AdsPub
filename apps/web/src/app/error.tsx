'use client';

import Link from 'next/link';

import { PageHead } from '@/components/ui';
import { Button } from '@astryxdesign/core/Button';

/** Falha de rota (ex.: API fora): explica, tenta de novo, oferece saída. */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="space-y-6">
      <PageHead
        title="Algo falhou ao carregar"
        description="Confira se a API está no ar e tente de novo."
        action={
          <div className="flex gap-2">
            <Button variant="primary" label="Tentar de novo" onClick={reset} />
            <Button variant="secondary" label="Voltar para Lotes" href="/" as={Link} />
          </div>
        }
      />
      {error.digest ? (
        <p className="text-xs tabular-nums text-[var(--color-muted)]">ref {error.digest}</p>
      ) : null}
    </div>
  );
}
