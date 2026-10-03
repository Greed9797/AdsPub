import { ROTULO_GRUPO, barraDoLote } from '@/lib/lotes-view';
import type { Batch } from '@/lib/types';

/** Uma faixa por grupo presente; largura = 18 px × anúncios. Lote sem anúncio não desenha nada. */
export function PipelineBar({ batch }: { batch: Batch }) {
  const barra = barraDoLote(batch);
  if (barra.total === 0) return <span className="ap-t-small ap-pipeline__none">Sem anúncios</span>;

  const descricao = barra.segmentos.map((s) => `${s.n} ${ROTULO_GRUPO[s.grupo]}`).join(', ');
  return (
    <span
      className="ap-pipeline"
      role="img"
      aria-label={`${barra.total} ${barra.total === 1 ? 'anúncio' : 'anúncios'}: ${descricao}`}
      style={{ width: barra.largura }}
    >
      {barra.segmentos.map((s) => (
        <span key={s.grupo} className="ap-pipeline__seg" data-grupo={s.grupo} style={{ width: s.largura }} />
      ))}
    </span>
  );
}
