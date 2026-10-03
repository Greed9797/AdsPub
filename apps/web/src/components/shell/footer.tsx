'use client';

import { usePathname } from 'next/navigation';

import { screenLabel } from '../../lib/nav';
import { ThemeSwitch } from './theme-switch';

/** Rodapé: produto, tela, atalhos que existem de verdade e o seletor de tema. */
export function Footer() {
  const pathname = usePathname();
  return (
    <footer className="ap-footer ap-t-stamp">
      <span>AdPub · Publicação em lote</span>
      <strong className="ap-footer__tela">{screenLabel(pathname)}</strong>
      <span className="ap-footer__atalhos">/ ou ⌘K busca · Esc fecha</span>
      <ThemeSwitch />
    </footer>
  );
}
