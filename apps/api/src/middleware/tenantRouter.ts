import { Brand } from "@saleis-live/domain";
import { NextFunction, Request, Response } from "express";
import { getBrandBySlug } from "../store/tenants.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      brand?: Brand;
    }
  }
}

/**
 * Resolves which brand a request belongs to from its Host header — see
 * blueprint §3/§10 ("Tenant router: rozpoznaje host/subdomenę, tenant,
 * brand..."). "chanel.saleis.live" → slug "chanel"; the platform's own
 * apex/admin domain and any request with no matching brand pass through
 * with req.brand left unset, since not every route is brand-scoped
 * (auth, platform admin, health).
 */
export function tenantRouter(rootDomain: string, defaultBrandSlug: string | null = null) {
  return function resolveTenant(req: Request, _res: Response, next: NextFunction): void {
    // An explicit X-Brand-Slug header (set by the storefront from its own
    // ?brand= query param) always wins — it's how a shared preview host
    // (no wildcard DNS yet) can still show any brand, not just the default.
    const explicitSlug = req.header("x-brand-slug");
    if (explicitSlug) {
      req.brand = getBrandBySlug(explicitSlug);
      next();
      return;
    }

    const host = (req.header("host") ?? "").split(":")[0];
    const suffix = `.${rootDomain}`;
    if (host.endsWith(suffix)) {
      const slug = host.slice(0, -suffix.length);
      if (slug && slug !== "www" && slug !== "admin") {
        req.brand = getBrandBySlug(slug);
      }
    } else if (defaultBrandSlug) {
      // Host isn't a *.{rootDomain} subdomain at all (e.g. a bare Render
      // preview URL before wildcard DNS is wired up) — fall back to a
      // fixed demo brand instead of resolving nothing.
      req.brand = getBrandBySlug(defaultBrandSlug);
    }
    next();
  };
}

/** Use on any route that must not run without a resolved brand (storefront/catalog reads, checkout). */
export function requireBrand(req: Request, res: Response, next: NextFunction): void {
  if (!req.brand) {
    res.status(404).json({ error: "brand_not_found" });
    return;
  }
  next();
}
