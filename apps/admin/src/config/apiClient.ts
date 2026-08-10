import { ApiClient } from "@saleis-live/api-client";

function resolveApiBaseUrl(): string {
  const override = import.meta.env.VITE_API_BASE_URL;
  if (override) return override;
  if (typeof window !== "undefined" && window.location?.hostname) {
    return `http://${window.location.hostname}:4100`;
  }
  return "http://localhost:4100";
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
  const base = override || (typeof window !== "undefined" && window.location?.hostname ? `http://${window.location.hostname}:5274` : "http://localhost:5274");
  return `${base}/?brand=${encodeURIComponent(slug)}`;
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
