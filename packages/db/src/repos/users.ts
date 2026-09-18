import { and, eq, sql } from 'drizzle-orm';
import type { Role } from '@adpub/shared';
import { userAdAccounts, users } from '../schema.js';
import type { UserRow } from '../schema.js';
import type { Database } from '../client.js';

export async function findUserByEmail(db: Database, email: string): Promise<UserRow | undefined> {
  const [row] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
  return row;
}

export async function findUserById(db: Database, id: string): Promise<UserRow | undefined> {
  const [row] = await db.select().from(users).where(eq(users.id, id));
  return row;
}

/**
 * Serializa o bootstrap na mesma transação: o lock consultivo transacional
 * (`pg_advisory_xact_lock`) só vale até o fim da transação e na conexão que o
 * adquiriu — fora de transação ele libera no fim do próprio SELECT e dois
 * POSTs concorrentes passariam juntos pelo `hasAnyPassword`. Todo o
 * check+create roda em `tx`, na conexão dona do lock.
 */
export async function withBootstrapLock<T>(
  db: Database,
  fn: (tx: Database) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(424242)`);
    return fn(tx as unknown as Database);
  });
}

/** Papel explícito na criação: admin provisiona; bootstrap cria o primeiro admin. */
export async function createUser(
  db: Database,
  input: { email: string; name: string; role: Role; passwordHash: string },
): Promise<UserRow> {
  const [row] = await db
    .insert(users)
    .values({
      email: input.email.toLowerCase(),
      name: input.name,
      role: input.role,
      passwordHash: input.passwordHash,
    })
    .returning();
  if (!row) throw new Error('Falha ao criar usuário.');
  return row;
}

export async function setUserPassword(
  db: Database,
  id: string,
  passwordHash: string,
): Promise<UserRow | undefined> {
  const [row] = await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();
  return row;
}

export async function setUserActive(
  db: Database,
  id: string,
  active: boolean,
): Promise<UserRow | undefined> {
  const [row] = await db
    .update(users)
    .set({ active, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();
  return row;
}

/**
 * Há ao menos um usuário com senha definida? `false` = banco sem credencial:
 * o bootstrap do primeiro admin continua disponível; `true` o desliga.
 */
export async function hasAnyPassword(db: Database): Promise<boolean> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`${users.passwordHash} is not null`)
    .limit(1);
  return Boolean(row);
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
