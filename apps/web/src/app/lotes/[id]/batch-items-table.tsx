'use client';

import { Fragment, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Badge, Card, ctaLabel, formatLabel, plural, statusLabel, Table } from '@/components/ui';
import type { AdDraft, Asset } from '@/lib/types';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ItemEditor } from './item-editor';
import type { SalvarItemPayload } from './item-editor';
import type { ActionResult } from '../actions';
import { Button } from '@astryxdesign/core/Button';
import { TableCell, TableRow } from '@astryxdesign/core/Table';

type BatchItemsTableProps = {
  batchId: string;
  items: AdDraft[];
  assets: Asset[];
  canEdit: boolean;
  salvarItemAction: (payload: SalvarItemPayload) => Promise<ActionResult<AdDraft>>;
  removerItemAction: (payload: {
    batch_id: string;
    item_id: string;
  }) => Promise<ActionResult<{ ok: true }>>;
  reprocessarItemAction: (payload: {
    batch_id: string;
    item_id: string;
  }) => Promise<ActionResult<{ job_id: string; queue: string }>>;
};

const COLUMNS = 6;

/** Mesma regra da API: item em voo ou publicado sai da revisão. */
const EDITAVEIS: ReadonlySet<AdDraft['status']> = new Set(['draft', 'blocked', 'ready', 'failed']);
const EM_VOO: ReadonlySet<AdDraft['status']> = new Set([
  'queued',
  'uploading_media',
  'ensuring_campaign',
  'ensuring_adset',
  'creating_creative',
  'creating_ad',
]);

/**
 * `ad_review_feedback` da Meta vem como `{ global: { CODIGO: motivo } }` (e às
 * vezes por posicionamento). Sem achatar, o motivo da reprovação fica só no
 * banco e a revisão do lote não diz por que o anúncio caiu.
 */
function motivosDaRevisao(feedback: unknown): string[] {
  if (!feedback || typeof feedback !== 'object') return [];
  const motivos: string[] = [];
  for (const grupo of Object.values(feedback as Record<string, unknown>)) {
    if (!grupo || typeof grupo !== 'object') continue;
    for (const motivo of Object.values(grupo as Record<string, unknown>)) {
      if (typeof motivo === 'string' && motivo.trim()) motivos.push(motivo);
    }
  }
  return motivos;
}

/** `effective_status` da Meta em PT; desconhecido aparece como veio. */
const REVISAO_PT: Record<string, string> = {
  ACTIVE: 'veiculando',
  PAUSED: 'pausado',
  PENDING_REVIEW: 'em análise',
  DISAPPROVED: 'reprovado',
  WITH_ISSUES: 'com pendências',
  PREAPPROVED: 'pré-aprovado',
  PENDING_BILLING_INFO: 'aguardando forma de pagamento',
  CAMPAIGN_PAUSED: 'campanha pausada',
  ADSET_PAUSED: 'conjunto pausado',
  ARCHIVED: 'arquivado',
  DELETED: 'excluído',
};

function revisaoLabel(status: string): string {
  return REVISAO_PT[status] ?? status;
}

