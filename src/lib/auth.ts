import crypto from 'crypto';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { users, userSessions } from '../db/schema.ts';
import { adminAuth } from './firebase-admin.ts';
import type { UserRole } from '../types.ts';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  department: string;
  status: 'Active' | 'Inactive';
  authProvider: 'local' | 'firebase';
}

const SESSION_SECRET =
  process.env.SESSION_SECRET?.trim() || crypto.randomBytes(32).toString('hex');

export function hashPassword(password: string, existingSalt?: string): { salt: string; hash: string } {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64);
  return {
    salt,
    hash: derived.toString('hex'),
  };
}

export function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  if (!password || !salt || !expectedHash) return false;
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const expectedBuf = Buffer.from(expectedHash, 'hex');
    if (derived.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(derived, expectedBuf);
  } catch {
    return false;
  }
}

export function hashToken(rawToken: string): string {
  return crypto.createHmac('sha256', SESSION_SECRET).update(rawToken).digest('hex');
}

export async function createUserSession(userId: string, rememberMe = true): Promise<string> {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const ttlHours = rememberMe ? 24 * 7 : 12;
  const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000);

  await db.insert(userSessions).values({
    tokenHash,
    userId,
    expiresAt,
  });

  await db
    .update(users)
    .set({
      lastActive: 'Online now',
      lastActiveAt: new Date(),
    })
    .where(eq(users.id, userId));

  return rawToken;
}

export async function revokeSession(rawToken: string): Promise<void> {
  if (!rawToken) return;
  const tokenHash = hashToken(rawToken);
  await db
    .update(userSessions)
    .set({ revokedAt: new Date() })
    .where(eq(userSessions.tokenHash, tokenHash));
}

const VALID_ROLES: UserRole[] = [
  'System Admin',
  'Factory Manager',
  'Maintenance Engineer',
  'Quality Inspector',
  'Operator',
];

function normalizeRole(role: string): UserRole {
  return VALID_ROLES.includes(role as UserRole) ? (role as UserRole) : 'Operator';
}

export async function upsertFirebaseUser(
  uid: string,
  email: string,
  displayName?: string
): Promise<AuthenticatedUser> {
  const cleanEmail = email.trim().toLowerCase();
  const existingByEmail = await db
    .select()
    .from(users)
    .where(eq(users.email, cleanEmail))
    .limit(1);

  if (existingByEmail.length > 0) {
    const u = existingByEmail[0];
    const [updated] = await db
      .update(users)
      .set({
        uid,
        lastActive: 'Online now',
        lastActiveAt: new Date(),
      })
      .where(eq(users.id, u.id))
      .returning();
    return {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      role: normalizeRole(updated.role),
      department: updated.department,
      status: updated.status === 'Inactive' ? 'Inactive' : 'Active',
      authProvider: 'firebase',
    };
  }

  // Determine initial role: first user or matching admin email gets System Admin, otherwise Operator
  const allUsers = await db.select({ id: users.id }).from(users).limit(1);
  const initialRole: UserRole = allUsers.length === 0 ? 'System Admin' : 'Operator';
  const { salt, hash } = hashPassword(crypto.randomBytes(24).toString('hex'));
  const newId = `USR-${Date.now().toString().slice(-6)}`;
  const name =
    displayName?.trim() ||
    cleanEmail
      .split('@')[0]
      .replace(/[._]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());

  const [created] = await db
    .insert(users)
    .values({
      id: newId,
      uid,
      email: cleanEmail,
      name,
      passwordHash: hash,
      passwordSalt: salt,
      role: initialRole,
      status: 'Active',
      department: initialRole === 'System Admin' ? 'Platform Administration' : 'Plant Operations',
      lastActive: 'Online now',
    })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        uid,
        lastActive: 'Online now',
        lastActiveAt: new Date(),
      },
    })
    .returning();

  return {
    id: created.id,
    email: created.email,
    name: created.name,
    role: normalizeRole(created.role),
    department: created.department,
    status: created.status === 'Inactive' ? 'Inactive' : 'Active',
    authProvider: 'firebase',
  };
}

export async function verifyBearerToken(rawToken: string): Promise<AuthenticatedUser | null> {
  if (!rawToken) return null;

  // 1. Check PostgreSQL user_sessions first (local scrypt login sessions)
  const tokenHash = hashToken(rawToken);
  const now = new Date();
  const rows = await db
    .select({
      user: users,
      session: userSessions,
    })
    .from(userSessions)
    .innerJoin(users, eq(userSessions.userId, users.id))
    .where(
      and(
        eq(userSessions.tokenHash, tokenHash),
        isNull(userSessions.revokedAt),
        gt(userSessions.expiresAt, now)
      )
    )
    .limit(1);

  if (rows.length > 0) {
    const u = rows[0].user;
    if (u.status !== 'Active') return null;
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      role: normalizeRole(u.role),
      department: u.department,
      status: 'Active',
      authProvider: 'local',
    };
  }

  // 2. Fallback: verify Firebase ID token if token is a JWT
  if (rawToken.split('.').length === 3) {
    try {
      const decoded = await adminAuth.verifyIdToken(rawToken);
      if (!decoded.email) return null;
      const user = await upsertFirebaseUser(decoded.uid, decoded.email, decoded.name);
      if (user.status !== 'Active') return null;
      return user;
    } catch {
      return null;
    }
  }

  return null;
}
