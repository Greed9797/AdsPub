import type { Asset, Copy } from '@/lib/types';
import { ctaLabel } from './ui';
import { Icon } from './icons';

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
  return (
    <aside aria-label="Prévia do anúncio" className="space-y-3">
      <h3 className="text-sm font-semibold">Prévia do anúncio</h3>
      <article className="ad-preview">
        <div className="ad-preview-head">
          <span className="profile-avatar">
            <Icon name="ad" size={16} />
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold" title={pageLabel}>
              {pageLabel || 'Defina a página do anúncio'}
            </p>
            <p className="text-[11px] text-[var(--color-muted)]">Patrocinado · Prévia</p>
          </div>
        </div>
        <p className="ad-preview-copy">
          {copy.primary_text || 'O texto principal aparecerá aqui.'}
        </p>
        {asset?.kind === 'video' && asset.url ? (
          <video
            src={asset.url}
            poster={asset.thumbnail_url ?? undefined}
            controls
            preload="metadata"
            playsInline
            className="aspect-square w-full bg-[var(--color-surface-2)] object-contain"
          />
        ) : asset?.thumbnail_url || (asset?.kind === 'image' && asset.url) ? (
          <img
            src={(asset.thumbnail_url ?? asset.url)!}
            alt={asset.filename}
            className="aspect-square w-full bg-[var(--color-surface-2)] object-contain"
          />
        ) : (
          <div className="ad-preview-media">
            {asset ? 'Mídia sem prévia disponível.' : 'Selecione uma mídia para visualizar.'}
          </div>
        )}
        {mediaCount > 1 ? (
          <p className="px-3 py-2 text-xs text-[var(--color-muted)]">
            Primeira mídia de {mediaCount} neste anúncio.
          </p>
        ) : null}
        <div className="ad-preview-destination">
          {copy.link ? (
            <p className="truncate text-[11px] text-[var(--color-muted)]">
              {copy.link.replace(/^https?:\/\//, '').split('/')[0]}
            </p>
          ) : null}
          {copy.headline ? <p className="font-semibold">{copy.headline}</p> : null}
          {copy.description ? (
            <p className="text-xs text-[var(--color-muted)]">{copy.description}</p>
          ) : null}
          {copy.cta !== 'NO_BUTTON' ? (
            <span className="ad-preview-cta">{ctaLabel(copy.cta)}</span>
          ) : null}
        </div>
      </article>
      <p className="text-xs text-[var(--color-muted)]">
        Prévia simplificada, sem interação. Recortes e posicionamentos podem variar na Meta.
      </p>
    </aside>
  );
}
