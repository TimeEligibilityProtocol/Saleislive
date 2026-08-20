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

/**
 * Where the admin app lives — used for the storefront footer's "Store
 * owner? Edit this store" link (the entry point for someone who has never
 * signed in on this device yet). Ola, 2026-08-19: "jedno logowanie na
 * admin i z tego wszystko ma się dziać — nie ma żadnych dodatkowych
 * stron" — there is exactly one login (admin's), never a second one on
 * the storefront itself; this link's only job is to route back to that
 * one login.
 */
export function resolveAdminBaseUrl(): string {
  const override = import.meta.env.VITE_ADMIN_BASE_URL;
  if (override) return override;
  if (typeof window !== "undefined" && (window.location?.hostname === "localhost" || window.location?.hostname?.endsWith(".localhost"))) {
    return `http://${window.location.hostname}:5273`;
  }
  return "https://saleislive-admin.onrender.com";
}

const PREVIEW_TOKEN_KEY = "saleislive:previewToken";

/**
 * Admin's "Open your store" link carries the owner's own already-
 * authenticated session token in the URL *fragment* (see
 * resolveStorefrontPreviewUrl's doc comment) — never in a query param, so
 * it never reaches server access logs. Stored in localStorage, not
 * sessionStorage — Ola, 2026-08-19: she shouldn't have to click that link
 * every single visit ("dlaczego mam tak dziwnie robić"). One click from
 * admin, once per device/browser, and edit access then stays available on
 * direct visits to the real store URL from then on — same "log in once"
 * shape as any normal login, just bridged over from the one place the
 * actual login happens (admin), never a second login system here.
 */
function capturePreviewToken(): void {
  if (typeof window === "undefined") return;
  const match = /(?:^|#)preview_token=([^&]+)/.exec(window.location.hash);
  if (!match) return;
  window.localStorage.setItem(PREVIEW_TOKEN_KEY, decodeURIComponent(match[1]));
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
}
capturePreviewToken();

const UNLOCK_TOKEN_KEY = "saleislive:unlockToken";

/** Set once a visitor types the right password for a "password"-access sale (see unlockStorefrontAccess) — kept for the rest of this tab's session only (unlike the preview/edit token above, this deliberately does NOT persist: a password-gated sale should re-lock each new visit, not stay open forever). A stale token from a since-changed sale just fails server-side re-verification and re-locks, no special handling needed here. */
export function storeStorefrontUnlockToken(token: string): void {
  window.sessionStorage.setItem(UNLOCK_TOKEN_KEY, token);
}

export const apiClient = new ApiClient({
  baseUrl: resolveApiBaseUrl(),
  brandSlug: resolveBrandSlugOverride(),
  // A real preview session always wins over an unlock token — the brand
  // owner previewing their own password-protected sale shouldn't also
  // need to know its password.
  // eslint-disable-next-line @typescript-eslint/require-await
  getAuthToken: async () => window.localStorage.getItem(PREVIEW_TOKEN_KEY) ?? window.sessionStorage.getItem(UNLOCK_TOKEN_KEY),
});
