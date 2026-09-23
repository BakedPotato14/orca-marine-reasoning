// ORCA Progressive Web App (PWA) Service Worker
// Provides edge caching for app shell, UI assets, and offline resilience at sea.

const CACHE_NAME = "orca-marine-v1";
const OFFLINE_FALLBACK_URL = "/dashboard";

const STATIC_PRECACHE = [
  "/",
  "/dashboard",
  "/manifest.json",
  "/globe.svg",
  "/file.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_PRECACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Bypass API calls and live data proxies to prevent stale safety data
  if (url.pathname.startsWith("/api/") || event.request.method !== "GET") {
    return;
  }

  // Network-first strategy with cache fallback for HTML pages
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        return caches.match(OFFLINE_FALLBACK_URL);
      })
    );
    return;
  }

  // Stale-while-revalidate for static scripts, styles, and assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
