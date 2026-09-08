/**
 * Ponte entre o servidor de apoio (`scripts/e2e/server.ts`), que semeia o banco,
 * e as specs, que precisam dos IDs gerados (usuário admin, cliente, conta,
 * criativo). O arquivo é reescrito a cada `npx playwright test`.
 */
import { fileURLToPath } from 'node:url';

/** `e2e/.artifacts/seed.json` a partir da raiz do repositório. */
export const SEED_FILE = fileURLToPath(new URL('./.artifacts/seed.json', import.meta.url));

export interface SeedData {
  admin: {
    id: string;
    email: string;
    name: string;
    role: 'admin' | 'coordinator' | 'manager' | 'viewer';
  };
  connection: { id: string; label: string; businessId: string; apiTier: string };
  client: { id: string; name: string; landingDomain: string; utmSource: string };
  account: {
    id: string;
    name: string;
    currency: string;
    timezone: string;
    pageId: string;
    igUserId: string;
    pixelId: string;
    dailyAdCap: number;
  };
  asset: { id: string; filename: string };
  landing: string;
}
