import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { clearLoginAttempts, isLoginRateLimited, recordLoginAttempt } from "../lib/loginRateLimit.js";
import { listAuditLog, logAudit } from "../store/auditLog.js";
import { createMembership, getMembership, listMembershipsForUser, listTeamForBrand, removeMembership, roleAtLeast, updateMembershipRole } from "../store/memberships.js";
import { createSession, revokeSession } from "../store/sessions.js";
import { createBrand, createTenant, isSlugAvailable } from "../store/tenants.js";
import { changePassword, createUserWithPassword, getUserByEmail, resetPasswordForUser, verifyPassword } from "../store/users.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_PATTERN = /^[a-z0-9-]{2,32}$/;
const ROLE_VALUES = ["group_owner", "brand_admin", "merchandiser", "order_manager", "analyst", "read_only"] as const;
type RoleValue = (typeof ROLE_VALUES)[number];
function isRole(v: unknown): v is RoleValue {
  return typeof v === "string" && (ROLE_VALUES as readonly string[]).includes(v);
}

export function authRouter(): Router {
  const router = Router();

  router.post(
    "/api/auth/login",
    asyncHandler(async (req, res) => {
      const { email, password } = req.body as { email?: string; password?: string };
      if (!email || !password) return res.status(400).json({ error: "missing_fields" });
      if (isLoginRateLimited(email)) return res.status(429).json({ error: "too_many_attempts" });
      const user = await verifyPassword(email, password);
      if (!user) {
        recordLoginAttempt(email);
        return res.status(401).json({ error: "invalid_credentials" });
      }
      clearLoginAttempts(email);
      const { token, expiresAt } = await createSession(user.id);
      res.json({ user, token, expiresAt });
    }),
  );

  /**
   * The one and only self-service account-creation route — everyone before
   * this was either the seeded demo user or someone invited by an existing
   * admin (see /api/auth/invite's doc comment, now out of date). Creates a
   * brand-new Tenant + User + Brand + group_owner membership together in
   * one call: a person who owns nothing yet can't create a Brand without
   * also getting a Tenant to own it and a membership to access it, so
   * there's no valid halfway state to leave lying around if any step here
   * fails partway (kept simple with try/best-effort rather than a full DB
   * transaction, since this is a brand-new, low-contention row set).
   */
  router.post(
    "/api/auth/signup",
    asyncHandler(async (req, res) => {
      const { email, password, displayName, brand } = req.body as {
        email?: string;
        password?: string;
        displayName?: string;
        brand?: { name?: string; slug?: string; country?: string; currency?: string; language?: string; secondaryLanguage?: string | null };
      };
      if (!email || !EMAIL_PATTERN.test(email)) return res.status(400).json({ error: "invalid_email" });
      if (!password || password.length < 8) return res.status(400).json({ error: "weak_password" });
      if (!displayName?.trim()) return res.status(400).json({ error: "missing_display_name" });
      if (!brand?.name?.trim() || !brand.slug || !brand.country || !brand.currency || !brand.language) {
        return res.status(400).json({ error: "missing_brand_fields" });
      }
      const slug = brand.slug.toLowerCase();
      if (!SLUG_PATTERN.test(slug)) return res.status(400).json({ error: "invalid_slug" });

      if (await getUserByEmail(email)) return res.status(409).json({ error: "email_taken" });
      if (!(await isSlugAvailable(slug))) return res.status(409).json({ error: "slug_taken" });

      const tenant = await createTenant(brand.name.trim());
      const user = await createUserWithPassword({ email, displayName: displayName.trim(), password, tenantId: tenant.id });
      const newBrand = await createBrand({
        tenantId: tenant.id,
        name: brand.name.trim(),
        slug,
        country: brand.country,
        currency: brand.currency,
        language: brand.language,
        secondaryLanguage: brand.secondaryLanguage ?? null,
      });
      await createMembership({ userId: user.id, brandId: newBrand.id, tenantId: tenant.id, role: "group_owner" });
      await logAudit({ tenantId: tenant.id, brandId: newBrand.id, userId: user.id, action: "brand.created", entityType: "brand", entityId: newBrand.id, metadata: { name: newBrand.name, slug, viaSignup: true } });

      const { token, expiresAt } = await createSession(user.id);
      res.status(201).json({ user, token, expiresAt, brand: newBrand });
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

  /** Self-service — requires the current password. */
  router.post(
    "/api/auth/change-password",
    requireAuth,
    asyncHandler(async (req, res) => {
      const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
      if (!currentPassword || !newPassword) return res.status(400).json({ error: "missing_fields" });
      if (newPassword.length < 8) return res.status(400).json({ error: "weak_password" });
      const ok = await changePassword(req.user!.id, currentPassword, newPassword);
      if (!ok) return res.status(401).json({ error: "invalid_current_password" });
      res.json({ ok: true });
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
        role?: RoleValue;
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
      await logAudit({ tenantId, brandId, userId: req.user!.id, action: "membership.created", entityType: "user", entityId: user.id, metadata: { role, email } });
      res.status(201).json({ user, membership });
    }),
  );

  router.get(
    "/api/brands/:brandId/team",
    requireAuth,
    requireRole("read_only"),
    asyncHandler(async (req, res) => {
      res.json({ team: await listTeamForBrand(req.params.brandId) });
    }),
  );

  router.patch(
    "/api/brands/:brandId/team/:userId",
    requireAuth,
    requireRole("brand_admin"),
    asyncHandler(async (req, res) => {
      const { role } = req.body as { role?: unknown };
      if (!isRole(role)) return res.status(400).json({ error: "invalid_role" });
      const updated = await updateMembershipRole(req.params.userId, req.params.brandId, role);
      if (!updated) return res.status(404).json({ error: "not_found" });
      await logAudit({ tenantId: updated.tenantId, brandId: updated.brandId, userId: req.user!.id, action: "membership.role_changed", entityType: "user", entityId: req.params.userId, metadata: { role } });
      res.json({ membership: updated });
    }),
  );

  /** A group_owner can't be locked out of their own brand by another brand_admin, and can't accidentally remove themselves this way either — both blocked below. */
  router.delete(
    "/api/brands/:brandId/team/:userId",
    requireAuth,
    requireRole("brand_admin"),
    asyncHandler(async (req, res) => {
      if (req.params.userId === req.user!.id) return res.status(400).json({ error: "cannot_remove_self" });
      const target = await getMembership(req.params.userId, req.params.brandId);
      if (!target) return res.status(404).json({ error: "not_found" });
      if (target.role === "group_owner") return res.status(403).json({ error: "cannot_remove_owner" });
      const ok = await removeMembership(req.params.userId, req.params.brandId);
      if (!ok) return res.status(404).json({ error: "not_found" });
      await logAudit({ tenantId: target.tenantId, brandId: target.brandId, userId: req.user!.id, action: "membership.removed", entityType: "user", entityId: req.params.userId });
      res.json({ ok: true });
    }),
  );

  /** Locked-out teammate: an admin regenerates their password and hands it off manually — same reasoning as invite, no email infra exists yet. */
  router.post(
    "/api/brands/:brandId/team/:userId/reset-password",
    requireAuth,
    requireRole("brand_admin"),
    asyncHandler(async (req, res) => {
      const target = await getMembership(req.params.userId, req.params.brandId);
      if (!target) return res.status(404).json({ error: "not_found" });
      const newPassword = await resetPasswordForUser(req.params.userId);
      await logAudit({ tenantId: target.tenantId, brandId: target.brandId, userId: req.user!.id, action: "membership.password_reset", entityType: "user", entityId: req.params.userId });
      res.json({ newPassword });
    }),
  );

  /** Blueprint §12: "Każda publikacja, zmiana ceny i refund wskazuje użytkownika oraz czas." Restricted to brand_admin+ since it can reveal who did what to sensitive data (prices, refunds). */
  router.get(
    "/api/brands/:brandId/audit-log",
    requireAuth,
    requireRole("brand_admin"),
    asyncHandler(async (req, res) => {
      res.json({ entries: await listAuditLog(req.params.brandId) });
    }),
  );

  return router;
}
