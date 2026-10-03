import { Button, PageHead } from '@/components/ui';

/** Rota inexistente: volta para o app em vez de beco sem saída. */
export default function NotFound() {
  return (
    <div className="ap-estado">
      <PageHead
        title="Página não encontrada"
        description="O endereço não existe ou foi movido. Volte para a lista de lotes ou use o menu."
        action={<Button variant="primary" label="Voltar aos lotes" href="/" />}
      />
    </div>
  );
}
