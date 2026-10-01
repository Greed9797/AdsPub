import { desc, eq } from 'drizzle-orm';
import { getCipher } from '@adpub/crypto';
import type { Database } from '../client.js';
import { whatsappAccounts, type WhatsappAccountRow } from '../schema.js';

export type PublicWhatsappAccount = Omit<WhatsappAccountRow, 'tokenCiphertext' | 'tokenIv'>;

export function toPublicWhatsappAccount(row: WhatsappAccountRow): PublicWhatsappAccount {
  const { tokenCiphertext: _ciphertext, tokenIv: _iv, ...rest } = row;
  return rest;
}

export async function listWhatsappAccounts(db: Database): Promise<PublicWhatsappAccount[]> {
  const rows = await db.select().from(whatsappAccounts).orderBy(desc(whatsappAccounts.createdAt));
  return rows.map(toPublicWhatsappAccount);
}

export async function getWhatsappAccount(
  db: Database,
  id: string,
): Promise<WhatsappAccountRow | undefined> {
  const [row] = await db.select().from(whatsappAccounts).where(eq(whatsappAccounts.id, id));
  return row;
}

/** Token em claro — só serviços. Nunca resposta HTTP. */
export async function getWhatsappToken(db: Database, id: string): Promise<string> {
  const row = await getWhatsappAccount(db, id);
  if (!row) throw new Error(`Conta WhatsApp ${id} não encontrada.`);
  return getCipher().decrypt({ ciphertext: row.tokenCiphertext, iv: row.tokenIv });
}

export async function saveWhatsappAccount(
  db: Database,
  input: {
    clientId: string;
    wabaId: string;
    phoneNumberId: string;
    displayName: string;
    displayPhone: string;
    token: string;
  },
): Promise<PublicWhatsappAccount> {
  const sealed = getCipher().encrypt(input.token);
  const [row] = await db
    .insert(whatsappAccounts)
    .values({
      clientId: input.clientId,
      wabaId: input.wabaId,
      phoneNumberId: input.phoneNumberId,
      displayName: input.displayName,
      displayPhone: input.displayPhone,
      tokenCiphertext: sealed.ciphertext,
      tokenIv: sealed.iv,
      status: 'active',
      lastError: null,
    })
    .onConflictDoUpdate({
      target: [whatsappAccounts.wabaId, whatsappAccounts.phoneNumberId],
      set: {
        clientId: input.clientId,
        displayName: input.displayName,
        displayPhone: input.displayPhone,
        tokenCiphertext: sealed.ciphertext,
        tokenIv: sealed.iv,
        status: 'active',
        lastError: null,
        updatedAt: new Date(),
      },
    })
    .returning();
  if (!row) throw new Error('Falha ao salvar conta WhatsApp.');
  return toPublicWhatsappAccount(row);
}

export async function setWhatsappLastError(
  db: Database,
  id: string,
  lastError: string | null,
): Promise<void> {
  await db
    .update(whatsappAccounts)
    .set({ lastError, updatedAt: new Date() })
    .where(eq(whatsappAccounts.id, id));
}
