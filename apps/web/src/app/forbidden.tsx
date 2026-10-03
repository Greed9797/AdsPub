import { Forbidden } from '@/components/forbidden';
import { roleLabel } from '@/lib/nav';
import { currentSession } from '@/lib/session';

/** Renderizada quando uma rota chama `forbidden()` (ver `requireRole`). Responde 403. */
export default async function ForbiddenPage() {
  let papel: string | undefined;
  try {
    const user = await currentSession();
    papel = user ? roleLabel(user.role) : undefined;
  } catch {
    papel = undefined;
  }
  return <Forbidden papel={papel} />;
}
