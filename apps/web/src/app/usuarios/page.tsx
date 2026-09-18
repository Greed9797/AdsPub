import { Card, Empty, PageHead, Table } from '@/components/ui';
import { api } from '@/lib/api';
import { requireRole } from '@/lib/session';
import type { AdAccount } from '@/lib/types';
import { UserRowForm } from './user-row-form';
import { UserCreateForm } from './user-create-form';
import type { Usuario } from './actions';
import { TableCell, TableRow } from '@astryxdesign/core/Table';

export default async function UsuariosPage() {
  await requireRole(['admin']);

  const users = await api<Usuario[]>('/users');
  const accounts = await api<AdAccount[]>('/ad-accounts');

  const accountById = new Map(accounts.map((account) => [account.id, account.name] as const));

  return (
    <div className="space-y-6">
      <PageHead title="Usuários" description="Papéis e contas atribuídas a cada usuário." />

      <UserCreateForm />

      <Card title="Gerenciar usuários">
        {users.length === 0 ? (
          <Empty title="Nenhum usuário encontrado" />
        ) : (
          <Table head={['E-mail', 'Nome', 'Papel', 'Status', 'Contas atribuídas', 'Ações']}>
            {users.map((user) => {
              const assigned = user.ad_account_ids
                .map((id) => accountById.get(id))
                .filter((name): name is string => typeof name === 'string');

              return (
                <TableRow key={user.id}>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.name || '—'}</TableCell>
                  <TableCell>{user.role}</TableCell>
                  <TableCell>{user.active ? 'Ativo' : 'Inativo'}</TableCell>
                  <TableCell>{assigned.length === 0 ? 'Nenhuma' : assigned.join(', ')}</TableCell>
                  <TableCell>
                    <UserRowForm user={user} accounts={accounts} />
                  </TableCell>
                </TableRow>
              );
            })}
          </Table>
        )}
      </Card>
    </div>
  );
}
