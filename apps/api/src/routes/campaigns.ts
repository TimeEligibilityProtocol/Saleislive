import { CampaignAccess, CampaignStatus, HeroColorPresetId, HeroTitleSizeId, LogoSizeId, ThemePresetId } from "@saleis-live/domain";
import { Router } from "express";
import multer from "multer";
import { asyncHandler } from "../lib/asyncHandler.js";
import { saveUploadedAsset } from "../lib/assetStorage.js";
import { requireAuth } from "../middleware/auth.js";
import { logAudit } from "../store/auditLog.js";
import { getCampaignById, getOrCreateCurrentCampaign, setCampaignAccessPassword, updateCampaign } from "../store/campaigns.js";
import { clearBrandLogo, getBrandById, publishBrand, setBrandLogo, setBrandLogoSize, setBrandShowPlatformLogo, updateBrandPolicies } from "../store/tenants.js";

const heroUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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
    requireAuth,
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
        heroColorPreset: HeroColorPresetId | null;
        heroFontPreset: string | null;
        heroTitleSize: HeroTitleSizeId | null;
        showHeroCta: boolean | null;
        heroImageOffsetX: number | null;
        heroImageOffsetY: number | null;
        heroImageScale: number | null;
        heroTextOffsetX: number | null;
        heroTextOffsetY: number | null;
        heroImageOffsetXMobile: number | null;
        heroImageOffsetYMobile: number | null;
        heroImageScaleMobile: number | null;
        heroTextOffsetXMobile: number | null;
        heroTextOffsetYMobile: number | null;
        /// Plaintext, write-only — never round-tripped back on reads (see
        /// store/campaigns.ts's toDomainCampaign, which never selects the
        /// hash). Handled separately from the rest of the patch below since
        /// it needs hashing, not a direct column assignment.
        accessPassword: string;
      }>;
      const { accessPassword, ...patch } = body;
      const before = await getCampaignById(req.params.id);
      const updated = await updateCampaign(req.params.id, patch);
      if (!updated) return res.status(404).json({ error: "not_found" });
      if (accessPassword) {
        await setCampaignAccessPassword(updated.id, accessPassword);
        updated.hasAccessPassword = true; // updateCampaign's snapshot predates this write
      }
      if (body.status === "live" && before?.status !== "live") {
        // The moment a merchant's very first sale actually goes live is also
        // the moment their storefront should stop being preview-only and
        // start serving real customers (routes/storefront.ts) — publishing
        // a campaign with no public store behind it would be a silent no-op.
        await publishBrand(updated.brandId);
        await logAudit({ tenantId: updated.tenantId, brandId: updated.brandId, userId: req.user!.id, action: "campaign.published", entityType: "campaign", entityId: updated.id, metadata: { name: updated.name, slug: updated.slug } });
      }
      res.json({ campaign: updated });
    }),
  );

  /** Store tab's hero image — a real upload (multipart), same pattern as product photos/backgrounds, replacing the old raw-URL text field nobody could actually use without hosting the image somewhere else first. */
  router.post(
    "/api/brands/:brandId/hero-image",
    requireAuth,
    heroUpload.single("file"),
    asyncHandler(async (req, res) => {
      const brand = await getBrandById(req.params.brandId);
      if (!brand) return res.status(400).json({ error: "unknown_brand" });
      if (!req.file) return res.status(400).json({ error: "missing_file" });
      const extension = (req.file.originalname.split(".").pop() || "jpg").toLowerCase();
      const url = await saveUploadedAsset(req.file.buffer, extension, "hero");
      res.status(201).json({ url });
    }),
  );

  /** Store design's brand logo — shown on the real storefront header in place of the "Your brand goes here" placeholder. */
  router.post(
    "/api/brands/:brandId/logo",
    requireAuth,
    heroUpload.single("file"),
    asyncHandler(async (req, res) => {
      const brand = await getBrandById(req.params.brandId);
      if (!brand) return res.status(400).json({ error: "unknown_brand" });
      if (!req.file) return res.status(400).json({ error: "missing_file" });
      const extension = (req.file.originalname.split(".").pop() || "png").toLowerCase();
      const url = await saveUploadedAsset(req.file.buffer, extension, "logo");
      const updated = await setBrandLogo(brand.id, url);
      if (!updated) return res.status(500).json({ error: "update_failed" });
      res.status(201).json({ brand: updated });
    }),
  );

  /** Store design's "Remove logo" — reverts to the storefront's "Your brand goes here" placeholder. */
  router.delete(
    "/api/brands/:brandId/logo",
    requireAuth,
    asyncHandler(async (req, res) => {
      const brand = await getBrandById(req.params.brandId);
      if (!brand) return res.status(400).json({ error: "unknown_brand" });
      const updated = await clearBrandLogo(brand.id);
      if (!updated) return res.status(500).json({ error: "update_failed" });
      res.json({ brand: updated });
    }),
  );

  /** Store design's logo-size picker (small/medium/large) — separate from the upload above so choosing a size doesn't require re-uploading the file. */
  router.patch(
    "/api/brands/:brandId/logo-size",
    requireAuth,
    asyncHandler(async (req, res) => {
      const brand = await getBrandById(req.params.brandId);
      if (!brand) return res.status(400).json({ error: "unknown_brand" });
      const { logoSize } = req.body as { logoSize?: LogoSizeId };
      if (logoSize !== "small" && logoSize !== "medium" && logoSize !== "large") return res.status(400).json({ error: "invalid_size" });
      const updated = await setBrandLogoSize(brand.id, logoSize);
      if (!updated) return res.status(500).json({ error: "update_failed" });
      res.json({ brand: updated });
    }),
  );

  /** Store design's "Show saleis.live logo in header" toggle. */
  router.patch(
    "/api/brands/:brandId/show-platform-logo",
    requireAuth,
    asyncHandler(async (req, res) => {
      const brand = await getBrandById(req.params.brandId);
      if (!brand) return res.status(400).json({ error: "unknown_brand" });
      const { showPlatformLogo } = req.body as { showPlatformLogo?: boolean };
      if (typeof showPlatformLogo !== "boolean") return res.status(400).json({ error: "invalid_value" });
      const updated = await setBrandShowPlatformLogo(brand.id, showPlatformLogo);
      if (!updated) return res.status(500).json({ error: "update_failed" });
      res.json({ brand: updated });
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
