'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Badge, Button, Card, Dialog, Field, Table, TableCell, TableRow, inputClass, plural, statusLabel } from '@/components/ui';
import { Icon } from '@/components/icons';
import { revisaoFinal } from '@/lib/publicacao';
import type { AdAccount, AdDraft, Batch, PublishResult, ValidationReport } from '@/lib/types';
import type { ActionResult } from '../actions';

type PublishPanelProps = {
  batchId: string;
  batchName: string;
  /** Quantos anúncios a conta ainda aceita hoje; `undefined` quando o painel de saúde não respondeu. */
  dailyRemaining?: number;
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
  batchName,
  dailyRemaining,
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
  const [aceitouSaldo, setAceitouSaldo] = useState(false);
  const reviewId = useId();

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

  const previa = revisaoFinal(confirmation?.count ?? 0, dailyRemaining);

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
    setAceitouSaldo(false);
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
      <div className="ap-publish">
        <p className="ap-t-small ap-publish__muted">
          Conta de destino{' '}
          <strong className="ap-t-body-strong ap-publish__account">{accountName}</strong>
        </p>
        <div className="ap-publish__summary">
          <div>
            <strong>{eligibleCount}</strong>
            <span>aptos para publicar</span>
          </div>
          <div>
            <strong data-alert={blockedCount ? 'true' : undefined}>{blockedCount}</strong>
            <span>bloqueados</span>
          </div>
        </div>
        <div className="ap-note">
          <Icon name="shield" />
          <span>
            Revise o destino, os textos e o orçamento. Nada é publicado sem sua confirmação.
          </span>
        </div>
        {items.length > 0 ? (
          precisaValidar ? (
            <p role="status" className="ap-note" data-tone="warn">
              {avisoDeValidacao}
            </p>
          ) : (
            <p role="status" className="ap-note">
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
            <div className="ap-publish__actions">
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
            <label className="ap-publish__only ap-t-small">
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
          <p className="ap-note">Visualização somente leitura: publicação restrita a gestor.</p>
        )}
        {teto ? (
          <p className="ap-t-small ap-publish__muted">
            Limite da conta: {plural(teto, 'anúncio', 'anúncios')} por dia.
          </p>
        ) : null}
        {message ? (
          <p role="alert" className="ap-note" data-tone="danger">
            {message}
          </p>
        ) : null}
        <Dialog
          isOpen={confirmation !== null}
          onOpenChange={(open) => {
            if (!open) setConfirmation(null);
          }}
          width={640}
          aria-labelledby={reviewId}
        >
          <p className="ap-t-ref ap-review__eyebrow">Revisão final antes de criar na Meta</p>
          <h2 id={reviewId} className="ap-t-title-m">
            Publicar {plural(confirmation?.count ?? 0, 'anúncio', 'anúncios')}?
          </h2>
          <p className="ap-t-body ap-review__lead">
            Isso cria campanha, conjuntos e anúncios <strong>pausados</strong> na conta{' '}
            <strong>{accountName}</strong>. Nada fica no ar até você ativar no Gerenciador de Anúncios.
          </p>
          <Table head={['Lote', 'Conta', 'Anúncios', 'Validação']}>
            <TableRow>
              <TableCell>{batchName}</TableCell>
              <TableCell>{accountName}</TableCell>
              <TableCell className="numeric">{confirmation?.count ?? 0}</TableCell>
              <TableCell>
                {approval.validated_at
                  ? new Date(approval.validated_at).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: 'America/Sao_Paulo',
                    })
                  : 'agora'}
              </TableCell>
            </TableRow>
          </Table>
          <ul className="ap-review__checks">
            <li data-tone="ok">
              <span className="ap-t-body-strong">A validação ainda vale</span>
              <span className="ap-t-small">Qualquer edição depois dela derruba a aprovação.</span>
            </li>
            {previa.excede ? (
              <li data-tone="warn">
                <span className="ap-t-body-strong">Limite diário da conta {accountName}</span>
                <span className="ap-t-small">
                  A conta aceita mais {plural(previa.entram, 'anúncio', 'anúncios')} hoje e este lote tem{' '}
                  {confirmation?.count ?? 0}. Os outros {previa.ficamDeFora} não entram na fila hoje.
                </span>
              </li>
            ) : null}
          </ul>
          {previa.excede ? (
            <label className="ap-review__accept ap-t-body">
              <input
                type="checkbox"
                className="ap-check"
                checked={aceitouSaldo}
                onChange={(event) => setAceitouSaldo(event.target.checked)}
              />
              Publicar só o que cabe hoje ({previa.entram} de {confirmation?.count ?? 0}) e deixar{' '}
              {previa.ficamDeFora} como pronto
            </label>
          ) : null}
          <p className="ap-review__billing ap-t-small">
            A veiculação gera cobrança na sua conta de anúncios depois que você ativar. Confira o
            orçamento e o destino antes de continuar.
          </p>
          <div className="ap-review__actions">
            <Button variant="ghost" label="Cancelar" onClick={() => setConfirmation(null)} />
            <Button
              variant="primary"
              label="Confirmar publicação"
              isDisabled={previa.excede && !aceitouSaldo}
              onClick={() => void publish()}
            />
          </div>
        </Dialog>

        {report ? (
          <div className="ap-publish__report">
            <p className="ap-t-body">
              {report.can_publish ? (
                <Badge tone="ok">lote liberado para publicar</Badge>
              ) : (
                <Badge tone="danger">lote com itens bloqueados</Badge>
              )}
            </p>
            <ul className="ap-publish__items">
              {report.items
                .filter(
                  (item) => item.errors.length + item.warnings.length + item.policy.length > 0,
                )
                .map((item, index) => (
                  <li
                    key={item.item_id}
                    className="ap-publish__item"
                  >
                    <p className="ap-t-body-strong">
                      {items.find((draft) => draft.id === item.item_id)?.name ??
                        `Anúncio ${index + 1}`}{' '}
                      — {statusLabel(item.status)}
                    </p>
                    <ul className="ap-publish__issues ap-t-small">
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
          <div role="status" className="ap-publish__result">
            <Badge tone="ok">enfileirados: {publishResult.queued}</Badge>
            <Badge tone="warn">adiados pelo teto: {publishResult.skipped}</Badge>
            <Badge tone="info">saldo diário: {publishResult.daily_remaining}</Badge>
          </div>
        ) : null}

        {canEdit ? (
          <details className="ap-publish__dup">
            <summary className="ap-t-body-strong">Duplicar lote</summary>
          {otherAccounts.length === 0 ? (
            <p className="ap-t-small ap-publish__muted">
              Não há outra conta do mesmo cliente disponível para duplicar.
            </p>
          ) : (
            <div className="ap-publish__dupform">
              <div className="ap-publish__dupfields">
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
                <p role="alert" className="ap-note" data-tone="danger">
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
