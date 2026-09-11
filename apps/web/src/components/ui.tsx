import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';
import { Card as AstryxCard } from '@astryxdesign/core/Card';
import { Badge as AstryxBadge } from '@astryxdesign/core/Badge';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Field as AstryxField } from '@astryxdesign/core/Field';

/** Rótulos em PT para leigos. Slugs continuam iguais no código, API e testes. */
export const STATUS_PT: Record<string, string> = {
  draft: 'Rascunho',
  ready: 'Pronto',
  blocked: 'Bloqueado',
  queued: 'Na fila',
  publishing: 'Publicando',
  done: 'Concluído',
  published: 'Publicado',
  partial: 'Parcial',
  failed: 'Falhou',
  archived: 'Arquivado',
  approved: 'Aprovado',
};

export function statusLabel(status: string): string {
  return STATUS_PT[status] ?? status;
}

export const CTA_PT: Record<string, string> = {
  SHOP_NOW: 'Comprar agora',
  LEARN_MORE: 'Saiba mais',
  SIGN_UP: 'Cadastre-se',
  SUBSCRIBE: 'Assinar',
  DOWNLOAD: 'Baixar',
  GET_OFFER: 'Ver oferta',
  GET_QUOTE: 'Pedir orçamento',
  CONTACT_US: 'Fale conosco',
  APPLY_NOW: 'Candidatar-se',
  BOOK_TRAVEL: 'Reservar viagem',
  ORDER_NOW: 'Pedir agora',
  SEND_MESSAGE: 'Enviar mensagem',
  WHATSAPP_MESSAGE: 'Chamar no WhatsApp',
  SEE_MENU: 'Ver cardápio',
  DONATE_NOW: 'Doar agora',
  NO_BUTTON: 'Sem botão',
};

export function ctaLabel(cta: string): string {
  return CTA_PT[cta] ?? cta;
}

export const FORMAT_PT: Record<string, string> = {
  single_image: 'Imagem única',
  single_video: 'Vídeo único',
  carousel: 'Carrossel',
};

export function formatLabel(format: string): string {
  return FORMAT_PT[format] ?? format;
}

/** "1 anúncio" / "3 anúncios" — sem robô. */
export function plural(count: number, one: string, many: string): string {
  return count === 1 ? `1 ${one}` : `${count} ${many}`;
}
import { Table as AstryxTable } from '@astryxdesign/core/Table';
import { TableBody } from '@astryxdesign/core/Table';
import { TableHeader } from '@astryxdesign/core/Table';
import { TableHeaderCell } from '@astryxdesign/core/Table';
import { TableRow } from '@astryxdesign/core/Table';

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
    <div>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-display text-[28px]">{title}</h1>
          {description ? <p className="mt-1 text-sm text-[var(--color-muted)]">{description}</p> : null}
        </div>
        {action}
      </div>
      <div className="mt-4 h-px bg-[var(--color-border)]" aria-hidden="true" />
    </div>
  );
}

export function Card({
  title,
  action,
  children,
  variant = 'default',
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  /** 'stat' aplica o crystalline stat-card da ID Pulmão (KPIs). */
  variant?: 'default' | 'stat';
}) {
  return (
    <AstryxCard padding={0} className={variant === 'stat' ? 'stat-card' : 'liquid-glass rounded-[14px]'}>
      {title ? (
        <header className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-5 py-3.5">
          <h2 className="text-sm font-semibold tracking-[-0.01em]">{title}</h2>
          {action}
        </header>
      ) : null}
      <div className="p-5">{children}</div>
    </AstryxCard>
  );
}

const TONE = {
  ok: 'success',
  warn: 'warning',
  danger: 'error',
  info: 'neutral',
  brand: 'orange',
} as const;

export function Badge({ tone = 'info', children }: { tone?: keyof typeof TONE | string; children: ReactNode }) {
  return <AstryxBadge variant={TONE[tone as keyof typeof TONE] ?? 'neutral'} label={children} />;
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <AstryxTable hasHover dividers="rows">
        <TableHeader>
          <TableRow>
            {head.map((cell, index) => (
              <TableHeaderCell key={index}>{cell}</TableHeaderCell>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>{children}</TableBody>
      </AstryxTable>
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
  if (!title && typeof children === 'string') {
    return <EmptyState title={children} description={hint} actions={action} />;
  }
  return <EmptyState title={title ?? ''} description={hint} actions={action} />;
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
  const inputID = useId();
  const control =
    isValidElement(children) && !(children.props as { id?: string }).id
      ? cloneElement(children as ReactElement<{ id?: string }>, { id: inputID })
      : children;
  return (
    <div className={`min-w-0 ${className ?? ''}`}>
      <AstryxField label={label} inputID={inputID} description={hint}>
        {control}
      </AstryxField>
    </div>
  );
}

export const inputClass =
  'h-10 w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 text-sm outline-none focus:border-[var(--color-brand)] focus-visible:ring-2 focus-visible:ring-[var(--color-brand)]/40';
