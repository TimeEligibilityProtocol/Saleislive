import { Campaign } from "@saleis-live/domain";
import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { signStorefrontUnlockToken, verifyStorefrontUnlockToken } from "../lib/storefrontAccess.js";
import { resolveOptionalUser } from "../middleware/auth.js";
import { requireBrand } from "../middleware/tenantRouter.js";
import { getOrCreateCurrentCampaign, verifyCampaignAccessPassword } from "../store/campaigns.js";
import { getMembership } from "../store/memberships.js";
import { listProductsForBrand } from "../store/products.js";

/**
 * Real customer traffic vs. the brand owner previewing their own
 * not-yet-published store look identical at the routing layer (same
 * shared host + ?brand=slug until wildcard subdomains exist — see
 * tenantRouter's doc comment), so this is the only thing that can tell
 * them apart: an unpublished brand (status !== "active") only serves
 * real catalog data to a request carrying a valid session token for a
 * member of THAT brand. Everyone else gets a "coming soon" shape instead
 * (empty products, previewing:false) — see App.tsx's admin-side
 * resolveStorefrontPreviewUrl for how the preview token reaches here.
 */
async function isPreviewAuthorized(req: import("express").Request, brandId: string): Promise<boolean> {
  const user = await resolveOptionalUser(req);
  if (!user) return false;
  const membership = await getMembership(user.id, brandId);
  return !!membership;
}

function bearerToken(req: import("express").Request): string | null {
  const header = req.header("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
}

/**
 * Only "password" campaigns ever gate a real customer's read access — see
 * Ola's 2026-08-12 access model: "private"/"unlisted" and (for now, until
 * a real allowlist exists) "invite" must stay reachable to anyone with the
 * link, no barrier, only hidden from listings/search (handled client-side
 * via a noindex meta tag, since Google's crawler does run JS unlike social
 * link-preview crawlers). A brand owner/team member previewing their own
 * unpublished store always bypasses this, same as the brand-active gate.
 */
async function isLocked(req: import("express").Request, campaign: Campaign, previewAuthorized: boolean): Promise<boolean> {
  if (previewAuthorized) return false;
  if (campaign.access !== "password") return false;
  const token = bearerToken(req);
  return !(token && verifyStorefrontUnlockToken(token, campaign.id));
}

/** What the storefront app calls on load to find out which brand it's rendering, resolved from the request's Host header. */
export function storefrontRouter(): Router {
  const router = Router();
  router.get(
    "/api/storefront/me",
    requireBrand,
    asyncHandler(async (req, res) => {
      const previewAuthorized = await isPreviewAuthorized(req, req.brand!.id);
      const previewing = req.brand!.status !== "active" && previewAuthorized;
      const campaign = await getOrCreateCurrentCampaign(req.brand!.tenantId, req.brand!.id);
      // A not-yet-published brand should read as "coming soon" to a real
      // visitor, never as "enter the password" — the password gate only
      // makes sense once there's an actual live storefront behind it.
      const locked = req.brand!.status === "active" && (await isLocked(req, campaign, previewAuthorized));
      res.json({ brand: req.brand, previewing, access: campaign.access, locked });
    }),
  );
  /**
   * Password-gate unlock: the storefront posts the password it collected,
   * gets back a bearer token proving it for ~30 days, and carries that
   * token on every later /api/storefront/* call — same slot the admin
   * preview token already uses (see isLocked's doc comment).
   */
  router.post(
    "/api/storefront/unlock",
    requireBrand,
    asyncHandler(async (req, res) => {
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      const campaign = await getOrCreateCurrentCampaign(req.brand!.tenantId, req.brand!.id);
      if (campaign.access !== "password") {
        res.status(400).json({ error: "not_password_protected" });
        return;
      }
      const ok = await verifyCampaignAccessPassword(campaign.id, password);
      if (!ok) {
        res.status(401).json({ error: "wrong_password" });
        return;
      }
      res.json({ token: signStorefrontUnlockToken(campaign.id) });
    }),
  );
  /** Launch Studio's "Store" tab (headline/hero image/colour/font) — the storefront's own hero was, until now, hardcoded platform copy that never read any of this; this is what makes those fields actually show up for real customers. */
  router.get(
    "/api/storefront/campaign",
    requireBrand,
    asyncHandler(async (req, res) => {
      const previewAuthorized = await isPreviewAuthorized(req, req.brand!.id);
      const campaign = await getOrCreateCurrentCampaign(req.brand!.tenantId, req.brand!.id);
      if (await isLocked(req, campaign, previewAuthorized)) {
        res.status(401).json({ error: "password_required" });
        return;
      }
      res.json({ campaign });
    }),
  );
  router.get(
    "/api/storefront/products",
    requireBrand,
    asyncHandler(async (req, res) => {
      const previewAuthorized = await isPreviewAuthorized(req, req.brand!.id);
      if (req.brand!.status !== "active" && !previewAuthorized) {
        res.json({ products: [] });
        return;
      }
      const campaign = await getOrCreateCurrentCampaign(req.brand!.tenantId, req.brand!.id);
      if (await isLocked(req, campaign, previewAuthorized)) {
        res.status(401).json({ error: "password_required" });
        return;
      }
      // Every active product for the brand is NOT the same thing as "what's
      // in this sale" — a merchant removing a product from the sale (Go
      // live's board) only ever edited campaign.productIds, never the
      // product's own status, so real customers kept seeing it here
      // regardless. The sale's product list is the actual source of truth
      // for what the public storefront shows.
      const products = (await listProductsForBrand(req.brand!.id)).filter((p) => campaign.productIds.includes(p.id));
      res.json({ products });
    }),
  );
  return router;
}
