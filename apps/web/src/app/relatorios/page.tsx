import { z } from 'zod';
import { Card, Empty, Field, PageHead, inputClass, buttonClass } from '@/components/ui';
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
      <PageHead title="Relatórios" description="Arquivo vira base confiável." />
      <Card>
        <form method="get" action="/relatorios" className="flex flex-wrap items-end gap-3">
          <Field label="Cliente" className="w-full sm:w-64">
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
          <Empty title="Nenhum cliente selecionado" hint="Selecione um cliente para importar relatórios." />
        </Card>
      ) : (
        <Card title="Importar CSV/XLSX">
          <RelatorioForm clientId={clientId} />
        </Card>
      )}
    </div>
  );
}
