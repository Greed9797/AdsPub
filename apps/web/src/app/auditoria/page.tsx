import { z } from 'zod';
import { buttonClass, Card, Empty, Field, inputClass, PageHead, Table } from '@/components/ui';
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

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
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
    <div className="space-y-6">
      <PageHead title="Auditoria" description="Quem fez o quê, em qual entidade e quando." />

      <Card>
        <form method="get" className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-4" action="/auditoria">
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

          <Field label="Ator">
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

          <div className="sm:col-span-2 xl:col-span-1">
            <button className={buttonClass} type="submit">
              Aplicar filtros
            </button>
          </div>
        </form>
      </Card>

      <Card
        title="Eventos"
        action={
          rows.length > 0 ? (
            <span className="text-xs tabular-nums text-[var(--color-muted)]">{rows.length}</span>
          ) : undefined
        }
      >
        {rows.length === 0 ? (
          <Empty>Nenhum evento encontrado para os filtros informados.</Empty>
        ) : (
          <Table head={['Data', 'Ator', 'Ação', 'Entidade', 'Detalhes']}>
            {rows.map((entry) => (
              <tr key={entry.id}>
                <td className="px-3 py-2">{formatDate(entry.created_at)}</td>
                <td className="px-3 py-2">{entry.actor_email ?? entry.actor_id ?? '—'}</td>
                <td className="px-3 py-2">{entry.action}</td>
                <td className="px-3 py-2">{entry.entity_type} · {entry.entity_id}</td>
                <td className="px-3 py-2">
                  <details>
                    <summary className="cursor-pointer text-sm text-[var(--color-muted)]">Ver payload</summary>
                    <pre className="mt-2 max-h-48 overflow-auto rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2 text-xs">
                      {JSON.stringify(
                        {
                          before: entry.before,
                          after: entry.after,
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
