/** Esqueleto de lista: cabeçalho e linhas cinzas no lugar da página enquanto a rota carrega. */
export function LoadingSkeleton({ linhas = 6 }: { linhas?: number }) {
  return (
    <div className="ap-skel" role="status" aria-busy="true" aria-live="polite">
      <span className="ap-skel__sr">Carregando…</span>
      <div className="ap-skel__titulo" aria-hidden="true" />
      <div className="ap-skel__texto" aria-hidden="true" />
      <div className="ap-skel__lista" aria-hidden="true">
        {Array.from({ length: linhas }, (_, i) => (
          <div key={i} className="ap-skel__linha" />
        ))}
      </div>
    </div>
  );
}
