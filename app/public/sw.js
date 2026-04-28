// Basic offline-first service worker for the 2D6 Dungeon Companion.
//
// Strategy:
// - Navigation requests (HTML): network-first; fall back to the cached
//   shell so the app still loads when offline (SPA route resolves
//   client-side).
// - Everything else (JS, CSS, JSON, images): cache-first. After the
//   first successful fetch the asset is served from cache forever, until
//   a new SW version evicts the old cache.
//
// Bump CACHE_VERSION when you ship a breaking change to the shell.
//
// Scope is determined by the SW's location: when served from
// /2D6-Dungeon-App/sw.js it controls /2D6-Dungeon-App/*.

/* eslint-env serviceworker */

const CACHE_VERSION = "v2";
const CACHE_NAME = `2d6d-${CACHE_VERSION}`;
// SHELL_URL must match the deployed base. For GitHub Pages this is the
// project subpath; for root deploys it's "/".
const SHELL_URL = new URL("./", self.registration.scope).pathname;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.add(SHELL_URL).catch(() => undefined),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
      ),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(cacheFirst(request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put(SHELL_URL, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(SHELL_URL);
    if (cached) return cached;
    return new Response(
      "Offline. Visit the app once online to enable offline mode.",
      { status: 503, statusText: "Service Unavailable" },
    );
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch {
    return new Response("Offline", { status: 503 });
  }
}
