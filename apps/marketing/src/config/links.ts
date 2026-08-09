/**
 * The marketing site links out to the real product (admin.saleis.live)
 * and the real demo storefront (demo.saleis.live) — it never reimplements
 * either. In local dev these resolve to the equivalent localhost ports so
 * "View demo"/"Get saleis.live" work the same way while testing.
 */
function isLocalDev(): boolean {
  return typeof window !== "undefined" && /localhost$/.test(window.location.hostname);
}

export const ADMIN_URL = isLocalDev() ? "http://localhost:5273" : "https://admin.saleis.live";
export const DEMO_STORE_URL = isLocalDev() ? "http://demo.localhost:5274" : "https://demo.saleis.live";
