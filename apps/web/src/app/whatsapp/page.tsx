import Link from 'next/link';
import { TableCell, TableRow } from '@astryxdesign/core/Table';
import { Badge, Card, Empty, PageHead, Table } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import type { Client } from '@/lib/types';
import { requireSession } from '@/lib/session';
import { ConnectForm } from './connect-form';
import { SendForm } from './send-form';
import { TemplateForm } from './template-form';
import type { WhatsappAccount, WhatsappPhone, WhatsappTemplate } from './types';

const WRITERS = new Set(['admin', 'coordinator', 'manager']);

async function readGraph<T>(path: string): Promise<{ data: T | null; erro: string | null }> {
  try {
    return { data: await api<T>(path), erro: null };
  } catch (error) {
    if (error instanceof ApiError) return { data: null, erro: error.problem.detail ?? error.problem.title };
    throw error;
  }
}

export default async function WhatsappPage({
  searchParams,
}: {
  searchParams: Promise<{ conta?: string }>;
}) {
  const user = await requireSession();
  const canWrite = WRITERS.has(user.role);
  const { conta } = await searchParams;

  const [accounts, clients] = await Promise.all([
    api<WhatsappAccount[]>('/whatsapp-accounts'),
    api<Client[]>('/clients'),
  ]);
  const clientName = new Map(clients.map((client) => [client.id, client.name]));
  const selected = accounts.find((account) => account.id === conta) ?? null;

  const phones = selected
    ? await readGraph<WhatsappPhone[]>(`/whatsapp-accounts/${selected.id}/phone-numbers`)
    : { data: null, erro: null };
  const templates = selected
    ? await readGraph<WhatsappTemplate[]>(`/whatsapp-accounts/${selected.id}/templates`)
    : { data: null, erro: null };
  const graphError = phones.erro ?? templates.erro;

  return (
    <div className="space-y-6">
      <PageHead
        title="WhatsApp"
        description="Conta, modelos e envio de modelo. Cadastro de número, webhook, pagamento, verificação do negócio e texto livre na janela de 24 horas continuam no Gerenciador da Meta."
      />

      {accounts.length === 0 ? (
        <Empty title="Nenhuma conta WhatsApp" hint="Conecte um número com o token de system user." />
      ) : (
        <Card title="Contas">
          <Table head={['Conta', 'Cliente', 'Número', 'WABA', 'Estado']}>
            {accounts.map((account) => (
              <TableRow key={account.id}>
                <TableCell>
                  <Link href={`/whatsapp?conta=${account.id}`}>{account.display_name || account.phone_number_id}</Link>
                </TableCell>
                <TableCell>{clientName.get(account.client_id) ?? '—'}</TableCell>
                <TableCell>{account.display_phone || account.phone_number_id}</TableCell>
                <TableCell>{account.waba_id}</TableCell>
                <TableCell>
                  <Badge
                    tone={account.last_error || (selected?.id === account.id && graphError) ? 'warn' : 'ok'}
                  >
                    {account.last_error || (selected?.id === account.id && graphError) ? 'Erro' : 'Ativa'}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </Table>
        </Card>
      )}

      {canWrite ? (
        <Card title="Conectar conta">
          <ConnectForm clients={clients} />
        </Card>
      ) : (
        <p className="text-sm">Leitor consulta contas e modelos. Não conecta nem envia.</p>
      )}

      {selected ? (
        <Card title={selected.display_name || selected.display_phone || 'Conta'}>
          {graphError ? (
            <p role="alert" className="notice notice-error mb-4">
              {graphError}
            </p>
          ) : null}
          {selected.last_error && !graphError ? (
            <p role="alert" className="notice notice-error mb-4">
              {selected.last_error}
            </p>
          ) : null}
          <Table head={['Número', 'Nome verificado', 'Estado']}>
            {(phones.data ?? []).map((phone) => (
              <TableRow key={phone.id}>
                <TableCell>{phone.display_phone_number || phone.id}</TableCell>
                <TableCell>{phone.verified_name || '—'}</TableCell>
                <TableCell>{phone.status || '—'}</TableCell>
              </TableRow>
            ))}
          </Table>
          {(phones.data ?? []).length === 0 && !phones.erro ? (
            <p className="mt-3 text-sm">Nenhum número devolvido pela Meta.</p>
          ) : null}

          <div className="mt-6">
            <Table head={['Modelo', 'Idioma', 'Categoria', 'Estado']}>
              {(templates.data ?? []).map((template) => (
                <TableRow key={template.id}>
                  <TableCell>{template.name}</TableCell>
                  <TableCell>{template.language || '—'}</TableCell>
                  <TableCell>{template.category || '—'}</TableCell>
                  <TableCell>{template.status || '—'}</TableCell>
                </TableRow>
              ))}
            </Table>
            {(templates.data ?? []).length === 0 && !templates.erro ? (
              <p className="mt-3 text-sm">Nenhum modelo nesta conta.</p>
            ) : null}
          </div>

          {canWrite ? (
            <div className="mt-6 space-y-6">
              <TemplateForm accountId={selected.id} />
              <SendForm
                accountId={selected.id}
                templates={templates.data ?? []}
                displayPhone={selected.display_phone}
              />
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
