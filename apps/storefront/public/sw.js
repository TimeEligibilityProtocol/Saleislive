// Caches the static app shell only — never the API. Storefront prices/stock
// change with every sale, so caching API responses would show stale numbers,
// worse than no offline support at all. What this buys: the app *opens*
// offline/on a flaky connection instead of a blank white screen, even though
// live product data still needs a real connection to load.
const CACHE_NAME = "saleislive-storefront-shell-v1";
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
    caches.match(event.request).then((cached) => cached ?? fetch(event.request)),
  );
});