function statusTone(status: AdDraft['status']): 'ok' | 'warn' | 'danger' | 'info' {
  if (status === 'ready' || status === 'published' || status === 'approved') return 'ok';
  if (status === 'blocked' || status === 'failed' || status === 'disapproved') return 'danger';
  if (status === 'draft') return 'info';
  return 'warn';
}
export function BatchItemsTable({
  batchId,
  items,
  assets,
  canEdit,
  salvarItemAction,
  removerItemAction,
  reprocessarItemAction,
}: BatchItemsTableProps) {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | undefined>();
  const [busyId, setBusyId] = useState<string | undefined>();
  const [messageById, setMessageById] = useState<Record<string, { text: string; erro: boolean }>>(
    {},
  );
  const [removingId, setRemovingId] = useState<string | undefined>();
  const expandedItem = items.find((item) => item.id === expandedId);
  const removingItem = items.find((item) => item.id === removingId);

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
    setRemovingId(undefined);

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

    setMessage(itemId, {
      text: `Reprocessamento enfileirado (job ${result.data.job_id}).`,
      erro: false,
    });
    router.refresh();
  };

  return (
    <Card title={`Anúncios do lote (${items.length})`}>
      <Table head={canEdit ? ['Anúncio', 'Formato', 'Textos', 'Status', 'Revisão', 'Ações'] : ['Anúncio', 'Formato', 'Textos', 'Status', 'Revisão']}>
        {items.map((item) => {
          const errors = item.validation?.errors ?? [];
          const warnings = item.validation?.warnings ?? [];
          const policy = item.validation?.policy ?? [];
          const message = messageById[item.id];
          return (
            <Fragment key={item.id}>
              <TableRow>
                <TableCell>
                  {item.ads_manager_url ? (
                    <a
                      href={item.ads_manager_url}
                      target="_blank"
                      rel="noreferrer"
                      className="row-name"
                    >
                      {item.name}
                    </a>
                  ) : (
                    <p className="min-w-36 max-w-56 text-sm font-medium">{item.name}</p>
                  )}
                  <p className="row-detail">Anúncio {item.position}</p>
                </TableCell>
                <TableCell className="whitespace-nowrap">{formatLabel(item.format)}</TableCell>
                <TableCell className="max-w-56">
                  <p className="truncate text-xs" title={item.copy.primary_text}>
                    {item.copy.primary_text}
                  </p>
                  <p
                    className="mt-1 truncate text-xs text-[var(--color-muted)]"
                    title={item.copy.headline}
                  >
                    {item.copy.headline || 'Sem título'} · {ctaLabel(item.copy.cta)}
                  </p>
                </TableCell>
                <TableCell>
                  <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
                  {item.step ? <p className="row-detail">{statusLabel(item.step)}</p> : null}
                </TableCell>
                <TableCell className="min-w-36 max-w-60">
                  <div className="flex flex-wrap gap-1">
                    {errors.length > 0 ? (
                      <Badge tone="danger">{plural(errors.length, 'erro', 'erros')}</Badge>
                    ) : null}
                    {warnings.length > 0 ? (
                      <Badge tone="warn">{plural(warnings.length, 'aviso', 'avisos')}</Badge>
                    ) : null}
                    {policy.length > 0 ? (
                      <Badge
                        tone={
                          policy.some((issue) => issue.severity === 'error') ? 'danger' : 'warn'
                        }
                      >
                        Política: {policy.length}
                      </Badge>
                    ) : null}
                    {!item.validation ? (
                      <span className="text-xs text-[var(--color-muted)]">
                        Aguardando validação
                      </span>
                    ) : errors.length + warnings.length + policy.length === 0 ? (
                      <Badge tone="ok">OK</Badge>
                    ) : null}
                  </div>
                  {item.error ? (
                    <p
                      className="mt-2 text-xs text-[var(--color-danger)]"
                      title={item.error.fix ?? item.error.code}
                    >
                      {item.error.message}
                      {item.attempts > 0
                        ? ` (${plural(item.attempts, 'tentativa', 'tentativas')})`
                        : ''}
                    </p>
                  ) : null}
                  {/* Resultado da revisão da Meta: motivo da reprovação é o que
                      o gestor precisa para corrigir o anúncio. */}
                  {item.effective_status ? (
                    <p className="row-detail mt-2">Meta: {revisaoLabel(item.effective_status)}</p>
                  ) : null}
                  {motivosDaRevisao(item.review_feedback).map((motivo) => (
                    <p key={motivo} className="mt-1 text-xs text-[var(--color-danger)]">
                      {motivo}
                    </p>
                  ))}
                </TableCell>
                {canEdit ? (
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    {EDITAVEIS.has(item.status) ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        label="Editar"
                        isDisabled={Boolean(busyId)}
                        onClick={() => setExpandedId(item.id)}
                      />
                    ) : null}
                    {item.status === 'failed' || EM_VOO.has(item.status) ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        label={item.status === 'failed' ? 'Reprocessar' : 'Retomar'}
                        isDisabled={Boolean(busyId)}
                        onClick={() => void handleRetry(item.id)}
                      />
                    ) : null}
                    {EDITAVEIS.has(item.status) ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        label="Remover"
                        isDisabled={Boolean(busyId)}
                        onClick={() => setRemovingId(item.id)}
                      />
                    ) : null}
                  </div>
                </TableCell>
                ) : null}
              </TableRow>
              {message ? (
                <TableRow>
                  <TableCell colSpan={COLUMNS}>
                    <p
                      role={message.erro ? 'alert' : 'status'}
                      className={`text-sm ${message.erro ? 'text-[var(--color-danger)]' : 'text-[var(--color-ok)]'}`}
                    >
                      {message.text}
                    </p>
                  </TableCell>
                </TableRow>
              ) : null}
            </Fragment>
          );
        })}
      </Table>
      {expandedItem ? (
        <ItemEditor
          key={expandedItem.id}
          batchId={batchId}
          item={expandedItem}
          assets={assets}
          salvarItemAction={salvarItemAction}
          onSaved={() => setExpandedId(undefined)}
        />
      ) : null}
      <ConfirmDialog
        isOpen={Boolean(removingItem)}
        title="Remover anúncio do lote?"
        confirmLabel="Remover anúncio"
        destructive
        onCancel={() => setRemovingId(undefined)}
        onConfirm={() => {
          if (removingId) void handleRemove(removingId);
        }}
      >
        <p>
          <strong>{removingItem?.name}</strong> será removido deste lote. Essa ação não pode ser
          desfeita.
        </p>
      </ConfirmDialog>
    </Card>
  );
}
