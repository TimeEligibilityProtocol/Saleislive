import { User } from "@saleis-live/domain";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { User as PrismaUser } from "../generated/prisma/client.js";

const BCRYPT_ROUNDS = 12;

function toDomainUser(row: PrismaUser): User {
  return { id: row.id, email: row.email, displayName: row.displayName, createdAt: row.createdAt.toISOString() };
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const row = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  return row ? toDomainUser(row) : undefined;
}

export async function getUserById(id: string): Promise<User | undefined> {
  const row = await prisma.user.findUnique({ where: { id } });
  return row ? toDomainUser(row) : undefined;
}

/** Creates the account and its password credential together — a User row without a Credential can't ever log in, so there's no valid intermediate state to leave lying around. */
export async function createUserWithPassword(input: { email: string; displayName: string; password: string; tenantId?: string }): Promise<User> {
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const row = await prisma.user.create({
    data: {
      id: `u_${randomUUID()}`,
      email: input.email.toLowerCase(),
      displayName: input.displayName,
      tenantId: input.tenantId,
      credential: { create: { passwordHash } },
    },
  });
  return toDomainUser(row);
}

/** Returns the user if email+password match, otherwise undefined — never distinguishes "no such user" from "wrong password" to a caller, so the login route can't be used to enumerate accounts. */
export async function verifyPassword(email: string, password: string): Promise<User | undefined> {
  const row = await prisma.user.findUnique({ where: { email: email.toLowerCase() }, include: { credential: true } });
  if (!row?.credential) return undefined;
  const ok = await bcrypt.compare(password, row.credential.passwordHash);
  return ok ? toDomainUser(row) : undefined;
}

/** Self-service — requires the current password, so a stolen bearer token alone can't silently take over the account. */
export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<boolean> {
  const row = await prisma.user.findUnique({ where: { id: userId }, include: { credential: true } });
  if (!row?.credential) return false;
  const ok = await bcrypt.compare(currentPassword, row.credential.passwordHash);
  if (!ok) return false;
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await prisma.credential.update({ where: { userId }, data: { passwordHash } });
  return true;
}

/**
 * Admin-triggered reset for a locked-out teammate — no email
 * infrastructure exists yet (flagged separately), so this generates a
 * fresh temporary password and returns it once, the same way invite
 * does, for the admin to hand off manually. All of that user's existing
 * sessions are revoked so a lost/stolen token stops working immediately.
 */
export async function resetPasswordForUser(userId: string): Promise<string> {
  const newPassword = randomUUID().replace(/-/g, "").slice(0, 16);
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await prisma.credential.update({ where: { userId }, data: { passwordHash } });
  await prisma.session.deleteMany({ where: { userId } });
  return newPassword;
}

/** The demo brand's first real login — see the login-screen milestone in conversation. Idempotent: does nothing once this account already exists, so it's safe on every boot. */
export const DEMO_OWNER_EMAIL = "ola@saleis.live";
export const DEMO_OWNER_PASSWORD = "SaleisDemo2026!";

export async function ensureSeedData(): Promise<void> {
  const existing = await getUserByEmail(DEMO_OWNER_EMAIL);
  if (existing) return;
  const user = await createUserWithPassword({ email: DEMO_OWNER_EMAIL, displayName: "Ola", password: DEMO_OWNER_PASSWORD, tenantId: "t_demo" });
  await prisma.brandMembership.create({ data: { userId: user.id, brandId: "b_demo", tenantId: "t_demo", role: "group_owner" } });
}
