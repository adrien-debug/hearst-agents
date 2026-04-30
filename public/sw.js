/**
 * Hearst OS — Service Worker (C8 Mobile companion).
 *
 * Strategies :
 *  - Static assets (CSS/JS/font/image)            → cache-first, version pinné
 *  - Navigations (HTML)                           → network-first, fallback /offline.html
 *  - GET /api/v2/assets, /api/v2/assets/[id]      → stale-while-revalidate, max 10 entries
 *  - /api/orchestrate, /api/auth/*, POST          → réseau seul (skip cache)
 *
 * Update : skipWaiting + claim immédiat. Le client recharge à la prochaine navigation.
 */

const VERSION = "v1";
const CACHE_STATIC = `hearst-static-${VERSION}`;
const CACHE_PAGES = `hearst-pages-${VERSION}`;
const CACHE_ASSETS = `hearst-assets-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const ASSET_API_LIMIT = 10;

const STATIC_PRECACHE = [OFFLINE_URL, "/icon-192.png", "/icon-512.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_STATIC);
      await cache.addAll(STATIC_PRECACHE).catch(() => {});
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.endsWith(`-${VERSION}`))
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

function isAssetApi(url) {
  return /^\/api\/v2\/assets(\/|$|\?)/.test(url.pathname);
}

function isSkipPath(url) {
  return (
    url.pathname.startsWith("/api/orchestrate") ||
    url.pathname.startsWith("/api/auth") ||
    url.pathname.startsWith("/api/admin/vitals") ||
    url.pathname.startsWith("/_next/webpack-hmr")
  );
}

function isStatic(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    /\.(?:css|js|woff2?|ttf|otf|png|jpg|jpeg|webp|svg|gif|ico)$/i.test(url.pathname)
  );
}

async function trimCache(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  const drop = keys.slice(0, keys.length - max);
  await Promise.all(drop.map((req) => cache.delete(req)));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (isSkipPath(url)) return;

  // Asset API : stale-while-revalidate, plafonné à 10 entrées.
  if (isAssetApi(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_ASSETS);
        const cached = await cache.match(req);
        const fetchPromise = fetch(req)
          .then(async (res) => {
            if (res && res.ok) {
              await cache.put(req, res.clone());
              await trimCache(CACHE_ASSETS, ASSET_API_LIMIT);
            }
            return res;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })(),
    );
    return;
  }

  // Static assets : cache-first.
  if (isStatic(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_STATIC);
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
          return res;
        } catch {
          return cached || Response.error();
        }
      })(),
    );
    return;
  }

  // Navigations : network-first, fallback offline shell.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          const cache = await caches.open(CACHE_PAGES);
          cache.put(req, res.clone()).catch(() => {});
          return res;
        } catch {
          const cache = await caches.open(CACHE_PAGES);
          const cached = await cache.match(req);
          if (cached) return cached;
          const offline = await caches.match(OFFLINE_URL);
          return offline || new Response("Offline", { status: 503, statusText: "Offline" });
        }
      })(),
    );
    return;
  }
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
