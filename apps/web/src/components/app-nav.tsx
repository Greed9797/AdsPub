'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SideNav } from '@astryxdesign/core/SideNav';
import { SideNavItem } from '@astryxdesign/core/SideNav';
import { SideNavSection } from '@astryxdesign/core/SideNav';
import { TopNav } from '@astryxdesign/core/TopNav';
import { useThemePreference } from './providers';
import { Icon } from './icons';

export interface NavItem {
  href: string;
  label: string;
  /** Env que desliga o item (T-009-3). Só lida no servidor. */
  flag?: string;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

const ICON_PATHS: Record<string, string> = {
  '/': 'M2.5 3h11v10h-11zM2.5 6.5h11M6.5 6.5V13',
  '/criativos': 'M2.5 3h11v10h-11zM3 11l3-3 2 2 2-3 3 4M5 5.5h.01',
  '/contas': 'M3 5.5h10v8H3zM3 5.5 8 2.5l5 3M6 8.5h4',
  '/whatsapp': 'M8 13.5c3.4 0 5.5-1.9 5.5-4.6S11.4 4.3 8 4.3 2.5 6.2 2.5 8.9c0 1.5.7 2.7 2 3.5L4 14.2l2-.9c.6.1 1.3.2 2 .2Z',
  '/performance': 'M2.5 13.5v-5M6.5 13.5v-9M10.5 13.5V6M14 13.5V3.5',
  '/inteligencia':
    'M8 2.5c2.5 0 4 1.8 4 4 0 1.5-.8 2.6-1.7 3.3-.5.4-.8.9-.8 1.7H6.5c0-.8-.3-1.3-.8-1.7C4.8 9.1 4 8 4 6.5c0-2.2 1.5-4 4-4ZM6.5 13.5h3',
  '/relatorios': 'M4 2.5h6L13 5.5v8H4zM10 2.5v3h3M6.5 8h4M6.5 10.5h4',
  '/clientes':
    'M5.5 7.5c.9 0 1.7-.7 1.7-1.7S6.4 4 5.5 4 3.8 4.8 3.8 5.8s.8 1.7 1.7 1.7ZM2 13.5c0-1.9 1.6-3 3.5-3s3.5 1.1 3.5 3M10.5 4.5c.8.2 1.3.9 1.3 1.7s-.5 1.5-1.3 1.7M11.5 10.7c1 .3 2.2 1.2 2.2 2.8',
  '/saude':
    'M8 13.5S2.5 10 2.5 6C2.5 4 4 2.8 5.7 2.8c.9 0 1.7.4 2.3 1.1.6-.7 1.4-1.1 2.3-1.1 1.7 0 3.2 1.2 3.2 3.2 0 4-5.5 7.5-5.5 7.5Z',
  '/auditoria': 'M8 2.5 13 4v4c0 3-2.2 4.8-5 5.5C5.2 12.8 3 11 3 8V4zM5.8 8l1.6 1.6L10.2 7',
  '/usuarios':
    'M8 8.5c1.4 0 2.5-1.1 2.5-2.5S9.4 3.5 8 3.5 5.5 4.6 5.5 6 6.6 8.5 8 8.5ZM3 13.5c0-2.5 2.2-4 5-4s5 1.5 5 4',
};

function RouteIcon({ d }: { d: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

function iconFor(href: string) {
  const d = ICON_PATHS[href] ?? 'M3 3h10v10H3z';
  return <RouteIcon d={d} />;
}

/** Navegação lateral agrupada (desktop + drawer mobile via AppShell). */
export function AppSideNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <SideNav
      className={`app-sidebar${collapsed ? ' is-collapsed' : ''}`}
      collapsible={{
        isCollapsed: collapsed,
        onCollapsedChange: setCollapsed,
        hasButton: false,
      }}
      header={
        <Link href="/" className="brand-lockup" aria-label="AdPub — Anúncios">
          <span className="brand-mark">
            <Icon name="layers" size={20} />
          </span>
          <span className="brand-name">AdPub</span>
        </Link>
      }
      footer={<p className="sidebar-note">Publicação Meta em lote.</p>}
      footerIcons={
        <button
          type="button"
          className="sidebar-collapse"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Expandir navegação' : 'Recolher navegação'}
        >
          <Icon name={collapsed ? 'panel-right' : 'panel-left'} size={16} />
        </button>
      }
    >
      {groups.map((group) => (
        <SideNavSection key={group.title} title={group.title}>
          {group.items.map((item) => (
            <SideNavItem
              key={item.href}
              label={item.label}
              href={item.href}
              as={Link}
              icon={iconFor(item.href)}
              isSelected={
                pathname === item.href || (item.href === '/' && pathname.startsWith('/lotes/'))
              }
            />
          ))}
        </SideNavSection>
      ))}
    </SideNav>
  );
}

/** Current workspace, theme preference and signed-in identity. */
export function AppTopNav({
  email,
  role,
  groups,
}: {
  email: string;
  role: string;
  groups: NavGroup[];
}) {
  const pathname = usePathname();
  const { mode, setMode } = useThemePreference();
  const current = groups.flatMap((group) => group.items).find((item) => item.href === pathname);
  const isBatch = pathname.startsWith('/lotes/');
  const roleLabel =
    { admin: 'Administrador', coordinator: 'Coordenador', manager: 'Gestor', viewer: 'Leitor' }[
      role
    ] ?? role;

  return (
    <TopNav
      label="Barra superior"
      className="app-topbar"
      heading={<span className="workspace-label">Gerenciador de anúncios</span>}
      startContent={
        <div className="breadcrumbs">
          {isBatch ? (
            <>
              <Link href="/">Anúncios</Link>
              <Icon name="chevron-right" size={14} />
              <span className="breadcrumb-detail">
                {pathname === '/lotes/novo' ? 'Novo lote' : 'Revisão do lote'}
              </span>
            </>
          ) : (
            <span>{current?.label ?? 'AdPub'}</span>
          )}
        </div>
      }
      endContent={
        <>
          <div className="theme-switch" role="group" aria-label="Tema">
            {(
              [
                ['light', 'sun', 'Claro'],
                ['dark', 'moon', 'Escuro'],
                ['system', 'display', 'Sistema'],
              ] as const
            ).map(([value, icon, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                aria-label={label}
                title={label}
                onClick={() => setMode(value)}
              >
                <Icon name={icon} size={14} />
              </button>
            ))}
          </div>
          <span className="profile-avatar" aria-hidden="true">
            {email.slice(0, 2).toUpperCase()}
          </span>
          <div className="hidden sm:block">
            <p className="max-w-48 truncate text-xs font-medium" title={email}>
              {email}
            </p>
            <p className="text-[11px] text-[var(--color-muted)]">{roleLabel}</p>
          </div>
          <form action="/api/auth/logout" method="post">
            <button type="submit" className="sign-out">
              Sair
            </button>
          </form>
        </>
      }
    />
  );
}
