import type { ReactNode } from 'react';

export type CalloutTone = 'info' | 'warn' | 'danger' | 'neutral';

/** Faixa de aviso. `danger` só para perda ou erro; `warn` usa o véu laranja. */
export function Callout({
  tone = 'neutral',
  title,
  children,
  action,
}: {
  tone?: CalloutTone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="ap-callout" data-tone={tone} role={tone === 'danger' ? 'alert' : undefined}>
      <div className="ap-callout__text">
        {title ? <p className="ap-callout__title ap-t-body-strong">{title}</p> : null}
        {children ? <div className="ap-callout__body ap-t-small">{children}</div> : null}
      </div>
      {action ? <div className="ap-callout__action">{action}</div> : null}
    </div>
  );
}
