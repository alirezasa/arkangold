// public/sw.js
// آرکان گلد - Service Worker برای پشتیبانی آفلاین و PWA
//
// سیاست کش:
// - پاسخ‌های /api هرگز کش نمی‌شوند (اطلاعات مالی/شخصی کاربر نباید روی دستگاه بماند
//   و موجودی کهنه نباید به‌جای موجودی واقعی نمایش داده شود).
// - صفحات HTML کش نمی‌شوند؛ HTML کهنه بعد از هر deploy به فایل‌های JS حذف‌شده اشاره
//   می‌کند و اپ را خراب می‌کند. در نبود اینترنت صفحه‌ی offline.html نمایش داده می‌شود.
// - فایل‌های استاتیک (با hash در نام) cache-first هستند.

const VERSION = "v4";
const STATIC_CACHE = `arkan-static-${VERSION}`;
const OFFLINE_URL = "/offline.html";

// فایل‌هایی که هنگام نصب کش می‌شوند (همه برای نمایش صفحه‌ی آفلاین لازم‌اند)
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/manifest.json",
  "/logo.png",
  "/icons/icon-192x192.png",
  "/icons/icon-72x72.png",
  "/fonts/DanaFaNum-Regular.woff",
  "/fonts/DanaFaNum-Bold.woff",
];

const STATIC_ASSET_RE = /\.(?:js|css|png|jpg|jpeg|gif|svg|ico|woff2?|webp|avif)$/i;

// ─── Install ────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);

      // addAll در صورت خطای یک فایل، کل نصب را fail می‌کند
      // پس هر فایل مستقل کش می‌شود
      await Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => null),
        ),
      );

      await self.skipWaiting();
    })(),
  );
});

// ─── Activate ───────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // حذف همه‌ی کش‌های قدیمی — از جمله arkan-api-* و صفحات کش‌شده‌ی نسخه‌های قبل
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== STATIC_CACHE)
          .map((cacheName) => caches.delete(cacheName)),
      );

      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable().catch(() => {});
      }

      // کنترل تمام تب‌های باز توسط نسخه جدید
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

// ─── Fetch strategy ─────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API → فقط شبکه؛ در حالت آفلاین پاسخ JSON خطا
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkOnlyApi(request));
    return;
  }

  // صفحات چاپ فاکتور نباید کش شوند
  if (url.pathname.startsWith("/invoice/")) {
    event.respondWith(fetch(request, { cache: "no-store" }));
    return;
  }

  // ناوبری صفحات → شبکه؛ در نبود اینترنت صفحه‌ی آفلاین
  if (request.mode === "navigate") {
    event.respondWith(navigationStrategy(event));
    return;
  }

  // فایل‌های استاتیک → Cache first
  if (url.pathname.startsWith("/_next/static/") || STATIC_ASSET_RE.test(url.pathname)) {
    event.respondWith(cacheFirstStrategy(request));
  }

  // بقیه (درخواست‌های RSC، _next/image و ...) بدون دخالت SW از شبکه
});

async function networkOnlyApi(request) {
  try {
    return await fetch(request);
  } catch {
    return new Response(
      JSON.stringify({
        error: "offline",
        message: "اتصال اینترنت برقرار نیست",
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      },
    );
  }
}

async function navigationStrategy(event) {
  try {
    const preloaded = await event.preloadResponse;
    if (preloaded) return preloaded;
    return await fetch(event.request);
  } catch {
    const offline = await caches.match(OFFLINE_URL);
    return (
      offline ||
      new Response("Offline", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    );
  }
}

async function cacheFirstStrategy(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") {
      const cache = await caches.open(STATIC_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("", { status: 504 });
  }
}

// ─── Push notifications ─────────────────────────────────────
self.addEventListener("push", (event) => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = data.title || "آرکان گلد";

  const notificationOptions = {
    body: data.body || "یک اعلان جدید دارید",
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-72x72.png",
    dir: "rtl",
    lang: "fa",
    vibrate: [200, 100, 200],
    data: {
      url: data.url || "/dashboard",
    },
    actions: Array.isArray(data.actions) ? data.actions : [],
  };

  event.waitUntil(
    self.registration.showNotification(title, notificationOptions),
  );
});

// ─── Notification click ─────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const fallbackUrl = new URL("/dashboard", self.location.origin);
  const notificationUrl = event.notification.data?.url || "/dashboard";

  let targetUrl;

  try {
    targetUrl = new URL(notificationUrl, self.location.origin);

    // جلوگیری از هدایت به دامنه‌های خارجی
    if (targetUrl.origin !== self.location.origin) {
      targetUrl = fallbackUrl;
    }
  } catch {
    targetUrl = fallbackUrl;
  }

  event.waitUntil(
    self.clients
      .matchAll({
        type: "window",
        includeUncontrolled: true,
      })
      .then((windowClients) => {
        const existingClient = windowClients.find((client) => {
          const clientUrl = new URL(client.url);

          return (
            clientUrl.origin === targetUrl.origin &&
            clientUrl.pathname === targetUrl.pathname &&
            clientUrl.search === targetUrl.search
          );
        });

        if (existingClient) {
          return existingClient.focus();
        }

        return self.clients.openWindow(targetUrl.href);
      }),
  );
});
