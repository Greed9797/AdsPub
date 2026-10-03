import Link from 'next/link';

import { Icon } from '@/components/icons';
import { ThemeSegments } from '@/components/shell/theme-switch';
import { Button } from '@/components/ui/button';
import { mobileGroups, roleLabel } from '@/lib/nav';
import { requireSession } from '@/lib/session';

const ICONE: Record<string, 'bulb' | 'file' | 'bank' | 'chat' | 'users' | 'shield' | 'eye'> = {
  '/inteligencia': 'bulb',
  '/relatorios': 'file',
  '/contas': 'bank',
  '/whatsapp': 'chat',
  '/clientes': 'users',
  '/saude': 'shield',
  '/auditoria': 'eye',
  '/usuarios': 'users',
};

function iniciais(name: string, email: string): string {
  return (name || email)
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((palavra) => palavra[0])
    .join('')
    .toUpperCase();
}

export default async function MaisPage() {
  const user = await requireSession();
  const grupos = mobileGroups(user.role, process.env);
  return (
    <div className="ap-more">
      <h1 className="ap-t-title-m">Mais</h1>

      <div className="ap-more__user">
        <span className="ap-user__avatar ap-more__avatar ap-t-ref" aria-hidden="true">
          {iniciais(user.name, user.email)}
        </span>
        <span className="ap-more__who">
          <span className="ap-t-body-strong">{user.name || user.email}</span>
          <span className="ap-t-stamp ap-user__role">{user.email}</span>
        </span>
        <span className="ap-t-stamp ap-more__role">{roleLabel(user.role)}</span>
      </div>

      {grupos.map((grupo) => (
        <section key={grupo.title} className="ap-more__group" aria-label={grupo.title}>
          <h2 className="ap-t-label ap-more__title">{grupo.title}</h2>
          <ul className="ap-more__list">
            {grupo.items.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="ap-more__item">
                  <span className="ap-more__icon" aria-hidden="true">
                    <Icon name={ICONE[item.href] ?? 'rows'} size={16} />
                  </span>
                  <span className="ap-more__text">
                    <span className="ap-t-body-strong">{item.label}</span>
                    <span className="ap-t-stamp ap-user__role">{item.description}</span>
                  </span>
                  <Icon name="chevron-right" size={16} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="ap-more__group" aria-label="Aparência">
        <h2 className="ap-t-label ap-more__title">Aparência</h2>
        <ThemeSegments />
      </section>

      <form action="/api/auth/logout" method="post">
        <Button variant="secondary" label="Sair do AdPub" type="submit" block />
      </form>
    </div>
  );
}
