'use client';

import { Fragment, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Badge, Card, ctaLabel, formatLabel, plural, statusLabel, Table } from '@/components/ui';
import type { AdDraft } from '@/lib/types';
import { ItemEditor } from './item-editor';
import type { SalvarItemPayload } from './item-editor';
import type { ActionResult } from '../actions';
import { Button } from '@astryxdesign/core/Button';
import { TableCell, TableRow } from '@astryxdesign/core/Table';

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
              <TableRow>
                <TableCell>{item.position}</TableCell>
                  <TableCell>{formatLabel(item.format)}</TableCell>
                <TableCell className="whitespace-nowrap">
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
                </TableCell>
                <TableCell className="max-w-80">
                  <p className="truncate text-xs" title={item.copy.primary_text}>
                    {item.copy.primary_text}
                  </p>
                  <p className="truncate text-xs text-[var(--color-muted)]" title={item.copy.headline}>
                    {item.copy.headline || 'Sem título'} · {ctaLabel(item.copy.cta)}
                  </p>
                </TableCell>
                <TableCell>
                    <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
                </TableCell>
                  <TableCell className="text-xs text-[var(--color-muted)]">{item.step ? statusLabel(item.step) : '-'}</TableCell>
                <TableCell className="space-x-1">
                  {errors.length > 0 ? <Badge tone="danger">{plural(errors.length, 'erro', 'erros')}</Badge> : null}
                  {warnings.length > 0 ? <Badge tone="warn">{plural(warnings.length, 'aviso', 'avisos')}</Badge> : null}
                  {policy.length > 0 ? (
                    <Badge tone={policy.some((issue) => issue.severity === 'error') ? 'danger' : 'warn'}>
                      política: {policy.length}
                    </Badge>
                  ) : null}
                  {errors.length + warnings.length + policy.length === 0 ? <Badge tone="ok">OK</Badge> : null}
                </TableCell>
                <TableCell className="max-w-64 text-xs text-[var(--color-muted)]">
                  {item.error ? (
                    <span title={item.error.fix ?? item.error.code}>
                      {item.error.message}
                      {item.attempts > 0 ? ` (${plural(item.attempts, 'tentativa', 'tentativas')})` : ''}
                    </span>
                  ) : (
                    '-'
                  )}
                </TableCell>
                <TableCell className="space-x-1 whitespace-nowrap">
                  <Button variant="secondary" label={expanded ? 'Fechar' : 'Editar'} onClick={() => setExpandedId(expanded ? undefined : item.id)} />
                  <Button variant="secondary" label="Remover" isDisabled={busyId === item.id} onClick={() => void handleRemove(item.id)} />
                  <Button variant="primary" label="Reprocessar" isDisabled={busyId === item.id || item.status !== 'failed'} onClick={() => void handleRetry(item.id)} />
                </TableCell>
              </TableRow>

              {message ? (
                <TableRow>
                  <TableCell colSpan={COLUMNS}
                    className={`px-3 pb-2 text-sm ${
                      message.erro ? 'text-[var(--color-danger)]' : 'text-[var(--color-ok)]'
                    }`}>
                    {message.text}
                  </TableCell>
                </TableRow>
              ) : null}

              {expanded ? (
                <TableRow>
                  <TableCell colSpan={COLUMNS} className="pb-3">
                    <ItemEditor
                      batchId={batchId}
                      item={item}
                      salvarItemAction={salvarItemAction}
                      onSaved={() => setExpandedId(undefined)}
                    />
                  </TableCell>
                </TableRow>
              ) : null}
            </Fragment>
          );
        })}
      </Table>
    </Card>
  );
}
