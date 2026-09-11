'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Badge, Card, Field, inputClass, plural } from '@/components/ui';
import type { AdAccount, AdDraft, Batch, PublishResult, ValidationReport } from '@/lib/types';
import type { ActionResult } from '../actions';
import { Button } from '@astryxdesign/core/Button';

type PublishPanelProps = {
  batchId: string;
  items: AdDraft[];
  accounts: AdAccount[];
  currentAccountId: string;
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

  const publish = async () => {
    if (eligibleCount === 0) {
      setMessage(
        onlyFailed
          ? 'Nenhum item em falha para reprocessar.'
          : 'Nenhum item pronto. Valide o lote e corrija os itens bloqueados.',
      );
      return;
    }

    if (!window.confirm(
      `Publicar ${plural(eligibleCount, 'anúncio', 'anúncios')} na conta "${accountName}"?\n` +
      (teto ? `Teto diário dessa conta: ${teto} anúncios.\n` : '') +
      'Isso vai gerar cobrança na sua conta de anúncios da Meta. Continuar?',
    )) {
      return;
    }

    setIsPublishing(true);
    setMessage(undefined);

    const result = await publicarLoteAction({
      batch_id: batchId,
      only_failed: onlyFailed,
      confirm_count: eligibleCount,
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
    <Card title="Validação e publicação">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" label={isValidating ? 'Validando...' : 'Validar lote'} isDisabled={isValidating} onClick={() => void validate()} />

          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={onlyFailed}
              onChange={(event) => setOnlyFailed(event.target.checked)}
            />
            Publicar apenas itens em falha
          </label>

          <Button variant="primary" label={isPublishing ? 'Enfileirando...' : `Publicar ${plural(eligibleCount, 'anúncio', 'anúncios')}`} isDisabled={isPublishing} onClick={() => void publish()} />

          {blockedCount > 0 ? <Badge tone="danger">{plural(blockedCount, 'bloqueado', 'bloqueados')}</Badge> : null}
        </div>

        {message ? <p className="text-sm text-[var(--color-danger)]">{message}</p> : null}

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
                .filter((item) => item.errors.length + item.warnings.length + item.policy.length > 0)
                .map((item) => (
                  <li key={item.item_id} className="rounded-lg border border-[var(--color-border)] p-2 text-sm">
                    <p className="font-medium">
                      Item {item.item_id.slice(0, 8)} — {item.status}
                    </p>
                    <ul className="mt-1 list-disc pl-5 text-xs text-[var(--color-muted)]">
                      {item.errors.map((issue) => (
                        <li key={`erro-${issue.code}-${issue.field}`}>
                          {issue.message}
                          {issue.fix ? ` — ${issue.fix}` : ''}
                        </li>
                      ))}
                      {item.warnings.map((issue) => (
                        <li key={`aviso-${issue.code}-${issue.field}`}>{issue.message}</li>
                      ))}
                      {item.policy.map((issue, index) => (
                        <li key={`politica-${issue.category}-${index}`}>
                          [{issue.severity}] {issue.category}: {issue.excerpt}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
            </ul>
          </div>
        ) : null}

        {publishResult ? (
          <div className="space-x-1 rounded-lg border border-[var(--color-border)] p-3 text-sm">
            <Badge tone="ok">enfileirados: {publishResult.queued}</Badge>
            <Badge tone="warn">adiados pelo teto: {publishResult.skipped}</Badge>
            <Badge tone="info">saldo diário: {publishResult.daily_remaining}</Badge>
          </div>
        ) : null}

        <div className="border-t border-[var(--color-border)] pt-4">
          <h3 className="mb-2 text-sm font-semibold">Duplicar lote</h3>
          {otherAccounts.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">
              Não há outra conta do mesmo cliente disponível para duplicar.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
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
                <Field label="Nome do novo lote" hint="Vazio mantém o nome original com sufixo da API.">
                  <input
                    className={inputClass}
                    value={duplicateName}
                    onChange={(event) => setDuplicateName(event.target.value)}
                  />
                </Field>
              </div>

              <Button variant="secondary" label={isDuplicating ? 'Duplicando...' : 'Duplicar para a conta'} isDisabled={isDuplicating} onClick={() => void duplicate()} />

              {duplicateMessage ? (
                <p className="text-sm text-[var(--color-danger)]">{duplicateMessage}</p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
