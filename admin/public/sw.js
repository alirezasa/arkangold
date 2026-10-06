// admin/public/sw.js
// FDP_ACC_EXT.1.4 — فقط فایل‌های ایستای بدون داده‌ی کاربر (js/css/تصویر/فونت) کش می‌شوند.
// صفحات پنل (HTML) و API همیشه از شبکه خوانده می‌شوند و هرگز در Cache Storage ذخیره نمی‌شوند؛
// در نبود شبکه فقط صفحه‌ی آفلاین ایستا نمایش داده می‌شود. نسخه‌ی کش عوض شد تا کش قدیمی
// (که صفحات HTML را هم نگه می‌داشت) هنگام فعال‌سازی پاک شود.
const STATIC_CACHE = "arkan-admin-static-v2";
const PRECACHE_URLS = ["/manifest.json", "/offline.html"];

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
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  // API ها همیشه network-only (داده مالی هرگز نباید کش بمونه)
  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|ico|woff2?)$/)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            if (res.ok) caches.open(STATIC_CACHE).then((c) => c.put(request, res.clone()));
            return res;
          })
      )
    );
    return;
  }

  // صفحات: فقط شبکه؛ بدون ذخیره در کش
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
  }
});
