import type { ReactNode } from 'react';

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
  const heading = title ?? (typeof children === 'string' ? children : '');
  return (
    <div className="ap-empty">
      <p className="ap-empty__title ap-t-section">{heading}</p>
      {hint ? <p className="ap-empty__hint ap-t-body">{hint}</p> : null}
      {action ? <div className="ap-empty__action">{action}</div> : null}
    </div>
  );
}
