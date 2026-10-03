import Link from 'next/link';

import { Selo } from '@/components/ui';
import {
  colunasDoQuadro,
  type ContagemPorGrupo,
  type EstadoGrupo,
  type FiltroLista,
} from '@/lib/lotes-view';
import { seloParaStatus } from '@/lib/selo';

/** Teto de pontos desenhados por grupo; o número ao lado continua exato. */
const MAX_PONTOS = 24;

const STATUS_DO_GRUPO: Readonly<Record<EstadoGrupo, string>> = {
  rascunho: 'draft',
  bloqueado: 'blocked',
  pronto: 'ready',
  fila: 'queued',
  publicando: 'uploading_media',
  publicado: 'published',
  analise: 'in_review',
  aprovado: 'approved',
  reprovado: 'disapproved',
  falhou: 'failed',
  conferir: 'needs_reconciliation',
};

export function StateBoard({
  contagem,
  total,
  atencao,
  filtro,
  hrefDoFiltro,
}: {
  contagem: ContagemPorGrupo;
  total: number;
  atencao: number;
  filtro: FiltroLista;
  hrefDoFiltro: (filtro: FiltroLista) => string;
}) {
  return (
    <section className="ap-board" aria-label="Quadro de estados">
      <header className="ap-board__head">
        <p className="ap-t-section">
          <span className="ap-t-num-l">{total}</span> {total === 1 ? 'anúncio' : 'anúncios'}
        </p>
        <p className="ap-board__attention ap-t-body" data-alert={atencao > 0 ? 'true' : undefined}>
          {atencao} {atencao === 1 ? 'precisa de atenção' : 'precisam de atenção'}
        </p>
      </header>
      <div className="ap-board__summary">
        <p className="ap-board__big ap-t-num-xl">{total}</p>
        <span className="ap-board__stack" aria-hidden="true">
          {colunasDoQuadro(contagem)
            .filter((c) => c.n > 0)
            .map((c) => (
              <span key={c.grupo} className="ap-pipeline__seg" data-grupo={c.grupo} style={{ flexGrow: c.n }} />
            ))}
        </span>
        <ul className="ap-board__legend ap-t-small">
          {colunasDoQuadro(contagem)
            .filter((c) => c.n > 0)
            .map((c) => (
              <li key={c.grupo} data-grupo={c.grupo}>
                <i className="ap-board__dot" aria-hidden="true" /> {c.n} {c.rotulo.toLowerCase()}
              </li>
            ))}
        </ul>
      </div>
      <ul className="ap-board__groups">
        {colunasDoQuadro(contagem).map(({ grupo, rotulo, n }) => {
          const ativo = filtro === grupo;
          return (
            <li key={grupo} className="ap-board__group" data-grupo={grupo} data-empty={n === 0 ? 'true' : undefined}>
              <Link
                href={hrefDoFiltro(ativo ? 'todos' : grupo)}
                aria-label={`${rotulo} ${n}`}
                aria-current={ativo ? 'true' : undefined}
                className="ap-board__link"
              >
                <Selo tone={seloParaStatus(STATUS_DO_GRUPO[grupo]).tone} label={rotulo} />
                <span className="ap-board__n ap-t-num">{n}</span>
                <span className="ap-board__dots" aria-hidden="true">
                  {Array.from({ length: Math.min(n, MAX_PONTOS) }, (_, i) => (
                    <i key={i} className="ap-board__dot" />
                  ))}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
