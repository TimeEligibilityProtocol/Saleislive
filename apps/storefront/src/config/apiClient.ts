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

const PREVIEW_TOKEN_KEY = "saleislive:previewToken";

/**
 * The admin app's "Preview your store" link carries the owner's own
 * session token in the URL *fragment* (see resolveStorefrontPreviewUrl's
 * doc comment) — never in a query param, so it never reaches server
 * access logs. Read it once on load, stash it for the rest of this tab's
 * session, then scrub it from the visible URL so it doesn't linger in
 * browser history or get shared if the link is copied.
 */
function capturePreviewToken(): void {
  if (typeof window === "undefined") return;
  const match = /(?:^|#)preview_token=([^&]+)/.exec(window.location.hash);
  if (!match) return;
  window.sessionStorage.setItem(PREVIEW_TOKEN_KEY, decodeURIComponent(match[1]));
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
}
capturePreviewToken();

export const apiClient = new ApiClient({
  baseUrl: resolveApiBaseUrl(),
  brandSlug: resolveBrandSlugOverride(),
  // eslint-disable-next-line @typescript-eslint/require-await
  getAuthToken: async () => window.sessionStorage.getItem(PREVIEW_TOKEN_KEY),
});
