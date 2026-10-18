// admin/public/sw.js
// FDP_ACC_EXT.1.4 — فقط فایل‌های ایستای بدون داده‌ی کاربر (js/css/تصویر/فونت) کش می‌شوند.
// صفحات پنل (HTML) و API همیشه از شبکه خوانده می‌شوند و هرگز در Cache Storage ذخیره نمی‌شوند؛
// در نبود شبکه فقط صفحه‌ی آفلاین ایستا نمایش داده می‌شود. نسخه‌ی کش عوض شد تا کش قدیمی
// (که صفحات HTML را هم نگه می‌داشت) هنگام فعال‌سازی پاک شود.
const STATIC_CACHE = "arkan-admin-static-v3";
const PRECACHE_URLS = ["/manifest.json", "/offline.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      // هر فایل جدا کش می‌شود تا خطای یکی (مثلاً هدایت به صفحه‌ی ورود) کل نصب را از کار نیندازد
      .then((cache) =>
        Promise.all(
          PRECACHE_URLS.map((u) => cache.add(new Request(u, { cache: "reload" })).catch(() => null))
        )
      )
      .then(() => self.skipWaiting())
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
            // clone باید همزمان و پیش از برگرداندن پاسخ گرفته شود؛ clone داخل then بعدی
            // پس از مصرف بدنه توسط مرورگر اجرا می‌شد: «Response body is already used»
            if (res.ok && res.type === "basic") {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(request, copy)).catch(() => {});
            }
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
