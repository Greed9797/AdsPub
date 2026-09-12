import { eq } from 'drizzle-orm';
import { normalizeVoiceProfile, type ClientInput } from '@adpub/shared';
import { clients } from '../schema.js';
import type { ClientRow } from '../schema.js';
import type { Database } from '../client.js';

/**
 * Perfil de voz lido do banco passa pelo schema: linha gravada por script
 * antigo ou seed incompleto não pode derrubar a geração com campo ausente —
 * o schema tem os padrões e é ele que manda.
 */
function withVoiceProfile(row: ClientRow): ClientRow {
  return { ...row, voiceProfile: normalizeVoiceProfile(row.voiceProfile) };
}

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
  return withVoiceProfile(row);
}

export async function listClients(db: Database): Promise<ClientRow[]> {
  const rows = await db.select().from(clients).orderBy(clients.name);
  return rows.map(withVoiceProfile);
}

export async function getClient(db: Database, id: string): Promise<ClientRow | undefined> {
  const [row] = await db.select().from(clients).where(eq(clients.id, id));
  return row ? withVoiceProfile(row) : undefined;
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
  return row ? withVoiceProfile(row) : undefined;
}
