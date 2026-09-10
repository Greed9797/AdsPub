import { z } from 'zod';
import { Card, Empty, Field, inputClass, buttonClass } from '@/components/ui';
import { api } from '@/lib/api';
import { requireSession } from '@/lib/session';
import type { Client } from '@/lib/types';
import { RelatorioForm } from './relatorio-form';

type SearchParams = { client_id?: string | string[] };

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/** T-003-3: área de importação de relatórios tabulares. */
export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireSession();
  const raw = await searchParams;
  const clientId = z.string().uuid().safeParse(first(raw.client_id)).data;
  const clients = await api<Client[]>('/clients');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Relatórios</h1>
      <Card title="Cliente">
        <form method="get" action="/relatorios" className="flex items-end gap-3">
          <Field label="Cliente">
            <select name="client_id" defaultValue={clientId ?? ''} className={inputClass}>
              <option value="">Selecione</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </Field>
          <button className={buttonClass} type="submit">
            Usar cliente
          </button>
        </form>
      </Card>
      {!clientId ? (
        <Card>
          <Empty>Selecione um cliente para importar relatórios.</Empty>
        </Card>
      ) : (
        <Card title="Importar CSV/XLSX">
          <RelatorioForm clientId={clientId} />
        </Card>
      )}
    </div>
  );
}
