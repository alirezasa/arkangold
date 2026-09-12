// public/sw.js
// آرکان گلد - Service Worker برای پشتیبانی آفلاین و PWA

const STATIC_CACHE = "arkan-static-v3";
const API_CACHE = "arkan-api-v3";

// فایل‌هایی که در اولین بارگذاری کش می‌شوند
const PRECACHE_URLS = ["/", "/dashboard", "/manifest.json", "/offline.html"];

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
      const cacheNames = await caches.keys();

      // حذف کش‌های قدیمی
      await Promise.all(
        cacheNames
          .filter(
            (cacheName) =>
              cacheName !== STATIC_CACHE && cacheName !== API_CACHE,
          )
          .map((cacheName) => caches.delete(cacheName)),
      );

      // حذف احتمالی صفحات فاکتور که قبلاً کش شده‌اند
      await removeInvoiceEntries();

      // کنترل تمام تب‌های باز توسط نسخه جدید
      await self.clients.claim();
    })(),
  );
});

// ─── Fetch strategy ─────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") {
    return;
  }

  if (url.origin !== self.location.origin) {
    return;
  }

  // صفحات چاپ فاکتور نباید کش شوند
  if (url.pathname.startsWith("/invoice/")) {
    event.respondWith(fetch(request, { cache: "no-store" }));
    return;
  }

  // API calls → Network first, fallback to cache
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  // Static assets → Cache first, fallback to network
  if (/\.(?:js|css|png|jpg|jpeg|svg|ico|woff2|webp)$/i.test(url.pathname)) {
    event.respondWith(cacheFirstStrategy(request));
    return;
  }

  // Pages → Network first, fallback to cache, fallback to offline.html
  event.respondWith(pageStrategy(request));
});

// ─── Network First Strategy ─────────────────────────────────
async function networkFirstStrategy(request) {
  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      const cache = await caches.open(API_CACHE);
      await cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch {
    const cachedResponse = await caches.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    return new Response(
      JSON.stringify({
        error: "offline",
        message: "اتصال اینترنت برقرار نیست",
      }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
      },
    );
  }
}

// ─── Cache First Strategy ───────────────────────────────────
async function cacheFirstStrategy(request) {
  const cachedResponse = await caches.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE);
      await cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch {
    return new Response("Not found", {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }
}

// ─── Page Strategy ──────────────────────────────────────────
async function pageStrategy(request) {
  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE);
      await cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch {
    const cachedResponse = await caches.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    const offlineResponse = await caches.match("/offline.html");

    if (offlineResponse) {
      return offlineResponse;
    }

    return new Response("Offline", {
      status: 503,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }
}

// ─── حذف صفحات فاکتور از کش‌های قبلی ────────────────────────
async function removeInvoiceEntries() {
  const cacheNames = await caches.keys();

  await Promise.all(
    cacheNames.map(async (cacheName) => {
      const cache = await caches.open(cacheName);
      const requests = await cache.keys();

      await Promise.all(
        requests.map((cachedRequest) => {
          const cachedUrl = new URL(cachedRequest.url);

          if (
            cachedUrl.origin === self.location.origin &&
            cachedUrl.pathname.startsWith("/invoice/")
          ) {
            return cache.delete(cachedRequest);
          }

          return Promise.resolve(false);
        }),
      );
    }),
  );
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
