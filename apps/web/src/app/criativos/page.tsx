import { z } from 'zod';
import {
  Badge,
  Card,
  Empty,
  Field,
  formatLabel,
  inputClass,
  PageHead,
  plural,
} from '@/components/ui';
import { api } from '@/lib/api';
import { requireSession } from '@/lib/session';
import type { Asset, Client, Variant } from '@/lib/types';
import { DriveImportForm } from './drive-import-form';
import { UploadForm } from './upload-form';
import { AnalysisButton } from './analysis-button';
import { Button } from '@astryxdesign/core/Button';
import { ButtonLink } from '@/components/button-link';

type SearchParams = {
  client_id?: string | string[];
  kind?: string | string[];
  status?: string | string[];
};

const filtersSchema = z.object({
  client_id: z.string().uuid().optional(),
  kind: z.enum(['image', 'video']).optional(),
  status: z.enum(['ok', 'rejected']).optional(),
});

type Filtros = z.infer<typeof filtersSchema>;

const sizeInMegabytes = (bytes: number): string => (bytes / 1024 / 1024).toFixed(2);

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function AssetKindBadge({ kind }: { kind: 'image' | 'video' }) {
  return <Badge tone="info">{kind === 'image' ? 'Imagem' : 'Vídeo'}</Badge>;
}

