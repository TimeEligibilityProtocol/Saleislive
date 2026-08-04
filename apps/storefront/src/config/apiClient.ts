import { ApiClient } from "@saleis-live/api-client";

/**
 * Same host, API's port — so visiting "demo.localhost:5274" talks to
 * "demo.localhost:4100", and the API's tenant router (which reads the
 * Host header) resolves the same brand the page itself was loaded as.
 * In production this becomes "demo.saleis.live" talking to whatever
 * host runs the API, via EXPO_PUBLIC_API_BASE_URL-style build-time config.
 */
function resolveApiBaseUrl(): string {
  const override = import.meta.env.VITE_API_BASE_URL;
  if (override) return override;
  if (typeof window !== "undefined" && window.location?.hostname) {
    return `http://${window.location.hostname}:4100`;
  }
  return "http://localhost:4100";
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
