/**
 * The marketing site reuses the same hero photography already stored on
 * the API service's static assets (apps/api/public/assets/hero) rather
 * than duplicating image files — same brand imagery, one source of truth.
 * No API calls happen here otherwise; this site has no backend of its own.
 */
function resolveApiBaseUrl(): string {
  const override = import.meta.env.VITE_API_BASE_URL;
  if (override) return override;
  if (typeof window !== "undefined" && window.location?.hostname) {
    return `http://${window.location.hostname}:4100`;
  }
  return "http://localhost:4100";
}

const API_BASE_URL = resolveApiBaseUrl();

export function resolveAssetUrl(relativeUrl: string): string {
  return `${API_BASE_URL}${relativeUrl}`;
}
