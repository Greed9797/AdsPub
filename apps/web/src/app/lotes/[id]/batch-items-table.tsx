'use client';

import { Fragment, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Badge, Card, Table, buttonClass, secondaryButtonClass } from '@/components/ui';
import type { AdDraft } from '@/lib/types';
import { ItemEditor } from './item-editor';
import type { SalvarItemPayload } from './item-editor';
import type { ActionResult } from '../actions';

type BatchItemsTableProps = {
  batchId: string;
  items: AdDraft[];
  salvarItemAction: (payload: SalvarItemPayload) => Promise<ActionResult<AdDraft>>;
  removerItemAction: (payload: { batch_id: string; item_id: string }) => Promise<ActionResult<{ ok: true }>>;
  reprocessarItemAction: (payload: {
    batch_id: string;
    item_id: string;
  }) => Promise<ActionResult<{ job_id: string; queue: string }>>;
};

const COLUMNS = 9;

function statusTone(status: AdDraft['status']): 'ok' | 'warn' | 'danger' | 'info' {
  if (status === 'ready' || status === 'published' || status === 'approved') return 'ok';
  if (status === 'blocked' || status === 'failed' || status === 'disapproved') return 'danger';
  if (status === 'draft') return 'info';
  return 'warn';
}

export function BatchItemsTable({
  batchId,
  items,
  salvarItemAction,
  removerItemAction,
  reprocessarItemAction,
}: BatchItemsTableProps) {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | undefined>();
  const [busyId, setBusyId] = useState<string | undefined>();
  const [messageById, setMessageById] = useState<Record<string, { text: string; erro: boolean }>>({});

  const setMessage = (itemId: string, message?: { text: string; erro: boolean }) => {
    setMessageById((previous) => {
      const next = { ...previous };
      if (message) {
        next[itemId] = message;
      } else {
        delete next[itemId];
      }
      return next;
    });
  };

  const handleRemove = async (itemId: string) => {
    if (!window.confirm('Remover este item do lote?')) {
      return;
    }

    setBusyId(itemId);
    setMessage(itemId);

    const result = await removerItemAction({ batch_id: batchId, item_id: itemId });
    setBusyId(undefined);

    if ('erro' in result) {
      setMessage(itemId, { text: result.erro, erro: true });
      return;
    }

    if (expandedId === itemId) {
      setExpandedId(undefined);
    }

    router.refresh();
  };

  const handleRetry = async (itemId: string) => {
    setBusyId(itemId);
    setMessage(itemId);

    const result = await reprocessarItemAction({ batch_id: batchId, item_id: itemId });
    setBusyId(undefined);

    if ('erro' in result) {
      setMessage(itemId, { text: result.erro, erro: true });
      return;
    }

    setMessage(itemId, { text: `Reprocessamento enfileirado (job ${result.data.job_id}).`, erro: false });
    router.refresh();
  };

  return (
    <Card title={`Itens (${items.length})`}>
      <Table head={['#', 'Formato', 'Nome', 'Copy', 'Status', 'Etapa', 'Validação', 'Erro', '']}>
        {items.map((item) => {
          const errors = item.validation?.errors ?? [];
          const warnings = item.validation?.warnings ?? [];
          const policy = item.validation?.policy ?? [];
          const message = messageById[item.id];
          const expanded = expandedId === item.id;

          return (
            <Fragment key={item.id}>
              <tr>
                <td className="px-3 py-2">{item.position}</td>
                <td className="px-3 py-2">{item.format}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  {item.ads_manager_url ? (
                    <a
                      href={item.ads_manager_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--color-brand)]"
                    >
                      {item.name}
                    </a>
                  ) : (
                    item.name
                  )}
                </td>
                <td className="max-w-80 px-3 py-2">
                  <p className="truncate text-xs" title={item.copy.primary_text}>
                    {item.copy.primary_text}
                  </p>
                  <p className="truncate text-xs text-[var(--color-muted)]" title={item.copy.headline}>
                    {item.copy.headline || 'Sem título'} · {item.copy.cta}
                  </p>
                </td>
                <td className="px-3 py-2">
                  <Badge tone={statusTone(item.status)}>{item.status}</Badge>
                </td>
                <td className="px-3 py-2 text-xs text-[var(--color-muted)]">{item.step ?? '-'}</td>
                <td className="space-x-1 px-3 py-2">
                  {errors.length > 0 ? <Badge tone="danger">{errors.length} erro(s)</Badge> : null}
                  {warnings.length > 0 ? <Badge tone="warn">{warnings.length} aviso(s)</Badge> : null}
                  {policy.length > 0 ? (
                    <Badge tone={policy.some((issue) => issue.severity === 'error') ? 'danger' : 'warn'}>
                      política: {policy.length}
                    </Badge>
                  ) : null}
                  {errors.length + warnings.length + policy.length === 0 ? <Badge tone="ok">OK</Badge> : null}
                </td>
                <td className="max-w-64 px-3 py-2 text-xs text-[var(--color-muted)]">
                  {item.error ? (
                    <span title={item.error.fix ?? item.error.code}>
                      {item.error.message}
                      {item.attempts > 0 ? ` (${item.attempts} tentativa(s))` : ''}
                    </span>
                  ) : (
                    '-'
                  )}
                </td>
                <td className="space-x-1 whitespace-nowrap px-3 py-2">
                  <button
                    type="button"
                    className={secondaryButtonClass}
                    onClick={() => setExpandedId(expanded ? undefined : item.id)}
                  >
                    {expanded ? 'Fechar' : 'Editar'}
                  </button>
                  <button
                    type="button"
                    className={secondaryButtonClass}
                    disabled={busyId === item.id}
                    onClick={() => void handleRemove(item.id)}
                  >
                    Remover
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={busyId === item.id || item.status !== 'failed'}
                    onClick={() => void handleRetry(item.id)}
                  >
                    Reprocessar
                  </button>
                </td>
              </tr>

              {message ? (
                <tr>
                  <td
                    colSpan={COLUMNS}
                    className={`px-3 pb-2 text-sm ${
                      message.erro ? 'text-[var(--color-danger)]' : 'text-[var(--color-ok)]'
                    }`}
                  >
                    {message.text}
                  </td>
                </tr>
              ) : null}

              {expanded ? (
                <tr>
                  <td colSpan={COLUMNS} className="px-3 pb-3">
                    <ItemEditor
                      batchId={batchId}
                      item={item}
                      salvarItemAction={salvarItemAction}
                      onSaved={() => setExpandedId(undefined)}
                    />
                  </td>
                </tr>
              ) : null}
            </Fragment>
          );
        })}
      </Table>
    </Card>
  );
}
