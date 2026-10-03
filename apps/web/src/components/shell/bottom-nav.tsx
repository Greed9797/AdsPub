'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Icon } from '../icons';
import { activeTabId, type TabId } from '../../lib/nav';

const ITENS: ReadonlyArray<{ id: TabId; href: string; label: string; icon: 'rows' | 'image' | 'chart' | 'bank' | 'menu' }> = [
  { id: 'lotes', href: '/', label: 'Lotes', icon: 'rows' },
  { id: 'criativos', href: '/criativos', label: 'Criativos', icon: 'image' },
  { id: 'performance', href: '/performance', label: 'Performance', icon: 'chart' },
  { id: 'contas', href: '/contas', label: 'Contas', icon: 'bank' },
  { id: 'mais', href: '/mais', label: 'Mais', icon: 'menu' },
];

/** Barra inferior do mobile. A aba Gestão é alcançada por "Mais", então ela marca "Mais". */
export function BottomNav() {
  const ativa = activeTabId(usePathname());
  const atual = ativa === 'gestao' ? 'mais' : ativa;
  return (
    <nav className="ap-bottomnav" aria-label="Navegação do app">
      {ITENS.map((item) => (
        <Link key={item.id} href={item.href} className="ap-bottomnav__item" aria-current={atual === item.id ? 'page' : undefined}>
          <span className="ap-bottomnav__pill">
            <Icon name={item.icon} size={18} />
          </span>
          <span className="ap-t-stamp">{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
