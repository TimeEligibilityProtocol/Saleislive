import { ApiClient } from "@saleis-live/api-client";

function resolveApiBaseUrl(): string {
  if (typeof window !== "undefined" && window.location?.hostname) {
    return `http://${window.location.hostname}:4100`;
  }
  return "http://localhost:4100";
}

export const apiClient = new ApiClient({ baseUrl: resolveApiBaseUrl() });
