'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Badge, Card, Field, inputClass, plural, statusLabel } from '@/components/ui';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Icon } from '@/components/icons';
import type { AdAccount, AdDraft, Batch, PublishResult, ValidationReport } from '@/lib/types';
import type { ActionResult } from '../actions';
import { Button } from '@astryxdesign/core/Button';

type PublishPanelProps = {
  batchId: string;
  items: AdDraft[];
  accounts: AdAccount[];
  currentAccountId: string;
  canEdit: boolean;
  /** Validação ainda válida para o conteúdo atual (a API exige para publicar). */
  approval: { approved: boolean; validated_at: string | null };
  validarLoteAction: (payload: { batch_id: string }) => Promise<ActionResult<ValidationReport>>;
  publicarLoteAction: (payload: {
    batch_id: string;
    only_failed: boolean;
    confirm_count: number;
  }) => Promise<ActionResult<PublishResult>>;
  duplicarLoteAction: (payload: {
    batch_id: string;
    ad_account_id: string;
    name?: string;
  }) => Promise<ActionResult<Batch>>;
};

export function PublishPanel({
  batchId,
  items,
  accounts,
  currentAccountId,
  canEdit,
  approval,
  validarLoteAction,
  publicarLoteAction,
  duplicarLoteAction,
}: PublishPanelProps) {
  const router = useRouter();
  const [report, setReport] = useState<ValidationReport | undefined>();
  const [publishResult, setPublishResult] = useState<PublishResult | undefined>();
  const [onlyFailed, setOnlyFailed] = useState(false);
  const [message, setMessage] = useState<string | undefined>();
  const [isValidating, setIsValidating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [confirmation, setConfirmation] = useState<{ count: number; onlyFailed: boolean } | null>(
    null,
  );

  const otherAccounts = accounts.filter((account) => account.id !== currentAccountId);
  const [targetAccountId, setTargetAccountId] = useState(otherAccounts[0]?.id ?? '');
  const [duplicateName, setDuplicateName] = useState('');
  const [duplicateMessage, setDuplicateMessage] = useState<string | undefined>();

  // Mesma regra do servidor (publishBatch): `only_failed` enfileira só falhas,
  // caso contrário `ready` + `failed`. A contagem precisa bater exatamente.
  const eligibleCount = items.filter((item) =>
    onlyFailed ? item.status === 'failed' : item.status === 'ready' || item.status === 'failed',
  ).length;
  const blockedCount = items.filter((item) => item.status === 'blocked').length;
  const account = accounts.find((a) => a.id === currentAccountId);
  const accountName = account?.name ?? 'conta atual';
  const teto = account?.daily_ad_cap ?? null;
  // A publicação exige validação válida para o conteúdo atual: editar um item
  // derruba a aprovação no servidor, então o botão não pode prometer o que a
  // API vai recusar. O aviso diz qual dos três casos é, porque a ação muda.
  const precisaValidar = !approval.approved;
  const avisoDeValidacao = !approval.validated_at
    ? 'Valide o lote para liberar a publicação.'
    : blockedCount > 0
      ? 'Corrija os itens bloqueados e valide de novo para liberar a publicação.'
      : 'O lote mudou depois da validação. Valide de novo para liberar a publicação.';

  const validate = async () => {
    setIsValidating(true);
    setMessage(undefined);

    const result = await validarLoteAction({ batch_id: batchId });
    setIsValidating(false);

    if ('erro' in result) {
      setMessage(result.erro);
      return;
    }

    setReport(result.data);
    router.refresh();
  };

  const requestPublication = () => {
    if (precisaValidar) {
      setMessage('Valide o lote antes de publicar: a validação anterior não vale mais.');
      return;
    }
    if (eligibleCount === 0) {
      setMessage(
        onlyFailed
          ? 'Nenhum item em falha para reprocessar.'
          : 'Valide o lote e corrija os itens bloqueados antes de publicar.',
      );
      return;
    }
    setConfirmation({ count: eligibleCount, onlyFailed });
  };

  const publish = async () => {
    if (!confirmation || isPublishing) return;
    if (confirmation.count !== eligibleCount || confirmation.onlyFailed !== onlyFailed) {
      setConfirmation(null);
      setMessage('O lote mudou durante a revisão. Confira os anúncios e confirme novamente.');
      return;
    }
    setIsPublishing(true);
    setMessage(undefined);
    setConfirmation(null);
    const result = await publicarLoteAction({
      batch_id: batchId,
      only_failed: confirmation.onlyFailed,
      confirm_count: confirmation.count,
    });
    setIsPublishing(false);
    if ('erro' in result) {
      setMessage(result.erro);
      return;
    }
    setPublishResult(result.data);
    router.refresh();
  };

  const duplicate = async () => {
    if (!targetAccountId) {
      setDuplicateMessage('Escolha a conta de destino.');
      return;
    }

    setIsDuplicating(true);
    setDuplicateMessage(undefined);

    const result = await duplicarLoteAction({
      batch_id: batchId,
      ad_account_id: targetAccountId,
      ...(duplicateName.trim() ? { name: duplicateName.trim() } : {}),
    });

    setIsDuplicating(false);

    if ('erro' in result) {
      setDuplicateMessage(result.erro);
      return;
    }

    router.push(`/lotes/${result.data.id}`);
  };

  return (
    <Card title="Revisar e publicar">
      <div className="space-y-4">
        <p className="text-xs text-[var(--color-muted)]">
          Conta de destino{' '}
          <strong className="mt-1 block text-sm text-[var(--color-text)]">{accountName}</strong>
        </p>
        <div className="publish-summary">
          <div>
            <strong>{eligibleCount}</strong>
            <span>aptos para publicar</span>
          </div>
          <div>
            <strong className={blockedCount ? 'text-[var(--color-danger)]' : ''}>
              {blockedCount}
            </strong>
            <span>bloqueados</span>
          </div>
        </div>
        <div className="notice">
          <Icon name="shield" />
          <span>
            Revise o destino, os textos e o orçamento. Nada é publicado sem sua confirmação.
          </span>
        </div>
        {items.length > 0 ? (
          precisaValidar ? (
            <p role="status" className="notice notice-warning">
              {avisoDeValidacao}
            </p>
          ) : (
            <p role="status" className="notice">
              Validado em{' '}
              {approval.validated_at
                ? new Date(approval.validated_at).toLocaleString('pt-BR')
                : 'agora'}{' '}
              — liberado para publicar.
            </p>
          )
        ) : null}
        {canEdit ? (
          <>
            <div className="publish-actions">
              <Button
                variant="secondary"
                label={isValidating ? 'Validando...' : 'Validar lote'}
                isDisabled={isValidating || isPublishing || items.length === 0}
                onClick={() => void validate()}
              />
              <Button
                variant="primary"
                label={
                  isPublishing
                    ? 'Enfileirando...'
                    : `Publicar ${plural(eligibleCount, 'anúncio', 'anúncios')}`
                }
                isDisabled={isPublishing || isValidating || eligibleCount === 0 || precisaValidar}
                onClick={requestPublication}
              />
            </div>
            <label className="inline-flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={onlyFailed}
                disabled={isPublishing || isValidating}
                onChange={(event) => setOnlyFailed(event.target.checked)}
              />
              Publicar apenas itens em falha
            </label>
          </>
        ) : (
          <p className="notice">Visualização somente leitura: publicação restrita a gestor.</p>
        )}
        {teto ? (
          <p className="text-xs text-[var(--color-muted)]">
            Limite da conta: {plural(teto, 'anúncio', 'anúncios')} por dia.
          </p>
        ) : null}
        {message ? (
          <p role="alert" className="notice notice-error">
            {message}
          </p>
        ) : null}
        <ConfirmDialog
          isOpen={confirmation !== null}
          title={`Publicar ${plural(confirmation?.count ?? 0, 'anúncio', 'anúncios')}?`}
          confirmLabel="Confirmar publicação"
          onCancel={() => setConfirmation(null)}
          onConfirm={() => void publish()}
        >
          <p>
            Conta de destino: <strong>{accountName}</strong>.
          </p>
          <p>
            Você está autorizando a publicação de{' '}
            <strong>{plural(confirmation?.count ?? 0, 'anúncio', 'anúncios')}</strong> na Meta.
          </p>
          <p className="notice notice-warning">
            A veiculação gera cobrança na sua conta de anúncios. Confira o orçamento e o destino
            antes de continuar.
          </p>
        </ConfirmDialog>

        {report ? (
          <div className="space-y-2">
            <p className="text-sm">
              {report.can_publish ? (
                <Badge tone="ok">lote liberado para publicar</Badge>
              ) : (
                <Badge tone="danger">lote com itens bloqueados</Badge>
              )}
            </p>
            <ul className="space-y-1">
              {report.items
                .filter(
                  (item) => item.errors.length + item.warnings.length + item.policy.length > 0,
                )
                .map((item, index) => (
                  <li
                    key={item.item_id}
                    className="rounded-lg border border-[var(--color-border)] p-2 text-sm"
                  >
                    <p className="font-medium">
                      {items.find((draft) => draft.id === item.item_id)?.name ??
                        `Anúncio ${index + 1}`}{' '}
                      — {statusLabel(item.status)}
                    </p>
                    <ul className="mt-1 list-disc pl-5 text-xs text-[var(--color-muted)]">
                      {item.errors.map((issue) => (
                        <li key={`erro-${issue.code}-${issue.field}`}>
                          {issue.message}
                          {issue.fix ? ` — Como resolver: ${issue.fix}` : ''}
                        </li>
                      ))}
                      {item.warnings.map((issue) => (
                        <li key={`aviso-${issue.code}-${issue.field}`}>{issue.message}</li>
                      ))}
                      {item.policy.map((issue, index) => (
                        <li key={`politica-${issue.category}-${index}`}>
                          {issue.category}: {issue.excerpt}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
            </ul>
          </div>
        ) : null}

        {publishResult ? (
          <div
            role="status"
            className="flex flex-wrap gap-2 rounded-lg border border-[var(--color-border)] p-3 text-sm"
          >
            <Badge tone="ok">enfileirados: {publishResult.queued}</Badge>
            <Badge tone="warn">adiados pelo teto: {publishResult.skipped}</Badge>
            <Badge tone="info">saldo diário: {publishResult.daily_remaining}</Badge>
          </div>
        ) : null}

        {canEdit ? (
          <details className="border-t border-[var(--color-border)] pt-4">
            <summary className="cursor-pointer text-sm font-semibold">Duplicar lote</summary>
          {otherAccounts.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">
              Não há outra conta do mesmo cliente disponível para duplicar.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3">
                <Field label="Conta de destino">
                  <select
                    className={inputClass}
                    value={targetAccountId}
                    onChange={(event) => setTargetAccountId(event.target.value)}
                  >
                    {otherAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="Nome do novo lote"
                  hint="Vazio mantém o nome original com sufixo da API."
                >
                  <input
                    className={inputClass}
                    value={duplicateName}
                    onChange={(event) => setDuplicateName(event.target.value)}
                  />
                </Field>
              </div>

              <Button
                variant="secondary"
                label={isDuplicating ? 'Duplicando...' : 'Duplicar para a conta'}
                isDisabled={isDuplicating}
                onClick={() => void duplicate()}
              />

              {duplicateMessage ? (
                <p role="alert" className="text-sm text-[var(--color-danger)]">
                  {duplicateMessage}
                </p>
              ) : null}
            </div>
          )}
          </details>
        ) : null}
      </div>
    </Card>
  );
}
