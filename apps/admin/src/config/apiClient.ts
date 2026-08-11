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
 * Where the buyer-facing storefront lives — used to build a "preview your
 * store" link. Real per-brand subdomains (chanel.saleis.live) need
 * wildcard DNS that isn't wired up yet, so until then the link points at
 * the shared storefront with ?brand=slug, which actually works today
 * instead of 404ing. The caller's own session token rides along in the
 * URL *fragment* (never sent to any server, unlike a query param) so the
 * storefront can prove to the API it's the brand's own owner previewing —
 * a not-yet-published brand (see publishBrand) otherwise shows a "coming
 * soon" page to everyone, including this same link with the token missing
 * or wrong. See apps/storefront/src/config/apiClient.ts for the read side.
 */
export function resolveStorefrontPreviewUrl(slug: string, previewToken: string | null): string {
  const fragment = previewToken ? `#preview_token=${encodeURIComponent(previewToken)}` : "";
  const override = import.meta.env.VITE_STOREFRONT_BASE_URL;
  if (override) return `${override}/?brand=${encodeURIComponent(slug)}${fragment}`;
  if (typeof window !== "undefined" && (window.location?.hostname === "localhost" || window.location?.hostname?.endsWith(".localhost"))) {
    return `http://${window.location.hostname}:5274/?brand=${encodeURIComponent(slug)}${fragment}`;
  }
  return `https://demo.saleis.live/?brand=${encodeURIComponent(slug)}${fragment}`;
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
