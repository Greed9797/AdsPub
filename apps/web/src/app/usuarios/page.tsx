import { Card, Empty, Table } from '@/components/ui';
import { api } from '@/lib/api';
import { requireRole } from '@/lib/session';
import type { AdAccount } from '@/lib/types';
import { UserRowForm } from './user-row-form';
import type { Usuario } from './actions';

export default async function UsuariosPage() {
  await requireRole(['admin']);

  const users = await api<Usuario[]>('/users');
  const accounts = await api<AdAccount[]>('/ad-accounts');

  const accountById = new Map(accounts.map((account) => [account.id, account.name] as const));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Usuários</h1>

      <Card title="Gerenciar usuários">
        {users.length === 0 ? (
          <Empty>Nenhum usuário encontrado.</Empty>
        ) : (
          <Table head={['E-mail', 'Nome', 'Papel', 'Contas atribuídas', 'Ações']}>
            {users.map((user) => {
              const assigned = user.ad_account_ids
                .map((id) => accountById.get(id))
                .filter((name): name is string => typeof name === 'string');

              return (
                <tr key={user.id}>
                  <td className="px-3 py-2">{user.email}</td>
                  <td className="px-3 py-2">{user.name || '—'}</td>
                  <td className="px-3 py-2">{user.role}</td>
                  <td className="px-3 py-2">{assigned.length === 0 ? 'Nenhuma' : assigned.join(', ')}</td>
                  <td className="px-3 py-2">
                    <UserRowForm user={user} accounts={accounts} />
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </div>
  );
}
