'use client';

import { Button, Callout, PageHead } from '@/components/ui';

/** Falha de rota (ex.: API fora ou recusando): diz o que houve, dá o código e tenta de novo. */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="ap-estado" role="alert">
      <PageHead
        title="Algo falhou ao carregar"
        description="Não foi possível carregar os dados desta página. Tente de novo; se continuar, confira sua sessão e a conexão com o serviço."
        action={
          <>
            <Button variant="primary" label="Tentar de novo" onClick={reset} />
            <Button variant="secondary" label="Voltar aos lotes" href="/" />
          </>
        }
      />
      <Callout tone="danger" title="O que aconteceu">
        <p className="ap-estado__p">Código da requisição: {error.digest ? <span className="ap-t-ref">{error.digest}</span> : 'não informado'}</p>
        <p className="ap-estado__p">Informe esse código a quem mantém o AdPub se o problema voltar.</p>
      </Callout>
    </div>
  );
}
