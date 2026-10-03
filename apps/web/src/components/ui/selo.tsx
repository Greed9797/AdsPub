import type { ReactNode } from 'react';

import { seloParaStatus, type SeloTone } from '../../lib/selo';

const ICONES: Partial<Record<SeloTone, string>> = {
  bloqueado: 'M12 4 3 20h18L12 4zM12 10v4M12 17.4h.01',
  conferir: 'M12 4 3 20h18L12 4zM12 10v4M12 17.4h.01',
  pronto: 'm5 12.5 4.5 4.5L19 7',
  publicado: 'm5 12.5 4.5 4.5L19 7',
  aprovado: 'm5 12.5 4.5 4.5L19 7',
};

const CADEADO = 'M5 11h14v9H5zM8 11V8a4 4 0 0 1 8 0v3';

/** Selo de estado. Passe `status` (código) ou `tone`; `label` ou `children` trocam só o texto. */
export function Selo({
  status,
  tone,
  label,
  children,
}: {
  status?: string;
  tone?: SeloTone;
  label?: string;
  children?: ReactNode;
}) {
  const info = status ? seloParaStatus(status) : { tone: tone ?? 'neutro', label: label ?? '' };
  const resolved = tone ?? info.tone;
  const path = resolved === 'leitura' ? CADEADO : ICONES[resolved];
  return (
    <span className="ap-selo ap-t-stamp" data-tone={resolved}>
      {resolved === 'publicando' ? <span className="ap-selo__dot" aria-hidden="true" /> : null}
      {path ? (
        <svg className="ap-selo__icon" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d={path} />
        </svg>
      ) : null}
      {children ?? label ?? info.label}
    </span>
  );
}
