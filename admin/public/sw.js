// admin/public/sw.js
const STATIC_CACHE = "arkan-admin-static-v1";
const PRECACHE_URLS = ["/", "/manifest.json", "/offline.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  // API ها همیشه network-only (داده مالی هرگز نباید کش بمونه)
  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|ico|woff2?)$/)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((res) => {
        caches.open(STATIC_CACHE).then((c) => c.put(request, res.clone()));
        return res;
      })
      .catch(() => caches.match(request).then((c) => c || caches.match("/offline.html")))
  );
});