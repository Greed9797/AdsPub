import { Badge, Card, Empty, PageHead, Table } from '@/components/ui';
import type { Client } from '@/lib/types';
import { requireSession } from '@/lib/session';
import { api } from '@/lib/api';
import { atualizarCliente, criarCliente } from './actions';
import ClientForm from './client-form';
import { TableCell, TableRow } from '@astryxdesign/core/Table';

export default async function ClientesPage() {
  const user = await requireSession();
  const canEdit = user.role === 'admin' || user.role === 'coordinator';

  const clientes = await api<Client[]>('/clients');

  const head = ['Nome', 'Política', 'Template de nomeação', 'Domínios', 'Advantage+ desligado'];

  return (
    <div className="space-y-6">
      <PageHead
        title="Clientes"
        description="Gerencie a identidade, as regras e os padrões de anúncio de cada cliente."
        action={canEdit ? <ClientForm mode="create" salvar={criarCliente} /> : undefined}
      />

      <Card
        title="Clientes cadastrados"
        action={
          clientes.length > 0 ? (
            <span className="text-xs tabular-nums text-[var(--color-muted)]">
              {clientes.length}
            </span>
          ) : undefined
        }
      >
        {clientes.length === 0 ? (
          <Empty
            title="Nenhum cliente cadastrado"
            hint="Cadastre um cliente para organizar contas, mídias e regras de publicação."
          />
        ) : (
          <Table head={canEdit ? [...head, 'Ações'] : head}>
            {clientes.map((cliente) => (
              <TableRow key={cliente.id} className="align-top">
                <TableCell>
                  <span className="block">{cliente.name}</span>
                  <span className="block text-xs text-[var(--color-muted)]">{cliente.id}</span>
                </TableCell>
                <TableCell>
                  <Badge tone={cliente.policy_mode === 'block' ? 'danger' : 'warn'}>
                    {cliente.policy_mode === 'block' ? 'Bloquear violações' : 'Avisar'}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs">{cliente.naming_template}</TableCell>
                <TableCell className="text-xs">
                  {cliente.landing_domains.length === 0 ? '—' : cliente.landing_domains.join(', ')}
                </TableCell>
                <TableCell>{cliente.advantage_creative_optout ? 'sim' : 'não'}</TableCell>
                {canEdit ? (
                  <TableCell>
                    <ClientForm mode="edit" client={cliente} salvar={atualizarCliente} />
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
