import type { Asset, Copy } from '@/lib/types';
import { ctaLabel } from './ui';

/** Prévia simplificada do anúncio no feed. Sem interação; os recortes reais variam na Meta. */
export function AdPreview({
  copy,
  asset,
  pageLabel,
  mediaCount = 1,
}: {
  copy: Pick<Copy, 'primary_text' | 'headline' | 'description' | 'cta' | 'link'>;
  asset?: Asset;
  pageLabel: string;
  mediaCount?: number;
}) {
  const imagem = asset?.thumbnail_url ?? (asset?.kind === 'image' ? asset.url : null);
  return (
    <aside aria-label="Prévia do anúncio" className="ap-preview">
      <article className="ap-preview__card">
        <header className="ap-preview__head">
          <span className="ap-preview__avatar" aria-hidden="true" />
          <div className="ap-preview__page">
            <p className="ap-t-body-strong" title={pageLabel}>
              {pageLabel || 'Defina a página do anúncio'}
            </p>
            <p className="ap-t-ref">Patrocinado · Prévia</p>
          </div>
        </header>
        <p className="ap-preview__copy ap-t-small">{copy.primary_text || 'O texto principal aparecerá aqui.'}</p>
        {asset?.kind === 'video' && asset.url ? (
          <video
            src={asset.url}
            poster={asset.thumbnail_url ?? undefined}
            controls
            preload="metadata"
            playsInline
            className="ap-preview__media"
          />
        ) : imagem ? (
          <img src={imagem} alt={asset?.filename ?? ''} className="ap-preview__media" />
        ) : (
          <div className="ap-preview__media ap-preview__media--vazia ap-t-small">
            {asset ? 'Mídia sem prévia disponível.' : 'Selecione uma mídia para visualizar.'}
          </div>
        )}
        {mediaCount > 1 ? (
          <p className="ap-preview__more ap-t-small">Primeira mídia de {mediaCount} neste anúncio.</p>
        ) : null}
        <footer className="ap-preview__dest">
          <div className="ap-preview__dest-text">
            {copy.link ? <p className="ap-t-ref">{copy.link.replace(/^https?:\/\//, '').split('/')[0]}</p> : null}
            {copy.headline ? <p className="ap-t-body-strong">{copy.headline}</p> : null}
            {copy.description ? <p className="ap-t-small">{copy.description}</p> : null}
          </div>
          {copy.cta !== 'NO_BUTTON' ? <span className="ap-preview__cta ap-t-stamp">{ctaLabel(copy.cta)}</span> : null}
        </footer>
      </article>
      <p className="ap-preview__note ap-t-small">
        Prévia simplificada, sem interação. Recortes e posicionamentos podem variar na Meta.
      </p>
    </aside>
  );
}
