'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { AdDraftStatus } from '@/lib/types';

const NON_TERMINAL: AdDraftStatus[] = [
  'queued',
  'uploading_media',
  'ensuring_campaign',
  'ensuring_adset',
  'creating_creative',
  'creating_ad',
];

const CONCLUIDOS: AdDraftStatus[] = ['published', 'in_review', 'approved', 'disapproved'];

type ProgressStreamProps = {
  items: {
    id: string;
    status: AdDraftStatus;
  }[];
};

function isActive(status: AdDraftStatus): boolean {
  return NON_TERMINAL.includes(status);
}

export function ProgressStream({ items }: ProgressStreamProps) {
  const router = useRouter();

  // A rota SSE disponível é /api/v1/batches/{id}/events.
  // O consumo direto no browser ainda não está integrado, então mantemos polling para atualizar o estado.
  const shouldPoll = items.some((item) => isActive(item.status));

  const signature = useMemo(
    () => items.map((item) => `${item.id}:${item.status}`).join('|'),
    [items],
  );

  useEffect(() => {
    if (!shouldPoll) {
      return;
    }

    const timer = window.setInterval(() => {
      router.refresh();
    }, 3_000);

    return () => {
      window.clearInterval(timer);
    };
  }, [shouldPoll, signature, router]);

  if (!shouldPoll) {
    return null;
  }

  const concluidos = items.filter((item) => CONCLUIDOS.includes(item.status)).length;
  return (
    <div role="status" className="ap-andamento">
      <p className="ap-t-body-strong">Lote em processamento. Atualizando automaticamente...</p>
      <p className="ap-t-small">
        {concluidos} de {items.length} {items.length === 1 ? 'anúncio' : 'anúncios'} na Meta
      </p>
      <progress className="ap-andamento__bar" max={items.length} value={concluidos} aria-label="Anúncios já criados na Meta" />
    </div>
  );
}
