import { ApiClient } from "@saleis-live/api-client";

function resolveApiBaseUrl(): string {
  const override = import.meta.env.VITE_API_BASE_URL;
  if (override) return override;
  if (typeof window !== "undefined" && window.location?.hostname) {
    return `http://${window.location.hostname}:4100`;
  }
  return "http://localhost:4100";
}

export const apiClient = new ApiClient({ baseUrl: resolveApiBaseUrl() });
