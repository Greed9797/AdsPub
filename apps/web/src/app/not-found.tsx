import { ButtonLink } from '@/components/button-link';
import { PageHead } from '@/components/ui';

/** Rota inexistente: volta para o app em vez de beco sem saída. */
export default function NotFound() {
  return (
    <main className="space-y-6">
      <PageHead
        title="Página não encontrada"
        description="O endereço não existe ou foi movido."
        action={
          <ButtonLink variant="primary" label="Voltar para Lotes" href="/" />
        }
      />
    </main>
  );
}
