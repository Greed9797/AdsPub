'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button, Card, Field, inputClass, statusLabel } from '@/components/ui';
import type { AdDraft, BatchRef } from '@/lib/types';
import type { ActionResult } from '../actions';

/** Etapa em que o item parou → qual ID o operador confere na Meta. */
const ID_POR_ETAPA: Record<string, { campo: string; rotulo: string }> = {
  ensure_campaign: { campo: 'campaign_id', rotulo: 'ID da campanha criada na Meta' },
  ensure_adset: { campo: 'adset_id', rotulo: 'ID do conjunto criado na Meta' },
  create_creative: { campo: 'creative_id', rotulo: 'ID do criativo criado na Meta' },
  create_ad: { campo: 'ad_id', rotulo: 'ID do anúncio criado na Meta' },
};

type ReconciliationPanelProps = {
  batchId: string;
  items: AdDraft[];
  refs: BatchRef[];
  resolverItemAction: (payload: {
    batch_id: string;
    item_id: string;
    decision: 'adopt' | 'discard';
    motive: string;
    meta_ids?: Record<string, unknown>;
    step?: string;
  }) => Promise<ActionResult<{ status: string }>>;
  resolverRefAction: (payload: {
    batch_id: string;
    ref_key: string;
    decision: 'adopt' | 'discard';
    motive: string;
    meta_id?: string;
  }) => Promise<ActionResult<{ ref_key: string; state: string }>>;
};

/**
 * Saída humana da reconciliação: a Meta pode ter criado o objeto sem responder,
 * então o app nunca recria sozinho. Aqui o operador informa o que conferiu
 * (adotar) ou encerra com motivo (descartar) — para itens e para a
 * campanha/conjunto compartilhado do lote.
 */
