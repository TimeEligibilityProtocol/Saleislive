import { ApiClient } from "@saleis-live/api-client";

const PRODUCTION_API_BASE_URL = "https://saleislive-api.onrender.com";

/**
 * Local dev: same host, API's port — "demo.localhost:5274" talks to
 * "demo.localhost:4100", and the API's tenant router (which reads the
 * Host header) resolves the same brand the page itself was loaded as.
 * Production: the API is a separate Render service, not reachable at
 * the storefront's own hostname on port 4100 — falls back to the real
 * API host instead of guessing one that doesn't exist. VITE_API_BASE_URL
 * still wins if set at build time.
 */
function resolveApiBaseUrl(): string {
  const override = import.meta.env.VITE_API_BASE_URL;
  if (override) return override;
  if (typeof window !== "undefined" && (window.location?.hostname === "localhost" || window.location?.hostname?.endsWith(".localhost"))) {
    return `http://${window.location.hostname}:4100`;
  }
  return PRODUCTION_API_BASE_URL;
}

/**
 * ?brand=slug lets this same deployed storefront preview any brand before
 * real wildcard subdomains exist — sent to the API as X-Brand-Slug, which
 * always wins over Host-header resolution. Unused once brand.saleis.live
 * hosting is wired up; the real subdomain resolves the brand on its own.
 */
function resolveBrandSlugOverride(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("brand");
}

export const apiClient = new ApiClient({ baseUrl: resolveApiBaseUrl(), brandSlug: resolveBrandSlugOverride() });
