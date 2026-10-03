import { Card, Selo } from '@/components/ui';
import { estruturaDoLote } from '@/lib/etapas';
import type { Batch, BatchRef } from '@/lib/types';

const SELO_DO_ESTADO: Readonly<Record<BatchRef['state'], { tone: 'publicado' | 'fila' | 'falhou' | 'conferir'; label: string }>> = {
  created: { tone: 'publicado', label: 'criada' },
  pending: { tone: 'fila', label: 'na fila' },
  failed: { tone: 'falhou', label: 'falhou' },
  needs_reconciliation: { tone: 'conferir', label: 'conferir' },
};

/** Campanha e conjuntos que os anúncios do lote dividem, com o estado de cada um na Meta. */
export function SharedStructure({ batch }: { batch: Pick<Batch, 'items' | 'refs'> }) {
  const linhas = estruturaDoLote(batch);
  if (linhas.length === 0) return null;
  return (
    <Card title="Estrutura compartilhada na Meta">
      <ul className="ap-estrutura" aria-label="Estrutura compartilhada na Meta">
        {linhas.map((linha) => {
          const selo = SELO_DO_ESTADO[linha.estado];
          return (
            <li key={`${linha.tipo}-${linha.chave}`} className="ap-estrutura__linha" data-tipo={linha.tipo}>
              <span className="ap-t-label ap-estrutura__tipo">{linha.rotulo}</span>
              <span className="ap-estrutura__texto">
                <span className="ap-t-body-strong">{linha.chave}</span>
                <span className="ap-t-small ap-estrutura__detalhe">
                  {linha.anuncios} {linha.anuncios === 1 ? 'anúncio' : 'anúncios'}
                  {linha.metaId ? ` · ID Meta ${linha.metaId}` : ''}
                </span>
                {/* Em conferência o painel de reconciliação já mostra o erro; aqui só o que falhou. */}
                {linha.erro && linha.estado !== 'needs_reconciliation' ? <span className="ap-t-small ap-estrutura__erro">{linha.erro}</span> : null}
              </span>
              <Selo tone={selo.tone} label={selo.label} />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
