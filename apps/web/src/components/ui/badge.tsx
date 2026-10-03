import type { ReactNode } from 'react';

import type { SeloTone } from '../../lib/selo';
import { Selo } from './selo';

const TOM: Record<string, SeloTone> = {
  ok: 'pronto',
  warn: 'rascunho',
  danger: 'bloqueado',
  info: 'neutro',
  brand: 'rascunho',
};

/** Compatível com o `Badge` antigo. Para estado de anúncio ou lote, use <Selo status>. */
export function Badge({ tone = 'info', children }: { tone?: string; children: ReactNode }) {
  const mapped = TOM[tone] ?? 'neutro';
  return <Selo tone={mapped}>{children}</Selo>;
}
