'use client';

import { useState } from 'react';

import { Button, Selo } from '@/components/ui';
import { estadoDaMidia, type EstadoDaMidia } from '@/lib/criativos-view';
import type { Asset } from '@/lib/types';
import { AnalysisButton } from './analysis-button';

const SELO: Readonly<Record<EstadoDaMidia, { tone: 'publicado' | 'neutro' | 'bloqueado'; label: string }>> = {
  aprovada: { tone: 'publicado', label: 'Aprovada' },
  com_aviso: { tone: 'neutro', label: 'Com aviso' },
  recusada: { tone: 'bloqueado', label: 'Recusada' },
};

const megabytes = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

function MediaCard({
  asset,
  canEdit,
  selecionada,
  onToggle,
}: {
  asset: Asset;
  canEdit: boolean;
  selecionada: boolean;
  onToggle: () => void;
}) {
  const estado = estadoDaMidia(asset);
  const selo = SELO[estado];
  return (
    <article className="ap-midia" data-estado={estado} data-selecionada={selecionada ? 'true' : undefined}>
      <div className="ap-midia__thumb">
        {asset.kind === 'video' && asset.url ? (
          <video src={asset.url} poster={asset.thumbnail_url ?? undefined} controls preload="metadata" playsInline />
        ) : asset.thumbnail_url ? (
          <img src={asset.thumbnail_url} alt={asset.filename} loading="lazy" />
        ) : (
          <span className="ap-midia__vazia ap-t-small">Prévia indisponível</span>
        )}
        <span className="ap-midia__selo">
          <Selo tone={selo.tone} label={selo.label} />
        </span>
        {canEdit && estado !== 'recusada' ? (
          <label className="ap-midia__pick">
            <input
              type="checkbox"
              className="ap-check"
              checked={selecionada}
              onChange={onToggle}
              aria-label={`Selecionar ${asset.filename}`}
            />
          </label>
        ) : null}
      </div>
      <div className="ap-midia__body">
        <p className="ap-t-ref ap-midia__name" title={asset.filename}>
          {asset.filename}
        </p>
        <p className="ap-t-small ap-midia__meta">
          {asset.kind === 'image' ? 'Imagem' : 'Vídeo'} · {asset.aspect_ratio} · {asset.width}×{asset.height}
          {asset.kind === 'video' && asset.duration_ms !== null ? ` · ${(asset.duration_ms / 1000).toFixed(1)}s` : ''} ·{' '}
          {megabytes(asset.size_bytes)} · {asset.source === 'drive' ? 'Google Drive' : 'Upload'}
        </p>
        {estado === 'recusada' ? (
          <div className="ap-midia__issues" data-tone="danger">
            <p className="ap-t-small">Validação rejeitada:</p>
            <ul className="ap-t-small">
              {asset.validation.errors.map((error, index) => (
                <li key={`${asset.id}-erro-${index}`}>{error}</li>
              ))}
            </ul>
          </div>
        ) : canEdit ? (
          <AnalysisButton assetId={asset.id} />
        ) : null}
        {asset.validation.warnings.length > 0 ? (
          <div className="ap-midia__issues" data-tone="warn">
            <p className="ap-t-small">Avisos (não impedem o anúncio):</p>
            <ul className="ap-t-small">
              {asset.validation.warnings.map((warning, index) => (
                <li key={`${asset.id}-aviso-${index}`}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function MediaGrid({ assets, canEdit, clientId }: { assets: Asset[]; canEdit: boolean; clientId: string }) {
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const nomes = assets.filter((a) => selecionadas.includes(a.id)).map((a) => a.filename);
  const alternar = (id: string) =>
    setSelecionadas((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]));

  return (
    <>
      <div className="ap-midias">
        {assets.map((asset) => (
          <MediaCard
            key={asset.id}
            asset={asset}
            canEdit={canEdit}
            selecionada={selecionadas.includes(asset.id)}
            onToggle={() => alternar(asset.id)}
          />
        ))}
      </div>
      {canEdit && selecionadas.length > 0 ? (
        <div className="ap-selbar" role="region" aria-label="Mídias selecionadas">
          <p className="ap-selbar__count ap-t-section">
            {selecionadas.length} {selecionadas.length === 1 ? 'mídia selecionada' : 'mídias selecionadas'}
          </p>
          <p className="ap-selbar__names ap-t-ref">{nomes.slice(0, 3).join(' · ')}{nomes.length > 3 ? ` · +${nomes.length - 3}` : ''}</p>
          <div className="ap-selbar__actions">
            <Button variant="ghost" label="Limpar seleção" onClick={() => setSelecionadas([])} />
            <Button
              variant="primary"
              label="Criar lote com estas mídias"
              href={`/lotes/novo?client_id=${encodeURIComponent(clientId)}&assets=${selecionadas.map(encodeURIComponent).join(',')}`}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
