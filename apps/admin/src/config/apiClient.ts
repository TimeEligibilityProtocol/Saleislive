import { ApiClient } from "@saleis-live/api-client";

const PRODUCTION_API_BASE_URL = "https://saleislive-api.onrender.com";

/**
 * Local dev: same host, API's port. Production: the API is a separate
 * Render service, not reachable at the admin app's own hostname on port
 * 4100 — falls back to the real API host instead of guessing one that
 * doesn't exist. VITE_API_BASE_URL still wins if set at build time.
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
 * Where the buyer-facing storefront lives — used only to build a "preview
 * your store" link right after brand creation. Real per-brand subdomains
 * (chanel.saleis.live) need wildcard DNS that isn't wired up yet, so
 * until then the link points at the shared storefront with ?brand=slug,
 * which actually works today instead of 404ing.
 */
export function resolveStorefrontPreviewUrl(slug: string): string {
  const override = import.meta.env.VITE_STOREFRONT_BASE_URL;
  if (override) return `${override}/?brand=${encodeURIComponent(slug)}`;
  if (typeof window !== "undefined" && (window.location?.hostname === "localhost" || window.location?.hostname?.endsWith(".localhost"))) {
    return `http://${window.location.hostname}:5274/?brand=${encodeURIComponent(slug)}`;
  }
  return `https://demo.saleis.live/?brand=${encodeURIComponent(slug)}`;
}

export const AUTH_TOKEN_KEY = "saleislive:authToken";

export const apiClient = new ApiClient({
  baseUrl: resolveApiBaseUrl(),
  // eslint-disable-next-line @typescript-eslint/require-await
  getAuthToken: async () => window.localStorage.getItem(AUTH_TOKEN_KEY),
});

/** A plain file download, not a JSON call — Catalogue Center's "Export" link points straight at this. */
export function resolveCatalogueExportUrl(brandId: string): string {
  return `${resolveApiBaseUrl()}/api/brands/${encodeURIComponent(brandId)}/products/export`;
}
