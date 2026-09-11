"use client";

import { useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { inputClass, Badge, Table, Field } from '@/components/ui';
import type { Connection } from '@/lib/types';
import { Button } from '@astryxdesign/core/Button';
import { TableCell, TableRow } from '@astryxdesign/core/Table';
import type {
  ActionResult,
  ConnectionInput,
  SyncConnectionResult,
  TestConnectionResult,
} from './actions';

interface ConnectionPanelProps {
  connections: Connection[];
  criarConexao: (payload: ConnectionInput) => Promise<ActionResult>;
  testarConexao: (connectionId: string) => Promise<TestConnectionResult>;
  sincronizarConexao: (connectionId: string) => Promise<SyncConnectionResult>;
  girarToken: (connectionId: string, token: string) => Promise<TestConnectionResult>;
}

const STATUS_TONE: Record<Connection['status'], string> = {
  active: 'ok',
  needs_attention: 'warn',
  revoked: 'danger',
};

const CONN_STATUS_PT: Record<Connection['status'], string> = {
  active: 'Ativa',
  needs_attention: 'Precisa de atenção',
  revoked: 'Revogada',
};

const TIER_PT: Record<string, string> = {
  development: 'Testes',
  standard: 'Normal',
  limited: 'Limitado',
  unknown: '—',
};

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

export default function ConnectionForm({
  connections,
  criarConexao,
  testarConexao,
  sincronizarConexao,
  girarToken,
}: ConnectionPanelProps) {
  const router = useRouter();

  const [businessId, setBusinessId] = useState('');
  const [label, setLabel] = useState('');
  const [token, setToken] = useState('');

  const [isCreatePending, startCreateTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowMessages, setRowMessages] = useState<Record<string, string>>({});

  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const handleCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setErro(null);
    setSucesso(null);

    startCreateTransition(() => {
      void criarConexao({ business_id: businessId, label, token }).then((result) => {
        if ('erro' in result) {
          setErro(result.erro);
          return;
        }

        setBusinessId('');
        setLabel('');
        setToken('');
        setSucesso('Conexão criada com sucesso.');
        router.refresh();
      });
    });
  };

  const handleTest = (connectionId: string) => {
    setBusyId(connectionId);

    void testarConexao(connectionId).then((result) => {
      setRowMessages((prev) => ({
        ...prev,
        [connectionId]:
          'erro' in result
            ? result.erro
            : 'Ligação funcionando. Pode sincronizar.',
      }));
      setBusyId(null);
      router.refresh();
    });
  };

  const handleSync = (connectionId: string) => {
    setBusyId(connectionId);

    void sincronizarConexao(connectionId).then((result) => {
      setRowMessages((prev) => ({
        ...prev,
        [connectionId]:
          'erro' in result
            ? result.erro
            : 'Buscando contas, aguarde e recarregue a página.',
      }));
      setBusyId(null);
      router.refresh();
    });
  };

  const [rotateTokens, setRotateTokens] = useState<Record<string, string>>({});

  const handleRotate = (connectionId: string) => {
    const novoToken = (rotateTokens[connectionId] ?? '').trim();
    if (!novoToken) {
      setRowMessages((prev) => ({ ...prev, [connectionId]: 'Cole o novo token antes de trocar.' }));
      return;
    }
    setBusyId(connectionId);

    void girarToken(connectionId, novoToken).then((result) => {
      setRowMessages((prev) => ({
        ...prev,
        [connectionId]:
          'erro' in result ? result.erro : 'Token trocado e conexão reativada.',
      }));
      if (!('erro' in result)) {
        setRotateTokens((prev) => ({ ...prev, [connectionId]: '' }));
      }
      setBusyId(null);
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleCreate} className="grid gap-3 sm:grid-cols-3">
        <Field label="ID da empresa">
          <input
            value={businessId}
            onChange={(event) => setBusinessId(event.target.value)}
            className={inputClass}
            placeholder="Só números, ex.: 123456789"
          />
        </Field>

        <Field label="Rótulo">
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            className={inputClass}
            placeholder="Ex.: BM principal"
          />
        </Field>

        <Field label="Token de acesso" hint="Armazenado cifrado pela API.">
          <input
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            className={inputClass}
            placeholder="EAA..."
          />
        </Field>

        <div className="sm:col-span-3">
          <Button variant="primary" label={isCreatePending ? 'Salvando...' : 'Criar conexão'} type="submit" isDisabled={isCreatePending} />
        </div>

        {erro ? <p className="text-sm text-[var(--color-danger)] sm:col-span-3">{erro}</p> : null}
        {sucesso ? <p className="text-sm text-[var(--color-ok)] sm:col-span-3">{sucesso}</p> : null}
      </form>

      {connections.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">Nenhuma conexão cadastrada.</p>
      ) : (
        <Table
          head={['Rótulo', 'ID da empresa', 'Situação', 'Nível', 'Último check', 'Último erro', 'Ações', 'Resultado']}
        >
          {connections.map((connection) => {
            const isBusy = busyId === connection.id;
            const lastChecked = connection.last_checked_at;

            return (
              <TableRow key={connection.id} className="align-top">
                <TableCell>{connection.label}</TableCell>
                <TableCell>{connection.business_id}</TableCell>
                <TableCell>
                  <Badge tone={STATUS_TONE[connection.status]}>{CONN_STATUS_PT[connection.status]}</Badge>
                </TableCell>
                <TableCell>{TIER_PT[connection.api_tier] ?? connection.api_tier}</TableCell>
                <TableCell>
                  {lastChecked === null ? '—' : dateFormatter.format(new Date(lastChecked))}
                </TableCell>
                <TableCell className="text-xs text-[var(--color-danger)]">
                  {connection.last_error ?? '—'}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" label={isBusy ? 'Aguarde...' : 'Testar'} isDisabled={isBusy} onClick={() => handleTest(connection.id)} />
                    <Button variant="primary" label={isBusy ? 'Aguarde...' : 'Sincronizar'} isDisabled={isBusy} onClick={() => handleSync(connection.id)} />
                    <input
                      type="password"
                      value={rotateTokens[connection.id] ?? ''}
                      onChange={(event) =>
                        setRotateTokens((prev) => ({ ...prev, [connection.id]: event.target.value }))
                      }
                      className={inputClass}
                      placeholder="Novo token (EAA...)"
                      aria-label={`Novo token para ${connection.label}`}
                    />
                    <Button variant="secondary" label={isBusy ? 'Aguarde...' : 'Trocar token'} isDisabled={isBusy} onClick={() => handleRotate(connection.id)} />
                  </div>
                </TableCell>
                <TableCell className="text-xs text-[var(--color-muted)]">
                  {rowMessages[connection.id] ?? '—'}
                </TableCell>
              </TableRow>
            );
          })}
        </Table>
      )}
    </div>
  );
}
