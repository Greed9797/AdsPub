import { and, eq, sql } from 'drizzle-orm';
import type { Role } from '@adpub/shared';
import { adAccounts, userAdAccounts, users } from '../schema.js';
import type { UserRow } from '../schema.js';
import type { Database } from '../client.js';

export async function findUserByEmail(db: Database, email: string): Promise<UserRow | undefined> {
  const [row] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
  return row;
}

/** Primeiro usuário do domínio nasce admin; os demais entram como manager. */
export async function upsertUserFromLogin(
  db: Database,
  input: { email: string; name: string; googleSub: string },
): Promise<UserRow> {
  const email = input.email.toLowerCase();
  const existing = await findUserByEmail(db, email);
  if (existing) {
    if (existing.googleSub !== input.googleSub || existing.name !== input.name) {
      const [updated] = await db
        .update(users)
        .set({ googleSub: input.googleSub, name: input.name, updatedAt: new Date() })
        .where(eq(users.id, existing.id))
        .returning();
      return updated ?? existing;
    }
    return existing;
  }
  const [counted] = await db.select({ total: sql<number>`count(*)::int` }).from(users);
  const isFirstUser = (counted?.total ?? 0) === 0;
  const [row] = await db
    .insert(users)
    .values({
      email,
      name: input.name,
      googleSub: input.googleSub,
      role: isFirstUser ? 'admin' : 'manager',
    })
    .returning();
  if (!row) throw new Error('Falha ao criar usuário.');
  return row;
}

export async function listUsers(db: Database): Promise<UserRow[]> {
  return db.select().from(users).orderBy(users.email);
}

export async function setUserRole(db: Database, id: string, role: Role): Promise<UserRow | undefined> {
  const [row] = await db
    .update(users)
    .set({ role, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();
  return row;
}

export async function setUserAccounts(
  db: Database,
  userId: string,
  adAccountIds: readonly string[],
): Promise<void> {
  await db.delete(userAdAccounts).where(eq(userAdAccounts.userId, userId));
  if (adAccountIds.length === 0) return;
  await db
    .insert(userAdAccounts)
    .values(adAccountIds.map((adAccountId) => ({ userId, adAccountId })))
    .onConflictDoNothing();
}

export async function listUserAccounts(db: Database, userId: string): Promise<string[]> {
  const rows = await db
    .select({ id: userAdAccounts.adAccountId })
    .from(userAdAccounts)
    .where(eq(userAdAccounts.userId, userId));
  return rows.map((r) => r.id);
}

export async function userHasAccount(
  db: Database,
  userId: string,
  adAccountId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: userAdAccounts.adAccountId })
    .from(userAdAccounts)
    .where(and(eq(userAdAccounts.userId, userId), eq(userAdAccounts.adAccountId, adAccountId)));
  return Boolean(row);
}

export async function listAdminEmails(db: Database): Promise<string[]> {
  const rows = await db
    .select({ email: users.email })
    .from(users)
    .where(and(eq(users.role, 'admin'), eq(users.active, true)));
  return rows.map((r) => r.email);
}

export async function accountsOfClient(db: Database, clientId: string): Promise<string[]> {
  const rows = await db
    .select({ id: adAccounts.id })
    .from(adAccounts)
    .where(eq(adAccounts.clientId, clientId));
  return rows.map((r) => r.id);
}
