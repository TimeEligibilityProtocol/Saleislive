import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { createMembership, getMembership, listMembershipsForUser, roleAtLeast } from "../store/memberships.js";
import { createSession, revokeSession } from "../store/sessions.js";
import { createUserWithPassword, getUserByEmail, verifyPassword } from "../store/users.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function authRouter(): Router {
  const router = Router();

  router.post(
    "/api/auth/login",
    asyncHandler(async (req, res) => {
      const { email, password } = req.body as { email?: string; password?: string };
      if (!email || !password) return res.status(400).json({ error: "missing_fields" });
      const user = await verifyPassword(email, password);
      if (!user) return res.status(401).json({ error: "invalid_credentials" });
      const { token, expiresAt } = await createSession(user.id);
      res.json({ user, token, expiresAt });
    }),
  );

  router.post(
    "/api/auth/logout",
    requireAuth,
    asyncHandler(async (req, res) => {
      const header = req.header("authorization") ?? "";
      const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
      if (token) await revokeSession(token);
      res.json({ ok: true });
    }),
  );

  router.get(
    "/api/auth/me",
    requireAuth,
    asyncHandler(async (req, res) => {
      const memberships = await listMembershipsForUser(req.user!.id);
      res.json({ user: req.user, memberships });
    }),
  );

  /**
   * Adds a new team member to a brand — the "several people at one
   * company" case Ola asked for. Requires an authenticated caller who is
   * already brand_admin/group_owner on that brand (checked inline, not
   * via requireRole, since :brandId lives in the body here, not the URL).
   * No public self-service signup: an account only ever comes from
   * someone who already has access inviting the next person in.
   */
  router.post(
    "/api/auth/invite",
    requireAuth,
    asyncHandler(async (req, res) => {
      const { email, displayName, password, brandId, role, tenantId } = req.body as {
        email?: string;
        displayName?: string;
        password?: string;
        brandId?: string;
        role?: "group_owner" | "brand_admin" | "merchandiser" | "order_manager" | "analyst" | "read_only";
        tenantId?: string;
      };
      if (!email || !EMAIL_PATTERN.test(email)) return res.status(400).json({ error: "invalid_email" });
      if (!displayName?.trim()) return res.status(400).json({ error: "missing_display_name" });
      if (!password || password.length < 8) return res.status(400).json({ error: "weak_password" });
      if (!brandId || !role || !tenantId) return res.status(400).json({ error: "missing_fields" });

      const inviterMembership = await getMembership(req.user!.id, brandId);
      if (!inviterMembership || !roleAtLeast(inviterMembership.role, "brand_admin")) {
        return res.status(403).json({ error: "insufficient_role" });
      }

      const existing = await getUserByEmail(email);
      if (existing) return res.status(409).json({ error: "email_taken" });

      const user = await createUserWithPassword({ email, displayName: displayName.trim(), password, tenantId });
      const membership = await createMembership({ userId: user.id, brandId, tenantId, role });
      res.status(201).json({ user, membership });
    }),
  );

  return router;
}
