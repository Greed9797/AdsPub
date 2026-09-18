import { Card, Empty, Field, PageHead, inputClass } from '@/components/ui';
import { api } from '@/lib/api';
import { requireSession } from '@/lib/session';
import type { AdAccount } from '@/lib/types';
import { InteligenciaForm } from './inteligencia-form';
import { Button } from '@astryxdesign/core/Button';

type SearchParams = { ad_account_id?: string | string[] };

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/** T-007-3: gerar relatório, comentar e transformar em rascunho. */
export default async function InteligenciaPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireSession();
  const raw = await searchParams;
  const accountId = first(raw.ad_account_id);
  const accounts = await api<AdAccount[]>('/ad-accounts');
  const selected = accounts.find((a) => a.id === accountId);

  return (
    <div className="space-y-6">
      <PageHead
        title="Inteligência"
        description="Transforme dados de desempenho e análises de criativos em hipóteses para os próximos anúncios."
      />
      <form method="get" action="/inteligencia" className="toolbar">
        <Field label="Conta" className="w-full sm:w-64">
          <select name="ad_account_id" defaultValue={accountId ?? ''} className={inputClass}>
            <option value="">Selecione</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </Field>
        <Button variant="secondary" label="Usar conta" type="submit" />
      </form>
      {!accountId || !selected?.client_id ? (
        <Card>
          <Empty
            title="Nenhuma conta selecionada"
            hint="Selecione uma conta para gerar relatórios."
          />
        </Card>
      ) : user.role === 'viewer' ? (
        <Card>
          <Empty
            title="Somente leitura"
            hint="Geração de relatório restrita a gestor. Peça a um gestor para gerar."
          />
        </Card>
      ) : (
        <Card title="Relatório de criativos">
          <InteligenciaForm accountId={accountId} clientId={selected.client_id} />
        </Card>
      )}
    </div>
  );
}
