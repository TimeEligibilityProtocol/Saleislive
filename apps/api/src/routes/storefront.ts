import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { resolveOptionalUser } from "../middleware/auth.js";
import { requireBrand } from "../middleware/tenantRouter.js";
import { getOrCreateCurrentCampaign } from "../store/campaigns.js";
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

/** What the storefront app calls on load to find out which brand it's rendering, resolved from the request's Host header. */
export function storefrontRouter(): Router {
  const router = Router();
  router.get(
    "/api/storefront/me",
    requireBrand,
    asyncHandler(async (req, res) => {
      const previewing = req.brand!.status !== "active" && (await isPreviewAuthorized(req, req.brand!.id));
      res.json({ brand: req.brand, previewing });
    }),
  );
  /** Launch Studio's "Store" tab (headline/hero image/colour/font) — the storefront's own hero was, until now, hardcoded platform copy that never read any of this; this is what makes those fields actually show up for real customers. */
  router.get(
    "/api/storefront/campaign",
    requireBrand,
    asyncHandler(async (req, res) => {
      res.json({ campaign: await getOrCreateCurrentCampaign(req.brand!.tenantId, req.brand!.id) });
    }),
  );
  router.get(
    "/api/storefront/products",
    requireBrand,
    asyncHandler(async (req, res) => {
      if (req.brand!.status !== "active" && !(await isPreviewAuthorized(req, req.brand!.id))) {
        res.json({ products: [] });
        return;
      }
      res.json({ products: await listProductsForBrand(req.brand!.id) });
    }),
  );
  return router;
}
