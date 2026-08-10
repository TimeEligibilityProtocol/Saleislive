import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../lib/prisma.js";

const SESSION_TTL_DAYS = 30;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Returns the raw token — this is the only time it ever exists in plain form; the DB only ever stores its hash. */
export async function createSession(userId: string): Promise<{ token: string; expiresAt: string }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt } });
  return { token, expiresAt: expiresAt.toISOString() };
}

export async function getUserIdForToken(token: string): Promise<string | undefined> {
  const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!session) return undefined;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return undefined;
  }
  return session.userId;
}

export async function revokeSession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}
