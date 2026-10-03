import Link from 'next/link';

/** Filtro em pílula com contagem. Vira link quando há `href`, para funcionar sem JavaScript. */
export function Chip({
  active = false,
  count,
  href,
  children,
}: {
  active?: boolean;
  count?: number | string;
  href?: string;
  children: React.ReactNode;
}) {
  const content = (
    <>
      <span>{children}</span>
      {count !== undefined ? <span className="ap-chip__count ap-t-num-s">{count}</span> : null}
    </>
  );
  const className = active ? 'ap-chip ap-chip--active ap-t-body' : 'ap-chip ap-t-body';
  return href ? (
    <Link className={className} href={href} aria-current={active ? 'true' : undefined}>
      {content}
    </Link>
  ) : (
    <span className={className}>{content}</span>
  );
}
