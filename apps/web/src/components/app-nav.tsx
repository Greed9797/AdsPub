"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';

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

function Icon({ d, filled }: { d: string; filled?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="h-4 w-4 shrink-0"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

const ICONS: Record<string, string> = {
  '/': 'M2.5 8 8 2.5 13.5 8M4 7v6.5h8V7',
  '/criativos': 'M8 2.5v11M2.5 8h11M8 2.5 5.5 5M8 2.5 10.5 5M8 13.5 5.5 11M8 13.5l2.5-2.5M2.5 8l2.5-2.5M2.5 8l2.5 2.5M13.5 8 11 5.5M13.5 8 11 10.5',
  '/contas': 'M3 5.5h10v8H3zM3 5.5 8 2.5l5 3M6 8.5h4',
  '/performance': 'M2.5 13.5v-5M6.5 13.5v-9M10.5 13.5V6M14 13.5V3.5',
  '/inteligencia': 'M8 2.5c2.5 0 4 1.8 4 4 0 1.5-.8 2.6-1.7 3.3-.5.4-.8.9-.8 1.7H6.5c0-.8-.3-1.3-.8-1.7C4.8 9.1 4 8 4 6.5c0-2.2 1.5-4 4-4ZM6.5 13.5h3',
  '/relatorios': 'M4 2.5h6L13 5.5v8H4zM10 2.5v3h3M6.5 8h4M6.5 10.5h4',
  '/clientes': 'M5.5 7.5c.9 0 1.7-.7 1.7-1.7S6.4 4 5.5 4 3.8 4.8 3.8 5.8s.8 1.7 1.7 1.7ZM2 13.5c0-1.9 1.6-3 3.5-3s3.5 1.1 3.5 3M10.5 4.5c.8.2 1.3.9 1.3 1.7s-.5 1.5-1.3 1.7M11.5 10.7c1 .3 2.2 1.2 2.2 2.8',
  '/saude': 'M8 13.5S2.5 10 2.5 6C2.5 4 4 2.8 5.7 2.8c.9 0 1.7.4 2.3 1.1.6-.7 1.4-1.1 2.3-1.1 1.7 0 3.2 1.2 3.2 3.2 0 4-5.5 7.5-5.5 7.5Z',
  '/auditoria': 'M8 2.5 13 4v4c0 3-2.2 4.8-5 5.5C5.2 12.8 3 11 3 8V4zM5.8 8l1.6 1.6L10.2 7',
  '/usuarios': 'M8 8.5c1.4 0 2.5-1.1 2.5-2.5S9.4 3.5 8 3.5 5.5 4.6 5.5 6 6.6 8.5 8 8.5ZM3 13.5c0-2.5 2.2-4 5-4s5 1.5 5 4',
};

function linkClass(active: boolean): string {
  return active
    ? 'flex items-center gap-2.5 rounded-[10px] bg-[var(--color-accent-subtle)] px-3 py-2 text-sm font-semibold text-[var(--color-text)]'
    : 'flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm font-medium text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]';
}

/** Navegação do app: `sidebar` agrupada no desktop, `strip` com scroll no mobile. */
export function AppNav({ groups, variant }: { groups: NavGroup[]; variant: 'sidebar' | 'strip' }) {
  const pathname = usePathname();

  if (variant === 'strip') {
    const flat = groups.flatMap((group) => group.items);
    return (
      <nav aria-label="Principal" className="border-t border-[var(--color-border)] lg:hidden">
        <ul className="no-scrollbar flex gap-1 overflow-x-auto px-4 py-2">
          {flat.map((item) => (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={pathname === item.href ? 'page' : undefined}
                className={linkClass(pathname === item.href)}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    );
  }

  return (
    <nav aria-label="Principal" className="hidden w-60 shrink-0 flex-col gap-6 lg:flex">
      {groups.map((group) => (
        <div key={group.title}>
          <p className="text-mono-eyebrow mb-1.5 px-3">
            {group.title}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={pathname === item.href ? 'page' : undefined}
                  className={linkClass(pathname === item.href)}
                >
                  <Icon d={ICONS[item.href] ?? 'M3 3h10v10H3z'} />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
