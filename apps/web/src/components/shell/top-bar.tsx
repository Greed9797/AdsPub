'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { Icon } from '../icons';
import { activeTabId, roleLabel, type NavTab } from '../../lib/nav';

interface TopBarProps {
  tabs: NavTab[];
  user: { name: string; email: string; role: string };
  syncLabel?: string;
}

function iniciais(name: string, email: string): string {
  const palavras = (name || email).split(/[\s@._-]+/).filter(Boolean);
  return palavras
    .slice(0, 2)
    .map((palavra) => palavra[0])
    .join('')
    .toUpperCase();
}

function emCampoDeTexto(alvo: EventTarget | null): boolean {
  if (!(alvo instanceof HTMLElement)) return false;
  return alvo.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName);
}

/** Barra superior: marca, 5 abas (Contas e Gestão são menus), busca, sincronização e usuário. */
export function TopBar({ tabs, user, syncLabel }: TopBarProps) {
  const pathname = usePathname();
  const ativa = activeTabId(pathname);
  const [aberto, setAberto] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const buscaRef = useRef<HTMLInputElement>(null);

  useEffect(() => setAberto(null), [pathname]);

  useEffect(() => {
    function aoTeclar(event: KeyboardEvent) {
      if (event.key === 'Escape') setAberto(null);
      const atalhoBusca = (event.key === '/' && !emCampoDeTexto(event.target)) || (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey));
      if (atalhoBusca) {
        event.preventDefault();
        buscaRef.current?.focus();
      }
    }
    function aoClicarFora(event: PointerEvent) {
      if (navRef.current && !navRef.current.contains(event.target as Node)) setAberto(null);
    }
    document.addEventListener('keydown', aoTeclar);
    document.addEventListener('pointerdown', aoClicarFora);
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.removeEventListener('pointerdown', aoClicarFora);
    };
  }, []);

  return (
    <header className="ap-topbar">
      <Link href="/" className="ap-brand" aria-label="AdPub, Lotes">
        <span className="ap-brand__tile ap-t-ref" aria-hidden="true">
          AP
          <span className="ap-brand__dot" />
        </span>
        <span className="ap-brand__text">
          <span className="ap-t-body-strong">AdPub</span>
          <span className="ap-t-stamp ap-brand__caption">Publicação em lote</span>
        </span>
      </Link>

      <nav className="ap-tabs" aria-label="Principal" ref={navRef}>
        {tabs.map((tab) =>
          tab.href ? (
            <Link
              key={tab.id}
              href={tab.href}
              className="ap-tab ap-t-button"
              aria-current={ativa === tab.id ? 'page' : undefined}
            >
              {tab.label}
            </Link>
          ) : (
            <div key={tab.id} className="ap-tabmenu">
              <button
                type="button"
                className="ap-tab ap-t-button"
                aria-haspopup="menu"
                aria-expanded={aberto === tab.id}
                aria-current={ativa === tab.id ? 'page' : undefined}
                onClick={() => setAberto(aberto === tab.id ? null : tab.id)}
              >
                {tab.label}
                <Icon name="chevron-down" size={14} />
              </button>
              {aberto === tab.id ? (
                <div className="ap-menu" role="menu" aria-label={tab.label}>
                  {tab.items?.map((item) => (
                    <Link key={item.href} href={item.href} className="ap-menu__item ap-t-body" role="menuitem">
                      {item.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          ),
        )}
      </nav>

      <form className="ap-search" role="search" action="/" method="get">
        <Icon name="search" size={16} />
        <input
          ref={buscaRef}
          type="search"
          name="q"
          className="ap-t-body"
          placeholder="Buscar lote, anúncio ou cliente"
          aria-label="Busca global"
        />
      </form>

      {syncLabel ? (
        <div className="ap-sync">
          <span className="ap-t-stamp ap-sync__caption">Meta</span>
          <span className="ap-t-body-strong">{syncLabel}</span>
        </div>
      ) : null}

      <div className="ap-user">
        <span className="ap-user__avatar ap-t-ref" aria-hidden="true">
          {iniciais(user.name, user.email)}
        </span>
        <span className="ap-user__text">
          <span className="ap-t-body-strong" title={user.email}>
            {user.name || user.email}
          </span>
          <span className="ap-t-stamp ap-user__role">{roleLabel(user.role)}</span>
        </span>
        <form action="/api/auth/logout" method="post">
          <button type="submit" className="ap-iconbtn" aria-label="Sair" title="Sair">
            <Icon name="logout" size={18} />
          </button>
        </form>
      </div>
    </header>
  );
}