function AssetCard({ asset, canEdit }: { asset: Asset; canEdit: boolean }) {
  return (
    <article className="media-card">
      <div className="aspect-video overflow-hidden bg-[var(--color-surface-2)]">
        {asset.kind === 'video' && asset.url ? (
          <video
            className="h-full w-full object-cover"
            src={asset.url}
            poster={asset.thumbnail_url ?? undefined}
            controls
            preload="metadata"
            playsInline
          />
        ) : asset.thumbnail_url ? (
          <img
            src={asset.thumbnail_url}
            alt={asset.filename}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-sm text-[var(--color-muted)]">
            Prévia indisponível
          </div>
        )}
      </div>

      <div className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="media-card-name">{asset.filename}</p>
          <Badge tone={asset.validation.status === 'ok' ? 'ok' : 'danger'}>
            {asset.validation.status === 'ok' ? 'válido' : 'rejeitado'}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted)]">
          <AssetKindBadge kind={asset.kind} />
          <span>
            {asset.width} × {asset.height}
          </span>
          <span>·</span>
          <span>{asset.aspect_ratio}</span>
          {asset.kind === 'video' ? (
            <span>
              ·{' '}
              {asset.duration_ms === null
                ? 'duração indisponível'
                : `${(asset.duration_ms / 1000).toFixed(1)}s`}
            </span>
          ) : null}
          <span>·</span>
          <span>{sizeInMegabytes(asset.size_bytes)} MB</span>
          <span>·</span>
          <span>{asset.source === 'drive' ? 'Google Drive' : 'Upload'}</span>
        </div>

        {asset.validation.status === 'rejected' ? (
          <div>
            <p className="text-xs text-[var(--color-danger)]">Validação rejeitada:</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-[var(--color-danger)]">
              {asset.validation.errors.map((error, index) => (
                <li key={`${asset.id}-validation-${index}`}>{error}</li>
              ))}
            </ul>
          </div>
        ) : canEdit ? (
          <AnalysisButton assetId={asset.id} />
        ) : null}

        {asset.validation.warnings.length > 0 ? (
          <div>
            <p className="text-xs text-[var(--color-warn)]">Avisos (não impedem o anúncio):</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-[var(--color-warn)]">
              {asset.validation.warnings.map((warning, index) => (
                <li key={`${asset.id}-warning-${index}`}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export default async function CriativosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireSession();
  const canEdit = user.role !== 'viewer';

  const raw = await searchParams;
  const parsed = filtersSchema.safeParse({
    client_id: first(raw.client_id),
    kind: first(raw.kind),
    status: first(raw.status),
  });

  const filters: Filtros = parsed.success ? parsed.data : {};

  const clients = await api<Client[]>('/clients');

  let assets: Asset[] = [];
  let variants: Variant[] = [];
  if (filters.client_id) {
    const query = new URLSearchParams({ client_id: filters.client_id });

    if (filters.kind) query.set('kind', filters.kind);
    if (filters.status) query.set('status', filters.status);

    assets = await api<Asset[]>(`/assets?${query.toString()}`);
    // T-002-3: variantes derivadas nas validações; kind filtra formato compatível.
    const vquery = new URLSearchParams({ client_id: filters.client_id });
    if (filters.kind === 'image') vquery.set('format', 'single_image');
    if (filters.kind === 'video') vquery.set('format', 'single_video');
    variants = await api<Variant[]>(`/variants?${vquery.toString()}`);
  }

  return (
    <div className="space-y-6">
      <PageHead
        title="Criativos"
        description="Organize fotos e vídeos, confira a validação e prepare as mídias dos anúncios."
        action={
          filters.client_id && canEdit ? (
            <ButtonLink
              variant="primary"
              label="Criar lote"
              href={`/lotes/novo?client_id=${filters.client_id}`}
            />
          ) : undefined
        }
      />

      <form method="get" action="/criativos" aria-label="Filtrar criativos" className="toolbar">
        <Field label="Cliente" className="w-full sm:w-64">
          <select name="client_id" defaultValue={filters.client_id ?? ''} className={inputClass}>
            <option value="">Todos</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Tipo" className="w-full sm:w-48">
          <select name="kind" defaultValue={filters.kind ?? ''} className={inputClass}>
            <option value="">Todos</option>
            <option value="image">Imagem</option>
            <option value="video">Vídeo</option>
          </select>
        </Field>

        <Field label="Validação" className="w-full sm:w-48">
          <select name="status" defaultValue={filters.status ?? ''} className={inputClass}>
            <option value="">Todas</option>
            <option value="ok">Aprovadas</option>
            <option value="rejected">Rejeitadas</option>
          </select>
        </Field>

        <Button variant="secondary" label="Aplicar filtros" type="submit" />
      </form>

      {!filters.client_id ? (
        <Card>
          <Empty
            title="Nenhum cliente selecionado"
            hint="Selecione um cliente para listar os criativos e habilitar os envios."
          />
        </Card>
      ) : null}

      {filters.client_id ? (
        <div className="media-library">
          <div className="min-w-0 space-y-6">
            <section aria-label="Biblioteca de criativos">
              <h2 className="mb-4 text-sm font-semibold">Criativos ({assets.length})</h2>
              {assets.length === 0 ? (
                <Empty
                  title="Nenhum criativo encontrado"
                  hint="Ajuste os filtros informados e tente de novo."
                />
              ) : (
                <div className="media-grid">
                  {assets.map((asset) => (
                    <AssetCard key={asset.id} asset={asset} canEdit={canEdit} />
                  ))}
                </div>
              )}
            </section>

            <section aria-label="Variantes de comunicação">
              <h2 className="mb-4 text-sm font-semibold">
                Variantes de comunicação ({variants.length})
              </h2>
              {variants.length === 0 ? (
                <Empty
                  title="Nenhuma variante validada"
                  hint="Valide variantes para este cliente para vê-las aqui."
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {variants.map((variant) => (
                    <article
                      key={variant.id}
                      className="space-y-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium">
                          {variant.manifest.copy.headline || '(sem título)'}
                        </p>
                        <Badge tone="info">{formatLabel(variant.manifest.format)}</Badge>
                      </div>
                      <p className="text-xs text-[var(--color-muted)]">
                        {variant.manifest.copy.primary_text}
                      </p>
                      <p className="text-xs text-[var(--color-muted)]">
                        {plural(variant.manifest.assetIds.length, 'mídia', 'mídias')} ·{' '}
                        {variant.fingerprint.slice(0, 8)}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
          <aside className="space-y-4" aria-label="Adicionar mídias">
            {canEdit ? <UploadForm clientId={filters.client_id} /> : null}
            {canEdit ? <DriveImportForm clientId={filters.client_id} /> : null}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
