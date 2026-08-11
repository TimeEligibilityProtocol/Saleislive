import { Role, User } from "@saleis-live/domain";
import { NextFunction, Request, Response } from "express";
import { getMembership, roleAtLeast } from "../store/memberships.js";
import { getUserIdForToken } from "../store/sessions.js";
import { getUserById } from "../store/users.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

/**
 * Non-blocking version of requireAuth — resolves `Authorization: Bearer`
 * to a User if it's present and valid, or returns undefined otherwise.
 * Used by the (public, unauthenticated) storefront routes to let a brand
 * owner preview their own not-yet-published store: the request either
 * carries no token at all (a real customer) or a valid one for a member
 * of the specific brand being viewed (see routes/storefront.ts).
 */
export async function resolveOptionalUser(req: Request): Promise<User | undefined> {
  const header = req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  if (!token) return undefined;
  const userId = await getUserIdForToken(token);
  if (!userId) return undefined;
  return getUserById(userId);
}

/** Reads `Authorization: Bearer <token>`, resolves it to a User, and sets req.user. 401s if missing/invalid/expired — every route behind this can assume req.user exists. */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  if (!token) {
    res.status(401).json({ error: "missing_token" });
    return;
  }
  const userId = await getUserIdForToken(token);
  if (!userId) {
    res.status(401).json({ error: "invalid_or_expired_token" });
    return;
  }
  const user = await getUserById(userId);
  if (!user) {
    res.status(401).json({ error: "invalid_or_expired_token" });
    return;
  }
  req.user = user;
  next();
}

/**
 * Must run after requireAuth, on a route with a :brandId param. Checks
 * the caller's BrandMembership role for *that* brand is at least
 * `minimum` — see memberships.ts's ROLE_RANK for the ordering (blueprint
 * §2's role list). Used for the setup-step approve/reject endpoints,
 * where only a brand_admin/group_owner may sign off on someone else's
 * submitted step.
 */
export function requireRole(minimum: Role) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: "missing_token" });
      return;
    }
    const brandId = req.params.brandId;
    const membership = await getMembership(req.user.id, brandId);
    if (!membership || !roleAtLeast(membership.role, minimum)) {
      res.status(403).json({ error: "insufficient_role" });
      return;
    }
    next();
  };
}
