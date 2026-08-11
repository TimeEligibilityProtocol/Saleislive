// Caches the static app shell only — never the API. This is a data-heavy
// admin panel (stock, orders, prices change constantly); caching API
// responses would show stale numbers, which is worse than no offline
// support at all. What this buys: the app *opens* offline/on a flaky
// connection instead of showing a blank white screen, even though data
// still needs a real connection to load.
//
// v2: was cache-first with no revalidation — once a browser cached "/" it
// kept serving that exact HTML forever, on every future visit, since
// nothing here ever re-fetched it (no cache-control was consulted, and a
// user's plain reload doesn't bypass an active service worker). Vite's
// build only keeps the CURRENT build's hashed JS files on disk, so that
// frozen-in-amber HTML — pointing at a JS filename from whatever deploy
// happened to be live when it was first cached — eventually 404s on its
// own script tag and the app never boots: a permanent blank white screen
// that no ordinary hard-refresh can fix (real incident, 2026-08-11). Now
// network-first for navigations/HTML: always try the network first (this
// is an online-only admin panel anyway) and only fall back to the cache
// if the network is genuinely unreachable.
const CACHE_NAME = "saleislive-admin-shell-v2";
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
