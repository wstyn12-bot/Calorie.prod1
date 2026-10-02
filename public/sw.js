// calorie.prod service worker: lets the app open offline. Network first (so updates show up
// straight away), falling back to the cached copy. API calls are never cached.

const CACHE = "calorie-prod-v1";
const SHELL = [
  "/",
  "/index.html",
  "/styles.css",
  "/manifest.webmanifest",
  "/js/theme.js",
  "/js/app.js",
  "/js/api.js",
  "/js/html.js",
  "/js/icons.js",
  "/js/idb.js",
  "/js/image.js",
  "/js/morph.js",
  "/js/nutrition.js",
  "/js/store.js",
  "/js/ui.js",
  "/js/views/auth.js",
  "/js/views/today.js",
  "/js/views/progress.js",
  "/js/views/library.js",
  "/js/views/settings.js",
  "/js/sheets/add.js",
  "/js/sheets/editor.js",
  "/js/sheets/manual.js",
  "/js/sheets/misc.js",
  "/icons/icon-192.png",
  "/icons/favicon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req, { ignoreSearch: req.mode === "navigate" });
        if (hit) return hit;
        if (req.mode === "navigate") return caches.match("/index.html");
        return Response.error();
      }),
  );
});
