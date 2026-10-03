import Link from 'next/link';
import type { MouseEventHandler } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';

export interface ButtonProps {
  variant?: ButtonVariant;
  label: string;
  isDisabled?: boolean;
  onClick?: MouseEventHandler<HTMLElement>;
  type?: 'button' | 'submit' | 'reset';
  href?: string;
  size?: 'md' | 'sm';
  block?: boolean;
  className?: string;
}

/** Botão pílula do Figma. Com `href` vira link; sem `href` é <button>. */
export function Button({
  variant = 'secondary',
  label,
  isDisabled = false,
  onClick,
  type = 'button',
  href,
  size = 'md',
  block = false,
  className,
}: ButtonProps) {
  const classes = ['ap-btn', `ap-btn--${variant}`, size === 'sm' && 'ap-btn--sm', block && 'ap-btn--block', className]
    .filter(Boolean)
    .join(' ');
  if (href && !isDisabled) {
    return (
      <Link className={classes} href={href} onClick={onClick}>
        {label}
      </Link>
    );
  }
  return (
    <button className={classes} type={type} disabled={isDisabled} onClick={onClick}>
      {label}
    </button>
  );
}
