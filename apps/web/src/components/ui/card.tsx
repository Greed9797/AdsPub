import type { ReactNode } from 'react';

export function Card({
  title,
  action,
  children,
  variant = 'default',
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  /** Resumo compacto; mesma superfície dos outros painéis. */
  variant?: 'default' | 'stat';
}) {
  return (
    <section className={variant === 'stat' ? 'ap-card ap-card--stat' : 'ap-card'}>
      {title ? (
        <header className="ap-card__head">
          <h2 className="ap-t-block">{title}</h2>
          {action}
        </header>
      ) : null}
      <div className="ap-card__body">{children}</div>
    </section>
  );
}
