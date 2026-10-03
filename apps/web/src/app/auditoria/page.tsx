import { z } from 'zod';
import { Button, Card, Empty, Field, PageHead, Table, TableCell, TableRow, inputClass } from '@/components/ui';
import { ladosDaAlteracao, temAlteracao } from '@/lib/auditoria-view';
import { api } from '@/lib/api';
import { requireRole } from '@/lib/session';
import type { AuditEntry } from '@/lib/types';

type SearchParams = {
  entity_type?: string | string[];
  entity_id?: string | string[];
  actor_id?: string | string[];
  from?: string | string[];
  to?: string | string[];
  limit?: string | string[];
};

const filtersSchema = z.object({
  entity_type: z.string().min(1).optional(),
  entity_id: z.string().min(1).optional(),
  actor_id: z.string().uuid().optional(),
  from: z.string().min(1).optional(),
  to: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

type Filtros = z.infer<typeof filtersSchema>;

/** Campo de formulário vazio chega como `""`: tratar como ausente, senão um Limite em branco derruba todos os filtros. */
function first(value: string | string[] | undefined): string | undefined {
  const bruto = Array.isArray(value) ? value[0] : value;
  return bruto === undefined || bruto.trim() === '' ? undefined : bruto;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR');
}

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireRole(['admin', 'coordinator']);

  const raw = await searchParams;
  const parsed = filtersSchema.safeParse({
    entity_type: first(raw.entity_type),
    entity_id: first(raw.entity_id),
    actor_id: first(raw.actor_id),
    from: first(raw.from),
    to: first(raw.to),
    limit: first(raw.limit),
  });

  const filters: Filtros = parsed.success ? parsed.data : {};

  const query = new URLSearchParams();
  if (filters.entity_type) query.set('entity_type', filters.entity_type);
  if (filters.entity_id) query.set('entity_id', filters.entity_id);
  if (filters.actor_id) query.set('actor_id', filters.actor_id);
  if (filters.from) query.set('from', filters.from);
  if (filters.to) query.set('to', filters.to);
  if (filters.limit !== undefined) query.set('limit', String(filters.limit));

  const rows = await api<AuditEntry[]>(`/audit${query.toString() ? `?${query.toString()}` : ''}`);

  return (
    <div className="ap-lotes">
      <PageHead title="Auditoria" description="Quem fez o quê, em qual entidade e quando." />

      <form method="get" className="ap-lotes__filters" action="/auditoria">
        <Field label="Entidade">
          <input
            type="text"
            name="entity_type"
            defaultValue={filters.entity_type ?? ''}
            placeholder="client, batch, ..."
            className={inputClass}
          />
        </Field>

        <Field label="ID da entidade">
          <input
            type="text"
            name="entity_id"
            defaultValue={filters.entity_id ?? ''}
            placeholder="id"
            className={inputClass}
          />
        </Field>

        <Field label="Usuário responsável">
          <input
            type="text"
            name="actor_id"
            defaultValue={filters.actor_id ?? ''}
            placeholder="uuid do usuário"
            className={inputClass}
          />
        </Field>

        <Field label="Limite">
          <input
            type="number"
            name="limit"
            min={1}
            max={500}
            defaultValue={filters.limit}
            className={inputClass}
          />
        </Field>

        <Field label="De">
          <input
            type="datetime-local"
            name="from"
            defaultValue={filters.from ?? ''}
            className={inputClass}
          />
        </Field>

        <Field label="Até">
          <input
            type="datetime-local"
            name="to"
            defaultValue={filters.to ?? ''}
            className={inputClass}
          />
        </Field>

        <div>
          <Button variant="secondary" label="Aplicar filtros" type="submit" />
        </div>
      </form>

      <Card
        title="Eventos"
        action={
          rows.length > 0 ? (
            <span className="ap-t-num-s ap-passos__dica">{rows.length}</span>
          ) : undefined
        }
      >
        {rows.length === 0 ? (
          <Empty
            title="Nenhum evento encontrado"
            hint="Ajuste os filtros informados e tente de novo."
          />
        ) : (
          <Table head={['Data', 'Ator', 'Ação', 'Entidade', 'Detalhes']}>
            {rows.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>{formatDate(entry.created_at)}</TableCell>
                <TableCell>{entry.actor_email ?? entry.actor_id ?? '—'}</TableCell>
                <TableCell>{entry.action}</TableCell>
                <TableCell>
                  {entry.entity_type} · {entry.entity_id}
                </TableCell>
                <TableCell>
                  {temAlteracao(entry) ? (
                    <details className="ap-audit">
                      <summary className="ap-t-body">Ver alterações</summary>
                      <div className="ap-audit__lados">
                        {ladosDaAlteracao(entry).map((lado) =>
                          lado.texto === null ? null : (
                            <section key={lado.rotulo} aria-label={lado.rotulo}>
                              <h3 className="ap-t-label">{lado.rotulo}</h3>
                              <pre className="ap-audit__pre">{lado.texto}</pre>
                            </section>
                          ),
                        )}
                      </div>
                    </details>
                  ) : (
                    <span className="ap-passos__dica">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
