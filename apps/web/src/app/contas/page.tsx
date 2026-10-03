import { Card, Empty, PageHead, Table, TableCell, TableRow, fusoLabel, moedaLabel } from '@/components/ui';
import type { AdAccount, Client, Connection } from '@/lib/types';
import { requireSession } from '@/lib/session';
import { api } from '@/lib/api';
import AccountDefaultsForm from './account-defaults-form';
import ConnectionForm from './connection-form';
import {
  criarConexao,
  girarToken,
  salvarDefaults,
  sincronizarConexao,
  testarConexao,
} from './actions';

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
    'Moeda / Região',
    'Cliente',
    'Página',
    'Instagram',
    'Pixel',
    'Limite por dia',
    'Pausada até',
    'Atualizada em',
    'Ver na Meta',
  ];

  return (
    <div className="ap-lotes">
      <PageHead
        title="Conexões Meta"
        description="Conecte empresas, sincronize contas e defina a identidade padrão dos anúncios."
      />

      {isAdmin && !passosCompletos ? (
        <Card title="Primeiros passos">
          <ol className="ap-passos">
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
              <li key={passo.titulo} data-feito={passo.feito ? 'true' : undefined}>
                <span aria-hidden="true" className="ap-passos__n ap-t-num-s">
                  {passo.feito ? '✓' : index + 1}
                </span>
                <div>
                  <p className="ap-t-body-strong">{passo.titulo}</p>
                  <p className="ap-t-small ap-passos__dica">{passo.dica}</p>
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
            <span className="ap-t-num-s ap-passos__dica">{accounts.length}</span>
          ) : undefined
        }
      >
        {accounts.length === 0 ? (
          <Empty
            title="Nenhuma conta disponível"
            hint="Sincronize uma conexão para importar contas."
          />
        ) : (
          <Table head={canEditDefaults ? [...head, 'Padrões'] : head} className="accounts-table">
            {accounts.map((account) => {
              const pausedUntil = account.paused_until;
              const lastSyncedAt = account.last_synced_at;

              return (
                <TableRow key={account.id}>
                  <TableCell>
                    {account.name}
                    <span className="ap-t-ref ap-conta__id">ID {account.id}</span>
                  </TableCell>
                  <TableCell>
                    {moedaLabel(account.currency)} / {fusoLabel(account.timezone_name)}
                  </TableCell>
                  <TableCell>
                    {account.client_id === null
                      ? '—'
                      : (clientNameById.get(account.client_id) ?? account.client_id)}
                  </TableCell>
                  <TableCell>{account.default_page_id ?? '—'}</TableCell>
                  <TableCell>{account.default_ig_user_id ?? '—'}</TableCell>
                  <TableCell>{account.default_pixel_id ?? '—'}</TableCell>
                  <TableCell>
                    {account.daily_ad_cap === null ? '—' : account.daily_ad_cap}
                  </TableCell>
                  <TableCell>
                    {pausedUntil === null ? '—' : dateFormatter.format(new Date(pausedUntil))}
                  </TableCell>
                  <TableCell>
                    {lastSyncedAt === null ? '—' : dateFormatter.format(new Date(lastSyncedAt))}
                  </TableCell>
                  <TableCell>
                    <a href={account.ads_manager_url} target="_blank" rel="noreferrer">
                      Abrir
                    </a>
                  </TableCell>
                  {canEditDefaults ? (
                    <TableCell>
                      <AccountDefaultsForm
                        account={account}
                        clients={clients}
                        salvarDefaults={salvarDefaults}
                      />
                    </TableCell>
                  ) : null}
                </TableRow>
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
