'use client';

import Link from 'next/link';
import { Button } from '@astryxdesign/core/Button';

/** Botão Astryx que navega via Next Link (as={Link} não cruza server→client). */
export function ButtonLink({
  variant,
  label,
  href,
}: {
  variant: 'primary' | 'secondary';
  label: string;
  href: string;
}) {
  return <Button variant={variant} label={label} href={href} as={Link} />;
}
