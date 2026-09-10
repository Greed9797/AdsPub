import { Card, Empty, Eyebrow, Field, buttonClass, inputClass } from '@/components/ui';
import { api } from '@/lib/api';
import { requireSession } from '@/lib/session';
import type { AdAccount } from '@/lib/types';
import { InteligenciaForm } from './inteligencia-form';

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
  await requireSession();
  const raw = await searchParams;
  const accountId = first(raw.ad_account_id);
  const accounts = await api<AdAccount[]>('/ad-accounts');
  const selected = accounts.find((a) => a.id === accountId);

  return (
    <div className="space-y-6">
      <Eyebrow>Fatos, hipóteses e próximos testes</Eyebrow>
      <h1 className="text-2xl font-semibold tracking-[-0.03em]">Inteligência</h1>
      <Card title="Conta">
        <form method="get" action="/inteligencia" className="flex items-end gap-3">
          <Field label="Conta">
            <select name="ad_account_id" defaultValue={accountId ?? ''} className={inputClass}>
              <option value="">Selecione</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </Field>
          <button className={buttonClass} type="submit">
            Usar conta
          </button>
        </form>
      </Card>
      {!accountId || !selected?.client_id ? (
        <Card>
          <Empty>Selecione uma conta para gerar relatórios.</Empty>
        </Card>
      ) : (
        <Card title="Relatório de criativos">
          <InteligenciaForm accountId={accountId} clientId={selected.client_id} />
        </Card>
      )}
    </div>
  );
}
