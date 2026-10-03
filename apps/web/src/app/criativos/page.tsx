import { z } from 'zod';
import { Button, Card, Chip, Empty, Field, PageHead, Selo, formatLabel, inputClass, plural } from '@/components/ui';
import { api } from '@/lib/api';
import {
  filtrarMidias,
  lerFiltroDeMidia,
  quadroDeValidacao,
  type ContagemDeMidias,
  type FiltroDeMidia,
} from '@/lib/criativos-view';
import { requireSession } from '@/lib/session';
import type { Asset, Client, Variant } from '@/lib/types';
import { DriveImportForm } from './drive-import-form';
import { MediaGrid } from './media-grid';
import { UploadForm } from './upload-form';

type SearchParams = {
  client_id?: string | string[];
  kind?: string | string[];
  status?: string | string[];
};

const filtersSchema = z.object({
  client_id: z.string().uuid().optional(),
  kind: z.enum(['image', 'video']).optional(),
});

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/** Barra empilhada: aprovadas, com aviso, recusadas. Sem mídia do tipo, o bloco não aparece. */
function BarraDoTipo({ titulo, contagem }: { titulo: string; contagem: ContagemDeMidias }) {
  if (contagem.total === 0) return null;
  return (
    <div className="ap-validacao__tipo">
      <p className="ap-t-body-strong">
        {titulo} <span className="ap-t-num-s ap-validacao__n">{contagem.total}</span>
      </p>
      <span className="ap-validacao__bar" role="img" aria-label={`${contagem.aprovadas} aprovadas, ${contagem.comAviso} com aviso, ${contagem.recusadas} recusadas`}>
        {contagem.aprovadas > 0 ? <i data-estado="aprovada" style={{ flexGrow: contagem.aprovadas }} /> : null}
        {contagem.comAviso > 0 ? <i data-estado="com_aviso" style={{ flexGrow: contagem.comAviso }} /> : null}
        {contagem.recusadas > 0 ? <i data-estado="recusada" style={{ flexGrow: contagem.recusadas }} /> : null}
      </span>
      <p className="ap-t-small ap-validacao__legenda">
        <span data-estado="aprovada">{contagem.aprovadas} aprovadas</span>
        <span data-estado="com_aviso">{contagem.comAviso} com aviso</span>
        <span data-estado="recusada">{contagem.recusadas} recusadas</span>
      </p>
    </div>
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
  });
  const filters = parsed.success ? parsed.data : {};
  const estado: FiltroDeMidia = lerFiltroDeMidia(first(raw.status));

  const clients = await api<Client[]>('/clients');
  const client = clients.find((candidate) => candidate.id === filters.client_id);

  let todas: Asset[] = [];
  let variants: Variant[] = [];
  if (filters.client_id) {
    // Sem filtro de validação na API: o quadro precisa da biblioteca inteira para contar.
    const query = new URLSearchParams({ client_id: filters.client_id });
    if (filters.kind) query.set('kind', filters.kind);
    todas = await api<Asset[]>(`/assets?${query.toString()}`);
    // T-002-3: variantes derivadas nas validações; kind filtra formato compatível.
    const vquery = new URLSearchParams({ client_id: filters.client_id });
    if (filters.kind === 'image') vquery.set('format', 'single_image');
    if (filters.kind === 'video') vquery.set('format', 'single_video');
    variants = await api<Variant[]>(`/variants?${vquery.toString()}`);
  }
  const quadro = quadroDeValidacao(todas);
  const assets = filtrarMidias(todas, estado);

  const hrefDe = (mudancas: { status?: FiltroDeMidia; kind?: 'image' | 'video' | undefined }) => {
    const query = new URLSearchParams();
    if (filters.client_id) query.set('client_id', filters.client_id);
    const kind = 'kind' in mudancas ? mudancas.kind : filters.kind;
    const status = mudancas.status ?? estado;
    if (kind) query.set('kind', kind);
    if (status !== 'todas') query.set('status', status);
    return `/criativos${query.size ? `?${query}` : ''}`;
  };

  return (
    <div className="ap-lotes">
      <PageHead
        title="Criativos"
        description={
          client
            ? `${plural(quadro.total, 'mídia', 'mídias')} de ${client.name}. Só entram em lote as que passam pela validação de formato, proporção, duração e codec.`
            : 'Organize fotos e vídeos, confira a validação e prepare as mídias dos anúncios.'
        }
        action={
          filters.client_id && canEdit ? (
            <Button variant="primary" label="Criar lote" href={`/lotes/novo?client_id=${filters.client_id}`} />
          ) : undefined
        }
      />

      <form method="get" action="/criativos" aria-label="Filtrar criativos" className="ap-lotes__filters">
        {estado !== 'todas' ? <input type="hidden" name="status" value={estado} /> : null}
        <Field label="Cliente">
          <select id="filtro-cliente" name="client_id" defaultValue={filters.client_id ?? ''} className={inputClass}>
            <option value="">Todos</option>
            {clients.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tipo">
          <select id="filtro-tipo" name="kind" defaultValue={filters.kind ?? ''} className={inputClass}>
            <option value="">Todos</option>
            <option value="image">Imagem</option>
            <option value="video">Vídeo</option>
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
      ) : (
        <>
          <section className="ap-validacao" aria-label="Quadro de validação">
            <div className="ap-validacao__total">
              <p className="ap-t-label">Quadro de validação</p>
              <p className="ap-t-num-xl ap-validacao__big">{quadro.utilizaveis}</p>
              <p className="ap-t-small">de {quadro.total} podem entrar em lote (aprovadas e com aviso)</p>
            </div>
            <div className="ap-validacao__tipos">
              <BarraDoTipo titulo="Imagens" contagem={quadro.imagens} />
              <BarraDoTipo titulo="Vídeos" contagem={quadro.videos} />
              {quadro.total === 0 ? <p className="ap-t-small">Sem mídias para este cliente ainda.</p> : null}
            </div>
          </section>

          <div className="ap-chips" role="group" aria-label="Mostrar na lista">
            <Chip href={hrefDe({ status: 'todas' })} active={estado === 'todas'} count={quadro.total}>
              Todas as mídias
            </Chip>
            <Chip href={hrefDe({ status: 'aprovadas' })} active={estado === 'aprovadas'} count={quadro.aprovadas}>
              Aprovadas
            </Chip>
            <Chip href={hrefDe({ status: 'com_aviso' })} active={estado === 'com_aviso'} count={quadro.comAviso}>
              Com aviso
            </Chip>
            <Chip href={hrefDe({ status: 'recusadas' })} active={estado === 'recusadas'} count={quadro.recusadas}>
              Recusadas
            </Chip>
          </div>

          <div className="ap-library">
            <div className="ap-library__main">
              <section aria-label="Biblioteca de criativos">
                <h2 className="ap-t-section ap-library__h">Criativos ({assets.length})</h2>
                {assets.length === 0 ? (
                  <Empty title="Nenhum criativo encontrado" hint="Ajuste os filtros informados e tente de novo." />
                ) : (
                  <MediaGrid assets={assets} canEdit={canEdit} clientId={filters.client_id} />
                )}
              </section>

              <section aria-label="Variantes de comunicação">
                <h2 className="ap-t-section ap-library__h">Variantes de comunicação ({variants.length})</h2>
                {variants.length === 0 ? (
                  <Empty title="Nenhuma variante validada" hint="Valide variantes para este cliente para vê-las aqui." />
                ) : (
                  <div className="ap-variantes">
                    {variants.map((variant) => (
                      <article key={variant.id} className="ap-variante">
                        <div className="ap-variante__head">
                          <p className="ap-t-body-strong">{variant.manifest.copy.headline || '(sem título)'}</p>
                          <Selo tone="neutro" label={formatLabel(variant.manifest.format)} />
                        </div>
                        <p className="ap-t-small ap-variante__text">{variant.manifest.copy.primary_text}</p>
                        <p className="ap-t-ref ap-variante__text">
                          {plural(variant.manifest.assetIds.length, 'mídia', 'mídias')} · {variant.fingerprint.slice(0, 8)}
                        </p>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
            <aside className="ap-library__aside" aria-label="Adicionar mídias">
              {canEdit ? <UploadForm clientId={filters.client_id} /> : null}
              {canEdit ? <DriveImportForm clientId={filters.client_id} /> : null}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
