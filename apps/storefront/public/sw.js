// Caches the static app shell only — never the API. Storefront prices/stock
// change with every sale, so caching API responses would show stale numbers,
// worse than no offline support at all. What this buys: the app *opens*
// offline/on a flaky connection instead of a blank white screen, even though
// live product data still needs a real connection to load.
//
// v2: was cache-first with no revalidation, which permanently freezes "/" the
// first time a browser caches it — see apps/admin/public/sw.js's matching v2
// comment for the real incident this caused there. Same fix here even though
// it hadn't yet bitten the storefront: network-first for navigations/HTML,
// cache only as an offline fallback.
const CACHE_NAME = "saleislive-storefront-shell-v2";
const SHELL_PATHS = ["/", "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_PATHS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.pathname.startsWith("/api/")) return; // never intercept API calls
  event.respondWith(
    fetch(event.request)
      .then((fresh) => {
        const copy = fresh.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return fresh;
      })
      .catch(() => caches.match(event.request)),
  );
});
