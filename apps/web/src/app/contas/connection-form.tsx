"use client";

import { useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Selo, Table, TableCell, TableRow, inputClass } from '@/components/ui';
import type { Connection } from '@/lib/types';
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

const STATUS_TONE: Record<Connection['status'], 'ativa' | 'conferir' | 'falhou'> = {
  active: 'ativa',
  needs_attention: 'conferir',
  revoked: 'falhou',
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
            : 'Sincronização pedida. O resultado aparece em "Último check" e, se falhar, em "Último erro".',
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
    <div className="ap-conexoes">
      <form onSubmit={handleCreate} className="ap-conexoes__form">
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

        <div className="ap-conexoes__submit">
          <Button variant="primary" label={isCreatePending ? 'Salvando...' : 'Criar conexão'} type="submit" isDisabled={isCreatePending} />
        </div>

        {erro ? <p role="alert" className="ap-note ap-conexoes__msg" data-tone="danger">{erro}</p> : null}
        {sucesso ? <p role="status" className="ap-note ap-conexoes__msg">{sucesso}</p> : null}
      </form>

      {connections.length === 0 ? (
        <p className="ap-t-small ap-passos__dica">Nenhuma conexão cadastrada.</p>
      ) : (
        <Table
          head={['Rótulo', 'ID da empresa', 'Situação', 'Nível', 'Último check', 'Último erro', 'Ações', 'Resultado']}
        >
          {connections.map((connection) => {
            const isBusy = busyId === connection.id;
            const lastChecked = connection.last_checked_at;

            return (
              <TableRow key={connection.id}>
                <TableCell>{connection.label}</TableCell>
                <TableCell>{connection.business_id}</TableCell>
                <TableCell>
                  <Selo tone={STATUS_TONE[connection.status]} label={CONN_STATUS_PT[connection.status]} />
                </TableCell>
                <TableCell>{TIER_PT[connection.api_tier] ?? connection.api_tier}</TableCell>
                <TableCell>
                  {lastChecked === null ? '—' : dateFormatter.format(new Date(lastChecked))}
                </TableCell>
                <TableCell className="ap-conexoes__erro">
                  {connection.last_error ?? '—'}
                </TableCell>
                <TableCell>
                  <div className="ap-conexoes__acoes">
                    <Button variant="secondary" size="sm" label={isBusy ? 'Aguarde...' : 'Testar'} isDisabled={isBusy} onClick={() => handleTest(connection.id)} />
                    <Button variant="primary" size="sm" label={isBusy ? 'Aguarde...' : 'Sincronizar'} isDisabled={isBusy} onClick={() => handleSync(connection.id)} />
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
                    <Button variant="secondary" size="sm" label={isBusy ? 'Aguarde...' : 'Trocar token'} isDisabled={isBusy} onClick={() => handleRotate(connection.id)} />
                  </div>
                </TableCell>
                <TableCell className="ap-conexoes__resultado">
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
