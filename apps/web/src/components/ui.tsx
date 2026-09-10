import type { ReactNode } from 'react';

export function Card({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)]">
      {title ? (
        <header className="flex items-center justify-between px-4 py-3">
          <h2 className="text-sm font-semibold tracking-[-0.01em]">{title}</h2>
          {action}
        </header>
      ) : null}
      <div className="p-4">{children}</div>
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
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--color-muted)]">
          <tr>
            {head.map((cell, index) => (
              <th key={index} className="px-3 py-2 font-medium">
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

export function Empty({ children }: { children: ReactNode }) {
  return <p className="p-6 text-center text-sm text-[var(--color-muted)]">{children}</p>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-[0.14em] text-[var(--color-muted)]">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-[var(--color-muted)]">{hint}</span> : null}
    </label>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--color-brand)]">{children}</p>
  );
}

export const inputClass =
  'w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-brand)]';

export const buttonClass =
  'inline-flex min-h-[52px] items-center gap-2 rounded-[10px] bg-[var(--color-brand)] px-[22px] py-2 text-sm font-semibold tracking-[0.02em] text-white hover:bg-[var(--color-brand-deep)] disabled:opacity-50';

export const secondaryButtonClass =
  'inline-flex min-h-[44px] items-center gap-2 rounded-[10px] border border-[var(--color-border)] px-3 py-2 text-sm font-medium tracking-[0.02em] disabled:opacity-50';
