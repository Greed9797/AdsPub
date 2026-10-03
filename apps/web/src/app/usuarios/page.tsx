import { Card, Empty, PageHead, Selo, Table, TableCell, TableRow } from '@/components/ui';
import { api } from '@/lib/api';
import { ROTULO_DO_PAPEL } from '@/lib/papeis';
import { requireRole } from '@/lib/session';
import type { AdAccount } from '@/lib/types';
import { UserRowForm } from './user-row-form';
import { UserCreateForm } from './user-create-form';
import type { Usuario } from './actions';

export default async function UsuariosPage() {
  await requireRole(['admin']);

  const users = await api<Usuario[]>('/users');
  const accounts = await api<AdAccount[]>('/ad-accounts');

  const accountById = new Map(accounts.map((account) => [account.id, account.name] as const));

  return (
    <div className="ap-lotes">
      <PageHead title="Usuários" description="Papéis e contas atribuídas a cada usuário. Só o admin cria usuários." />

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
                  <TableCell>
                    <Selo tone={user.role === 'admin' ? 'ativa' : user.role === 'viewer' ? 'leitura' : 'neutro'} label={ROTULO_DO_PAPEL[user.role]} />
                  </TableCell>
                  <TableCell>
                    <Selo tone={user.active ? 'publicado' : 'neutro'} label={user.active ? 'Ativo' : 'Inativo'} />
                  </TableCell>
                  <TableCell>
                    {user.role === 'admin' || user.role === 'coordinator'
                      ? 'todas'
                      : assigned.length === 0
                        ? 'Nenhuma'
                        : assigned.join(', ')}
                  </TableCell>
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
