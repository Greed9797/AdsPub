import type { ReactNode } from 'react';

/** Cabeçalho de página: título em Nunito, descrição e ação principal na mesma base. */
export function PageHead({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="ap-pagehead">
      <div className="ap-pagehead__text">
        <h1 className="ap-t-title">{title}</h1>
        {description ? <p className="ap-pagehead__desc ap-t-body-l">{description}</p> : null}
      </div>
      {action ? <div className="ap-pagehead__actions">{action}</div> : null}
    </div>
  );
}
