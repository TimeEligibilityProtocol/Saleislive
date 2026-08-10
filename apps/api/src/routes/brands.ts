import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { logAudit } from "../store/auditLog.js";
import { createMembership } from "../store/memberships.js";
import { createBrand, getBrandById, isSlugAvailable, updateBrandIntegration } from "../store/tenants.js";

const SLUG_PATTERN = /^[a-z0-9-]{2,32}$/;

/**
 * Brand/subdomain self-service — see blueprint §3 ("Klient nie dotyka
 * DNS: wybiera slug w panelu, system sprawdza dostępność i przypisuje
 * storefront"). No tenant-recognized-brand-name verification workflow
 * yet (§10 flags it as required before go-live for recognizable names) —
 * this is the plain availability check only.
 */
export function brandsRouter(): Router {
  const router = Router();

  router.get(
    "/api/brands/slug-available",
    asyncHandler(async (req, res) => {
      const slug = String(req.query.slug ?? "").toLowerCase();
      if (!SLUG_PATTERN.test(slug)) {
        return res.status(400).json({ error: "invalid_slug" });
      }
      res.json({ slug, available: await isSlugAvailable(slug) });
    }),
  );

  // Must come after the literal /slug-available route above — :id is a wildcard and would otherwise shadow it.
  router.get(
    "/api/brands/:id",
    asyncHandler(async (req, res) => {
      const brand = await getBrandById(req.params.id);
      if (!brand) return res.status(404).json({ error: "unknown_brand" });
      res.json({ brand });
    }),
  );

  /**
   * Whoever creates a brand becomes its group_owner automatically — a
   * brand created with no BrandMembership would lock its own creator out
   * immediately, since every other route now checks membership/role.
   */
  router.post(
    "/api/brands",
    requireAuth,
    asyncHandler(async (req, res) => {
      const { tenantId, name, slug, country, currency, language, secondaryLanguage } = req.body as {
        tenantId?: string;
        name?: string;
        slug?: string;
        country?: string;
        currency?: string;
        language?: string;
        secondaryLanguage?: string | null;
      };
      if (!tenantId || !name || !slug || !country || !currency || !language) {
        return res.status(400).json({ error: "missing_fields" });
      }
      const normalizedSlug = slug.toLowerCase();
      if (!SLUG_PATTERN.test(normalizedSlug)) {
        return res.status(400).json({ error: "invalid_slug" });
      }
      if (!(await isSlugAvailable(normalizedSlug))) {
        return res.status(409).json({ error: "slug_taken" });
      }
      const brand = await createBrand({ tenantId, name, slug: normalizedSlug, country, currency, language, secondaryLanguage: secondaryLanguage ?? null });
      await createMembership({ userId: req.user!.id, brandId: brand.id, tenantId, role: "group_owner" });
      await logAudit({ tenantId, brandId: brand.id, userId: req.user!.id, action: "brand.created", entityType: "brand", entityId: brand.id, metadata: { name, slug: normalizedSlug } });
      res.status(201).json({ brand });
    }),
  );

  /** Screen 06's Payments/Delivery tabs — connect or disconnect the "bring your own integration" HTTP adapter. */
  router.patch(
    "/api/brands/:brandId/integrations/:kind",
    asyncHandler(async (req, res) => {
      const kind = req.params.kind;
      if (kind !== "payment" && kind !== "delivery") return res.status(400).json({ error: "invalid_kind" });
      const brand = await getBrandById(req.params.brandId);
      if (!brand) return res.status(404).json({ error: "unknown_brand" });

      const body = req.body as { endpointUrl?: string; apiKey?: string; disconnect?: boolean };
      if (body.disconnect) {
        const updated = await updateBrandIntegration(brand.id, kind, null);
        return res.json({ brand: updated });
      }
      if (!body.endpointUrl?.trim() || !body.apiKey?.trim()) return res.status(400).json({ error: "missing_fields" });
      const updated = await updateBrandIntegration(brand.id, kind, { endpointUrl: body.endpointUrl.trim(), apiKey: body.apiKey.trim() });
      res.json({ brand: updated });
    }),
  );

  return router;
}
