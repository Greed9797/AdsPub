import { Card, Empty, PageHead, Table } from '@/components/ui';
import type { AdAccount, Client, Connection } from '@/lib/types';
import { requireSession } from '@/lib/session';
import { api } from '@/lib/api';
import AccountDefaultsForm from './account-defaults-form';
import ConnectionForm from './connection-form';
import { criarConexao, girarToken, salvarDefaults, sincronizarConexao, testarConexao } from './actions';

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

export default async function ContasPage() {
  const user = await requireSession();
  const isAdmin = user.role === 'admin';
  const canEditDefaults = isAdmin || user.role === 'coordinator';

  const [accounts, clients, connections] = await Promise.all([
    api<AdAccount[]>('/ad-accounts'),
    api<Client[]>('/clients'),
    isAdmin ? api<Connection[]>('/connections') : Promise.resolve<Connection[]>([]),
  ]);

  const clientNameById = new Map(clients.map((client) => [client.id, client.name]));

  // Ativação: etapas derivadas do estado real, sem persistência extra.
  const temConexao = connections.length > 0;
  const temConta = accounts.length > 0;
  const temVinculo = accounts.some((account) => account.client_id !== null);
  const passosCompletos = temConexao && temConta && temVinculo;

  const head = [
    'Conta',
    'Moeda / Fuso',
    'Cliente',
    'Página',
    'Instagram',
    'Pixel',
    'Teto diário',
    'Pausada até',
    'Último sync',
    'Ads Manager',
  ];

  return (
    <div className="space-y-6">
      <PageHead title="Contas" description="Conexões, contas de anúncio e padrões de publicação." />

      {isAdmin && !passosCompletos ? (
        <Card title="Primeiros passos">
          <ol className="space-y-3">
            {[
              {
                feito: temConexao,
                titulo: 'Conecte a Business Manager',
                dica: 'Crie a conexão com o token do app Meta no formulário abaixo.',
              },
              {
                feito: temConta,
                titulo: 'Sincronize as contas',
                dica: 'Use “Sincronizar” na conexão para importar as contas de anúncio.',
              },
              {
                feito: temVinculo,
                titulo: 'Vincule um cliente',
                dica: 'Em Clientes, cadastre e volte aqui para definir os padrões da conta.',
              },
            ].map((passo, index) => (
              <li key={passo.titulo} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums ${
                    passo.feito
                      ? 'border-[var(--color-ok)] bg-[var(--color-ok)]/15 text-[var(--color-ok)]'
                      : 'border-[var(--color-border)] text-[var(--color-muted)]'
                  }`}
                >
                  {passo.feito ? (
                    <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2.5 6.5 5 9l4.5-6" />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </span>
                <div>
                  <p className="text-sm font-semibold">{passo.titulo}</p>
                  <p className="text-sm text-[var(--color-muted)]">{passo.dica}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      <Card
        title="Contas de anúncio"
        action={
          accounts.length > 0 ? (
            <span className="text-xs tabular-nums text-[var(--color-muted)]">{accounts.length}</span>
          ) : undefined
        }
      >
        {accounts.length === 0 ? (
          <Empty>Nenhuma conta disponível. Sincronize uma conexão para importar contas.</Empty>
        ) : (
          <Table head={canEditDefaults ? [...head, 'Defaults'] : head}>
            {accounts.map((account) => {
              const pausedUntil = account.paused_until;
              const lastSyncedAt = account.last_synced_at;

              return (
                <tr key={account.id} className="align-top">
                  <td className="px-3 py-2">
                    <span className="block">{account.name}</span>
                    <span className="block text-xs text-[var(--color-muted)]">{account.id}</span>
                  </td>
                  <td className="px-3 py-2">
                    {account.currency} / {account.timezone_name}
                  </td>
                  <td className="px-3 py-2">
                    {account.client_id === null
                      ? '—'
                      : clientNameById.get(account.client_id) ?? account.client_id}
                  </td>
                  <td className="px-3 py-2">{account.default_page_id ?? '—'}</td>
                  <td className="px-3 py-2">{account.default_ig_user_id ?? '—'}</td>
                  <td className="px-3 py-2">{account.default_pixel_id ?? '—'}</td>
                  <td className="px-3 py-2">
                    {account.daily_ad_cap === null ? '—' : account.daily_ad_cap}
                  </td>
                  <td className="px-3 py-2">
                    {pausedUntil === null ? '—' : dateFormatter.format(new Date(pausedUntil))}
                  </td>
                  <td className="px-3 py-2">
                    {lastSyncedAt === null ? '—' : dateFormatter.format(new Date(lastSyncedAt))}
                  </td>
                  <td className="px-3 py-2">
                    <a
                      href={account.ads_manager_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--color-brand)] underline"
                    >
                      Abrir
                    </a>
                  </td>
                  {canEditDefaults ? (
                    <td className="px-3 py-2">
                      <AccountDefaultsForm account={account} salvarDefaults={salvarDefaults} />
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      {isAdmin ? (
        <Card title="Conexões da Business Manager">
          <ConnectionForm
            connections={connections}
            criarConexao={criarConexao}
            testarConexao={testarConexao}
            sincronizarConexao={sincronizarConexao}
            girarToken={girarToken}
          />
        </Card>
      ) : null}
    </div>
  );
}
