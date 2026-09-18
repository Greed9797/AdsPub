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
  disapproved: 'Reprovado',
  in_review: 'Em análise',
  uploading_media: 'Enviando mídia',
  ensuring_campaign: 'Preparando campanha',
  ensuring_adset: 'Preparando conjunto',
  creating_creative: 'Preparando criativo',
  creating_ad: 'Criando anúncio',
  needs_reconciliation: 'Precisa de conferência',
  // Etapas do pipeline: aparecem no item e no painel de conferência.
  upload_media: 'Envio de mídia',
  ensure_campaign: 'Campanha',
  ensure_adset: 'Conjunto',
  create_creative: 'Criativo',
  create_ad: 'Anúncio',
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

export const GOAL_PT: Record<string, string> = {
  OFFSITE_CONVERSIONS: 'Vendas no site',
  LINK_CLICKS: 'Cliques no link',
  LANDING_PAGE_VIEWS: 'Visitas na página',
  LEAD_GENERATION: 'Cadastros',
  QUALITY_LEAD: 'Cadastros qualificados',
  POST_ENGAGEMENT: 'Interação no post',
  REACH: 'Alcance',
  THRUPLAY: 'Vídeo assistido',
  IMPRESSIONS: 'Exibições',
  OUTCOME_SALES: 'Vender',
  OUTCOME_LEADS: 'Gerar cadastros',
  OUTCOME_TRAFFIC: 'Levar visitas',
  OUTCOME_ENGAGEMENT: 'Gerar interação',
};

export function goalLabel(goal: string): string {
  return GOAL_PT[goal] ?? goal;
}

const MOEDA_PT: Record<string, string> = {
  BRL: 'Real (R$)',
  USD: 'Dólar (US$)',
  EUR: 'Euro (€)',
};

export function moedaLabel(code: string): string {
  return MOEDA_PT[code] ?? code;
}

/** America/Sao_Paulo → São Paulo (SP). */
export function fusoLabel(tz: string): string {
  const city = tz.split('/').pop() ?? tz;
  const named: Record<string, string> = {
    Sao_Paulo: 'São Paulo',
    Bahia: 'Bahia',
    Belem: 'Belém',
    Noronha: 'Noronha',
  };
  return named[city] ?? city.replace(/_/g, ' ');
}

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
    <div className="page-head">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {description ? <p className="page-description">{description}</p> : null}
      </div>
      {action ? <div className="page-actions">{action}</div> : null}
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
  /** Compact data summary; shares the same surface as other panels. */
  variant?: 'default' | 'stat';
}) {
  return (
    <AstryxCard
      padding={0}
      className={`surface-panel${variant === 'stat' ? ' summary-panel' : ''}`}
    >
      {title ? (
        <header className="panel-head">
          <h2>{title}</h2>
          {action}
        </header>
      ) : null}
      <div className="panel-body">{children}</div>
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

export function Badge({
  tone = 'info',
  children,
}: {
  tone?: keyof typeof TONE | string;
  children: ReactNode;
}) {
  return (
    <AstryxBadge
      className="status-badge"
      variant={TONE[tone as keyof typeof TONE] ?? 'neutral'}
      label={children}
    />
  );
}

export function Table({ head, children, className }: { head: ReactNode[]; children: ReactNode; className?: string }) {
  return (
    <div className="data-table-scroll" tabIndex={0} role="region" aria-label="Tabela de dados">
      <AstryxTable className={className ? `data-table ${className}` : 'data-table'} hasHover dividers="rows">
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
  const generatedID = useId();
  const element = isValidElement(children)
    ? (children as ReactElement<{ id?: string; 'aria-describedby'?: string }>)
    : undefined;
  const inputID = element?.props.id ?? generatedID;
  const descriptionID = hint ? `${inputID}-description` : undefined;
  const control = element
    ? cloneElement(element, {
        id: inputID,
        'aria-describedby':
          [element.props['aria-describedby'], descriptionID].filter(Boolean).join(' ') || undefined,
      })
    : children;
  return (
    <div className={`adpub-field ${className ?? ''}`}>
      <AstryxField label={label} inputID={inputID} description={hint} descriptionID={descriptionID}>
        {control}
      </AstryxField>
    </div>
  );
}

export const inputClass = 'field-control';
