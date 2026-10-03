import type { ReactNode } from 'react';

/** Tabela semântica em região rolável. Cabeçalho em mono, como no Figma. */
export function Table({ head, children, className }: { head: ReactNode[]; children: ReactNode; className?: string }) {
  return (
    <div className="ap-table-wrap" tabIndex={0} role="region" aria-label="Tabela de dados">
      <table className={className ? `ap-table ${className}` : 'ap-table'}>
        <thead>
          <tr>
            {head.map((cell, index) => (
              <th key={index} className="ap-th ap-t-label" scope="col">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function TableRow({ children, className }: { children: ReactNode; className?: string }) {
  return <tr className={className ? `ap-tr ${className}` : 'ap-tr'}>{children}</tr>;
}

export function TableCell({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={className ? `ap-td ${className}` : 'ap-td'}>{children}</td>;
}
