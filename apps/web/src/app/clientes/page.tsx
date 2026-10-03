import { Card, Empty, PageHead, Selo, Table, TableCell, TableRow } from '@/components/ui';
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
    <div className="ap-lotes">
      <PageHead
        title="Clientes"
        description="Gerencie a identidade, as regras e os padrões de anúncio de cada cliente."
        action={canEdit ? <ClientForm mode="create" salvar={criarCliente} /> : undefined}
      />

      <Card
        title="Clientes cadastrados"
        action={
          clientes.length > 0 ? (
            <span className="ap-t-num-s ap-passos__dica">{clientes.length}</span>
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
              <TableRow key={cliente.id}>
                <TableCell>
                  <span className="ap-t-body-strong ap-conta__name">{cliente.name}</span>
                  <span className="ap-t-ref ap-conta__id">{cliente.id}</span>
                </TableCell>
                <TableCell>
                  <Selo
                    tone={cliente.policy_mode === 'block' ? 'bloqueado' : 'rascunho'}
                    label={cliente.policy_mode === 'block' ? 'Bloquear violações' : 'Avisar'}
                  />
                </TableCell>
                <TableCell className="ap-t-ref">{cliente.naming_template}</TableCell>
                <TableCell className="ap-t-small">
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
