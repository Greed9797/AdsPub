import { Button } from '@/components/ui/button';

/** Botão que navega por link. Mantido para os usos que já importam `ButtonLink`. */
export function ButtonLink({
  variant,
  label,
  href,
}: {
  variant: 'primary' | 'secondary';
  label: string;
  href: string;
}) {
  return <Button variant={variant} label={label} href={href} />;
}
