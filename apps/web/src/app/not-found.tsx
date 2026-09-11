import Link from 'next/link';

import { buttonClass, PageHead } from '@/components/ui';

/** Rota inexistente: volta para o app em vez de beco sem saída. */
export default function NotFound() {
  return (
    <main className="space-y-6">
      <PageHead
        title="Página não encontrada"
        description="O endereço não existe ou foi movido."
        action={
          <Link href="/" className={buttonClass}>
            Voltar para Lotes
          </Link>
        }
      />
    </main>
  );
}
