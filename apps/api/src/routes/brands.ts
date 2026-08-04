import { Router } from "express";
import { createBrand, isSlugAvailable } from "../store/tenants.js";

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

  router.get("/api/brands/slug-available", (req, res) => {
    const slug = String(req.query.slug ?? "").toLowerCase();
    if (!SLUG_PATTERN.test(slug)) {
      return res.status(400).json({ error: "invalid_slug" });
    }
    res.json({ slug, available: isSlugAvailable(slug) });
  });

  router.post("/api/brands", (req, res) => {
    const { tenantId, name, slug, country, currency } = req.body as {
      tenantId?: string;
      name?: string;
      slug?: string;
      country?: string;
      currency?: string;
    };
    if (!tenantId || !name || !slug || !country || !currency) {
      return res.status(400).json({ error: "missing_fields" });
    }
    const normalizedSlug = slug.toLowerCase();
    if (!SLUG_PATTERN.test(normalizedSlug)) {
      return res.status(400).json({ error: "invalid_slug" });
    }
    if (!isSlugAvailable(normalizedSlug)) {
      return res.status(409).json({ error: "slug_taken" });
    }
    const brand = createBrand({ tenantId, name, slug: normalizedSlug, country, currency });
    res.status(201).json({ brand });
  });

  return router;
}
