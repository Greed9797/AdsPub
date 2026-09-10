import type { ReactNode } from 'react';

/** Cabeçalho padrão de página: título + descrição + ação primária na mesma base. */
export function PageHead({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.03em]">{title}</h1>
        {description ? <p className="mt-1 text-sm text-[var(--color-muted)]">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Card({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)]">
      {title ? (
        <header className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-5 py-3.5">
          <h2 className="text-sm font-semibold tracking-[-0.01em]">{title}</h2>
          {action}
        </header>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  );
}

const TONE: Record<string, string> = {
  ok: 'border-[var(--color-ok)] text-[var(--color-ok)]',
  warn: 'border-[var(--color-warn)] text-[var(--color-warn)]',
  danger: 'border-[var(--color-danger)] text-[var(--color-danger)]',
  info: 'border-[var(--color-border)] text-[var(--color-muted)]',
  brand: 'border-[var(--color-brand)] bg-[var(--color-accent-subtle)] text-[var(--color-brand)]',
};

export function Badge({ tone = 'info', children }: { tone?: keyof typeof TONE | string; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium tracking-[0.02em] ${TONE[tone] ?? TONE.info}`}
    >
      {children}
    </span>
  );
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="adpub-table w-full text-left text-sm tabular-nums">
        <thead className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-muted)]">
          <tr className="border-b border-[var(--color-border)]">
            {head.map((cell, index) => (
              <th key={index} className="whitespace-nowrap px-3 py-2.5 font-medium first:pl-0 last:pr-0">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)]">{children}</tbody>
      </table>
    </div>
  );
}

export function Empty({
  title,
  hint,
  action,
  children,
}: {
  title?: string;
  hint?: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-6 py-10 text-center">
      {title ? <p className="text-sm font-semibold">{title}</p> : null}
      {hint ? <p className="max-w-md text-sm text-[var(--color-muted)]">{hint}</p> : null}
      {children && !title ? <p className="text-sm text-[var(--color-muted)]">{children}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block min-w-0 ${className ?? ''}`}>
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-[var(--color-muted)]">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  'h-10 w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm outline-none focus:border-[var(--color-brand)] focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/40';

export const buttonClass =
  'inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-[10px] bg-[var(--color-brand)] px-4 text-sm font-semibold tracking-[0.01em] text-white hover:bg-[var(--color-brand-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)] disabled:opacity-50';

export const secondaryButtonClass =
  'inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-[10px] border border-[var(--color-border)] px-4 text-sm font-medium tracking-[0.01em] hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/60 disabled:opacity-50';
