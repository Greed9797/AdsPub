import { Badge, Card, Empty, Table } from '@/components/ui';
import type { Client } from '@/lib/types';
import { requireSession } from '@/lib/session';
import { api } from '@/lib/api';
import { atualizarCliente, criarCliente } from './actions';
import ClientForm from './client-form';

export default async function ClientesPage() {
  const user = await requireSession();
  const canEdit = user.role === 'admin' || user.role === 'coordinator';

  const clientes = await api<Client[]>('/clients');

  const head = ['Nome', 'Política', 'Template de nomeação', 'Domínios', 'Advantage+ desligado'];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Clientes</h1>

      {canEdit ? (
        <Card title="Novo cliente">
          <ClientForm mode="create" salvar={criarCliente} />
        </Card>
      ) : null}

      <Card title="Clientes cadastrados">
        {clientes.length === 0 ? (
          <Empty>Nenhum cliente cadastrado.</Empty>
        ) : (
          <Table head={canEdit ? [...head, 'Ações'] : head}>
            {clientes.map((cliente) => (
              <tr key={cliente.id} className="align-top">
                <td className="px-3 py-2">
                  <span className="block">{cliente.name}</span>
                  <span className="block text-xs text-[var(--color-muted)]">{cliente.id}</span>
                </td>
                <td className="px-3 py-2">
                  <Badge tone={cliente.policy_mode === 'block' ? 'danger' : 'warn'}>
                    {cliente.policy_mode}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-xs">{cliente.naming_template}</td>
                <td className="px-3 py-2 text-xs">
                  {cliente.landing_domains.length === 0
                    ? '—'
                    : cliente.landing_domains.join(', ')}
                </td>
                <td className="px-3 py-2">{cliente.advantage_creative_optout ? 'sim' : 'não'}</td>
                {canEdit ? (
                  <td className="px-3 py-2">
                    <ClientForm mode="edit" client={cliente} salvar={atualizarCliente} />
                  </td>
                ) : null}
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
