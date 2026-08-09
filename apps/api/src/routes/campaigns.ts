import { CampaignAccess, CampaignStatus, ThemePresetId } from "@saleis-live/domain";
import { Router } from "express";
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

  router.get("/api/brands/:brandId/campaign", (req, res) => {
    const brand = getBrandById(req.params.brandId);
    if (!brand) return res.status(404).json({ error: "unknown_brand" });
    res.json({ campaign: getOrCreateCurrentCampaign(brand.tenantId, brand.id) });
  });

  router.patch("/api/campaigns/:id", (req, res) => {
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
    const updated = updateCampaign(req.params.id, body);
    if (!updated) return res.status(404).json({ error: "not_found" });
    res.json({ campaign: updated });
  });

  router.patch("/api/brands/:brandId/policies", (req, res) => {
    const brand = getBrandById(req.params.brandId);
    if (!brand) return res.status(404).json({ error: "unknown_brand" });
    const body = req.body as Partial<{ returnPolicy: string; shippingPolicy: string }>;
    const updated = updateBrandPolicies(brand.id, body);
    res.json({ brand: updated });
  });

  return router;
}
