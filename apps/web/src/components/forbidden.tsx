import { Button, Callout, PageHead } from '@/components/ui';

/** Papel sem acesso à rota: diz qual é o papel, por que não abre e para onde voltar. */
export function Forbidden({ papel }: { papel?: string }) {
  return (
    <div className="ap-estado">
      <PageHead
        title="Você não tem acesso a esta página"
        description="Esta área é restrita a quem tem outro papel na equipe. Nada foi alterado."
        action={<Button variant="primary" label="Voltar aos lotes" href="/" />}
      />
      <Callout tone="warn" title="Por que está bloqueado">
        {papel
          ? `Seu papel hoje é ${papel}. Páginas de edição e de administração pedem papel de gestor, coordenador ou administrador.`
          : 'Seu papel não permite abrir esta página.'}{' '}
        Se você precisa dela, peça a um administrador para ajustar o seu papel em Usuários.
      </Callout>
    </div>
  );
}
