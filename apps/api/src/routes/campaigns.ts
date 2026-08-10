import { CampaignAccess, CampaignStatus, ThemePresetId } from "@saleis-live/domain";
import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { getOrCreateCurrentCampaign, updateCampaign } from "../store/campaigns.js";
import { getBrandById, updateBrandPolicies } from "../store/tenants.js";

/**
 * Screen 06 (Launch Studio) — Sale + Store + Policies tabs. Payments and
 * Delivery are deliberately not here: those need a real processor/courier
 * integration (blueprint §8's adapter boundary), which doesn't exist yet
 * — the UI shows an honest "not connected" state instead of faking one.
 */
export function campaignsRouter(): Router {
  const router = Router();

  router.get(
    "/api/brands/:brandId/campaign",
    asyncHandler(async (req, res) => {
      const brand = await getBrandById(req.params.brandId);
      if (!brand) return res.status(404).json({ error: "unknown_brand" });
      res.json({ campaign: await getOrCreateCurrentCampaign(brand.tenantId, brand.id) });
    }),
  );

  router.patch(
    "/api/campaigns/:id",
    asyncHandler(async (req, res) => {
      const body = req.body as Partial<{
        name: string;
        slug: string;
        access: CampaignAccess;
        status: CampaignStatus;
        startsAt: string;
        endsAt: string | null;
        productIds: string[];
        headline: string;
        shortDescription: string;
        heroDesktopUrl: string | null;
        heroMobileUrl: string | null;
        themePreset: ThemePresetId;
      }>;
      const updated = await updateCampaign(req.params.id, body);
      if (!updated) return res.status(404).json({ error: "not_found" });
      res.json({ campaign: updated });
    }),
  );

  router.patch(
    "/api/brands/:brandId/policies",
    asyncHandler(async (req, res) => {
      const brand = await getBrandById(req.params.brandId);
      if (!brand) return res.status(404).json({ error: "unknown_brand" });
      const body = req.body as Partial<{ returnPolicy: string; shippingPolicy: string }>;
      const updated = await updateBrandPolicies(brand.id, body);
      res.json({ brand: updated });
    }),
  );

  return router;
}
