import { eq } from 'drizzle-orm';
import type { ClientInput } from '@adpub/shared';
import { clients } from '../schema.js';
import type { ClientRow } from '../schema.js';
import type { Database } from '../client.js';

export async function createClient(db: Database, input: ClientInput): Promise<ClientRow> {
  const [row] = await db
    .insert(clients)
    .values({
      name: input.name,
      voiceProfile: input.voice_profile,
      namingTemplate: input.naming_template,
      defaultUtm: input.default_utm,
      policyMode: input.policy_mode,
      landingDomains: input.landing_domains,
      advantageCreativeOptout: input.advantage_creative_optout,
    })
    .returning();
  if (!row) throw new Error('Falha ao criar cliente.');
  return row;
}

export async function listClients(db: Database): Promise<ClientRow[]> {
  return db.select().from(clients).orderBy(clients.name);
}

export async function getClient(db: Database, id: string): Promise<ClientRow | undefined> {
  const [row] = await db.select().from(clients).where(eq(clients.id, id));
  return row;
}

export async function updateClient(
  db: Database,
  id: string,
  patch: Partial<ClientInput>,
): Promise<ClientRow | undefined> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.voice_profile !== undefined) set.voiceProfile = patch.voice_profile;
  if (patch.naming_template !== undefined) set.namingTemplate = patch.naming_template;
  if (patch.default_utm !== undefined) set.defaultUtm = patch.default_utm;
  if (patch.policy_mode !== undefined) set.policyMode = patch.policy_mode;
  if (patch.landing_domains !== undefined) set.landingDomains = patch.landing_domains;
  if (patch.advantage_creative_optout !== undefined)
    set.advantageCreativeOptout = patch.advantage_creative_optout;

  const [row] = await db.update(clients).set(set).where(eq(clients.id, id)).returning();
  return row;
}