export function ReconciliationPanel({
  batchId,
  items,
  refs,
  resolverItemAction,
  resolverRefAction,
}: ReconciliationPanelProps) {
  const router = useRouter();
  const [metaIdPorChave, setMetaIdPorChave] = useState<Record<string, string>>({});
  const [motivoPorChave, setMotivoPorChave] = useState<Record<string, string>>({});
  const [ocupada, setOcupada] = useState<string | undefined>();
  const [erro, setErro] = useState<string | undefined>();

  const itensTravados = items.filter((item) => item.status === 'needs_reconciliation');
  const refsTravadas = refs.filter((ref) => ref.state === 'needs_reconciliation');
  if (itensTravados.length === 0 && refsTravadas.length === 0) return null;

  const resolverItem = async (item: AdDraft, decision: 'adopt' | 'discard') => {
    const motive = motivoPorChave[item.id]?.trim() ?? '';
    if (!motive) {
      setErro('Descreva o que você conferiu na Meta antes de resolver.');
      return;
    }
    const etapa = item.step ?? '';
    const campo = ID_POR_ETAPA[etapa]?.campo;
    const metaId = metaIdPorChave[item.id]?.trim() ?? '';
    if (decision === 'adopt' && (!campo || !metaId)) {
      setErro('Adotar exige o ID conferido na Meta para a etapa em que o item parou.');
      return;
    }

    setOcupada(item.id);
    setErro(undefined);
    const result = await resolverItemAction({
      batch_id: batchId,
      item_id: item.id,
      decision,
      motive,
      ...(decision === 'adopt' && campo
        ? {
            // A API remonta o item com os IDs inteiros: mandar só o novo
            // apagaria hashes de mídia já pagos à Meta.
            meta_ids: {
              image_hashes: {},
              video_ids: {},
              thumbnail_hashes: {},
              ...(item.meta_ids ?? {}),
              [campo]: metaId,
            },
            step: etapa,
          }
        : {}),
    });
    setOcupada(undefined);
    if ('erro' in result) {
      setErro(result.erro);
      return;
    }
    router.refresh();
  };

  const resolverReferencia = async (ref: BatchRef, decision: 'adopt' | 'discard') => {
    const motive = motivoPorChave[ref.ref_key]?.trim() ?? '';
    if (!motive) {
      setErro('Descreva o que você conferiu na Meta antes de resolver.');
      return;
    }
    const metaId = metaIdPorChave[ref.ref_key]?.trim() ?? '';
    if (decision === 'adopt' && !metaId) {
      setErro('Adotar exige o ID da campanha ou conjunto conferido na Meta.');
      return;
    }

    setOcupada(ref.ref_key);
    setErro(undefined);
    const result = await resolverRefAction({
      batch_id: batchId,
      ref_key: ref.ref_key,
      decision,
      motive,
      ...(decision === 'adopt' ? { meta_id: metaId } : {}),
    });
    setOcupada(undefined);
    if ('erro' in result) {
      setErro(result.erro);
      return;
    }
    router.refresh();
  };

  return (
    <Card title="Conferência pendente na Meta">
      <p className="ap-t-body ap-recon__lead">
        A Meta pode ter criado o objeto sem responder. O AdPub não recria nada sozinho: confira na
        Meta e informe o ID encontrado, ou descarte com o motivo.
      </p>
      {erro ? (
        <p role="alert" className="ap-note" data-tone="danger">
          {erro}
        </p>
      ) : null}

      {refsTravadas.map((ref) => (
        <div key={ref.ref_key} className="ap-recon__block">
          <p className="ap-t-body-strong">
            {ref.kind === 'campaign' ? 'Campanha compartilhada' : 'Conjunto compartilhado'}:{' '}
            {ref.ref_key}
          </p>
          {ref.last_error ? <p className="ap-t-small ap-recon__detail">{ref.last_error}</p> : null}
          <Field label={`ID ${ref.kind === 'campaign' ? 'da campanha' : 'do conjunto'} na Meta`}>
            <input
              className={inputClass}
              value={metaIdPorChave[ref.ref_key] ?? ''}
              onChange={(event) =>
                setMetaIdPorChave((prev) => ({ ...prev, [ref.ref_key]: event.target.value }))
              }
            />
          </Field>
          <Field label="O que você conferiu">
            <input
              className={inputClass}
              value={motivoPorChave[ref.ref_key] ?? ''}
              onChange={(event) =>
                setMotivoPorChave((prev) => ({ ...prev, [ref.ref_key]: event.target.value }))
              }
            />
          </Field>
          <div className="ap-recon__actions">
            <Button
              size="sm"
              label="Adotar o que existe na Meta"
              isDisabled={Boolean(ocupada)}
              onClick={() => void resolverReferencia(ref, 'adopt')}
            />
            <Button
              size="sm"
              variant="ghost"
              label="Descartar e criar de novo"
              isDisabled={Boolean(ocupada)}
              onClick={() => void resolverReferencia(ref, 'discard')}
            />
          </div>
        </div>
      ))}

      {itensTravados.map((item) => {
        const etapa = item.step ?? '';
        const rotulo = ID_POR_ETAPA[etapa]?.rotulo;
        return (
          <div key={item.id} className="ap-recon__block">
            <p className="ap-t-body-strong">{item.name}</p>
            <p className="ap-t-small ap-recon__detail">
              Parou em {statusLabel(etapa) || 'etapa desconhecida'}
              {item.error ? ` · ${item.error.message}` : ''}
            </p>
            {rotulo ? (
              <Field label={rotulo}>
                <input
                  className={inputClass}
                  value={metaIdPorChave[item.id] ?? ''}
                  onChange={(event) =>
                    setMetaIdPorChave((prev) => ({ ...prev, [item.id]: event.target.value }))
                  }
                />
              </Field>
            ) : null}
            <Field label="O que você conferiu">
              <input
                className={inputClass}
                value={motivoPorChave[item.id] ?? ''}
                onChange={(event) =>
                  setMotivoPorChave((prev) => ({ ...prev, [item.id]: event.target.value }))
                }
              />
            </Field>
            <div className="ap-recon__actions">
              <Button
                size="sm"
                label="Adotar e retomar"
                isDisabled={Boolean(ocupada) || !rotulo}
                onClick={() => void resolverItem(item, 'adopt')}
              />
              <Button
                size="sm"
                variant="ghost"
                label="Descartar item"
                isDisabled={Boolean(ocupada)}
                onClick={() => void resolverItem(item, 'discard')}
              />
            </div>
          </div>
        );
      })}
    </Card>
  );
}
