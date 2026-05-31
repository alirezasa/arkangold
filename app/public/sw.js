// public/sw.js
// آرکان گلد - Service Worker برای پشتیبانی آفلاین و PWA

const CACHE_NAME = "arkan-gold-v1";
const STATIC_CACHE = "arkan-static-v1";
const API_CACHE = "arkan-api-v1";

// فایل‌هایی که در اولین بارگذاری کش می‌شوند
const PRECACHE_URLS = [
  "/",
  "/dashboard",
  "/manifest.json",
  "/offline.html",
];

// ─── Install ────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ─── Activate (clean old caches) ────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== STATIC_CACHE && k !== API_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ─── Fetch strategy ─────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // فقط درخواست‌های همین دامنه
  if (url.origin !== location.origin) return;

  // API calls → Network first, fallback to cache
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  // Static assets → Cache first, fallback to network
  if (
    url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|ico|woff2|webp)$/)
  ) {
    event.respondWith(cacheFirstStrategy(request));
    return;
  }

  // Pages → Network first, fallback to cache, fallback to offline.html
  event.respondWith(pageStrategy(request));
});

// ─── Strategies ──────────────────────────────────────────────

async function networkFirstStrategy(request) {
  try {
    const networkRes = await fetch(request.clone());
    if (networkRes.ok) {
      const cache = await caches.open(API_CACHE);
      cache.put(request, networkRes.clone());
    }
    return networkRes;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response(JSON.stringify({ error: "offline" }), {
      headers: { "Content-Type": "application/json" },
      status: 503,
    });
  }
}

async function cacheFirstStrategy(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const networkRes = await fetch(request);
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, networkRes.clone());
    return networkRes;
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

async function pageStrategy(request) {
  try {
    const networkRes = await fetch(request);
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, networkRes.clone());
    return networkRes;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return caches.match("/offline.html");
  }
}

// ─── Push notifications ──────────────────────────────────────
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  const title = data.title || "آرکان گلد";
  const options = {
    body: data.body || "یک اعلان جدید دارید",
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-72x72.png",
    dir: "rtl",
    lang: "fa",
    vibrate: [200, 100, 200],
    data: { url: data.url || "/dashboard" },
    actions: data.actions || [],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/dashboard";
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        const existing = windowClients.find((c) => c.url.includes(url));
        if (existing) return existing.focus();
        return clients.openWindow(url);
      })
  );
});
