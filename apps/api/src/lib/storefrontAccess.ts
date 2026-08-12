import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * "This visitor already typed the right password for this campaign" tokens
 * for anonymous storefront visitors — stateless (HMAC-signed, no DB row),
 * so unlike Credential.passwordHash it doesn't need a persisted secret: a
 * redeploy rotating the in-memory secret just means re-entering the
 * password, not a security problem. Reuses the same Authorization: Bearer
 * slot the admin's storefront-preview token already travels in (see
 * routes/storefront.ts) — resolveOptionalUser simply fails to match it to
 * any Session, which is the correct fallback behaviour for both.
 */
const SECRET = process.env.STOREFRONT_ACCESS_SECRET || randomBytes(32).toString("hex");
const TTL_MS = 1000 * 60 * 60 * 24 * 30;

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("hex");
}

export function signStorefrontUnlockToken(campaignId: string): string {
  const expiresAt = Date.now() + TTL_MS;
  const payload = `${campaignId}.${expiresAt}`;
  return Buffer.from(`${payload}.${sign(payload)}`).toString("base64url");
}

export function verifyStorefrontUnlockToken(token: string, campaignId: string): boolean {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const parts = decoded.split(".");
    if (parts.length !== 3) return false;
    const [id, expiresAtRaw, sig] = parts;
    if (id !== campaignId) return false;
    if (Date.now() > Number(expiresAtRaw)) return false;
    const expected = Buffer.from(sign(`${id}.${expiresAtRaw}`), "hex");
    const actual = Buffer.from(sig, "hex");
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
