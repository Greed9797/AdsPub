import { z } from 'zod';
import { Button, Card, Empty, Field, PageHead, inputClass } from '@/components/ui';
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
  const user = await requireSession();
  const raw = await searchParams;
  const clientId = z.string().uuid().safeParse(first(raw.client_id)).data;
  const clients = await api<Client[]>('/clients');

  return (
    <div className="ap-lotes">
      <PageHead
        title="Relatórios"
        description="Importe dados de desempenho em CSV ou Excel para analisar junto aos dados da Meta."
      />
      <form method="get" action="/relatorios" className="ap-lotes__filters">
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
        <Button variant="secondary" label="Usar cliente" type="submit" />
      </form>
      {!clientId ? (
        <Card>
          <Empty
            title="Nenhum cliente selecionado"
            hint="Selecione um cliente para importar relatórios."
          />
        </Card>
      ) : user.role === 'viewer' ? (
        <Card>
          <Empty
            title="Somente leitura"
            hint="Importação restrita a gestor. Peça a um gestor para importar."
          />
        </Card>
      ) : (
        <Card title="Importar CSV/XLSX">
          <RelatorioForm clientId={clientId} />
        </Card>
      )}
    </div>
  );
}
