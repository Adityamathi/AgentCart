import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { db } from '../db/index.js';
import { env } from '../env.js';
import { newId, nowIso, parseJson } from '../lib/util.js';

export interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  memory: string;
  created_at: string;
  updated_at: string;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface ShoppingMemory {
  preferred_brands?: string[];
  notes?: string[];
  updatedAt?: string;
}

export function toPublicUser(row: Pick<UserRow, 'id' | 'email' | 'name' | 'created_at'>): PublicUser {
  return { id: row.id, email: row.email, name: row.name, createdAt: row.created_at };
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function hashToken(token: string): string {
  return createHash('sha256').update(`${token}:${env.sessionSecret}`).digest('hex');
}

export async function createUser(input: { email: string; name: string; password: string }): Promise<PublicUser> {
  const timestamp = nowIso();
  const id = newId();
  const email = input.email.trim().toLowerCase();
  await db.transaction(async (q) => {
    await q(
      `INSERT INTO users (id, email, name, password_hash, memory, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, email, input.name.trim(), hashPassword(input.password), '{}', timestamp, timestamp],
    );
    await q(
      `INSERT INTO purchasing_policies (id, user_id, max_budget_cents, max_quantity, allowed_categories, blocked_categories, require_approval, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId(), id, 100000, 3, '[]', '[]', 1, timestamp],
    );
  });
  return { id, email, name: input.name.trim(), createdAt: timestamp };
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  return db.one<UserRow>(`SELECT * FROM users WHERE email = ?`, [email.trim().toLowerCase()]);
}

export async function findUserById(id: string): Promise<UserRow | null> {
  return db.one<UserRow>(`SELECT * FROM users WHERE id = ?`, [id]);
}

export async function updateMemory(userId: string, memory: ShoppingMemory): Promise<ShoppingMemory> {
  const next = { ...memory, updatedAt: nowIso() };
  await db.query(`UPDATE users SET memory = ?, updated_at = ? WHERE id = ?`, [JSON.stringify(next), nowIso(), userId]);
  return next;
}

export function readMemory(row: Pick<UserRow, 'memory'>): ShoppingMemory {
  return parseJson<ShoppingMemory>(row.memory, {});
}

export async function createAuthSession(userId: string): Promise<{ token: string; expiresAt: string }> {
  const token = randomBytes(32).toString('hex');
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
  await db.query(
    `INSERT INTO auth_sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`,
    [newId(), userId, hashToken(token), expiresAt, createdAt],
  );
  return { token, expiresAt };
}

export async function findSessionUser(token: string): Promise<PublicUser | null> {
  const row = await db.one<UserRow>(
    `SELECT u.* FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`,
    [hashToken(token), nowIso()],
  );
  return row ? toPublicUser(row) : null;
}

export async function destroySession(token: string): Promise<void> {
  await db.query(`DELETE FROM auth_sessions WHERE token_hash = ?`, [hashToken(token)]);
}

export async function seedDemoAccount(): Promise<void> {
  const existing = await findUserByEmail(env.demoEmail);
  if (existing) return;
  const user = await createUser({ email: env.demoEmail, name: 'Demo buyer', password: env.demoPassword });
  await updateMemory(user.id, {
    notes: ['Development workstation for a robotics lab', 'Prefers NVIDIA GPUs for CUDA work'],
  });
}
