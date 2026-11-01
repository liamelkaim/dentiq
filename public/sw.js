/* Dentiq service worker: an offline-safe shell only.
 *
 * It caches a short, fixed list of PUBLIC static files (icons, the manifest, the offline page) and nothing else.
 * It never caches pages, API responses, uploaded documents, question images, exports or anything tied to a session.
 * Navigations always go to the network; if the network is down, the offline page is shown instead.
 * See docs/pwa.md. Bump CACHE_VERSION when the list changes.
 */
const CACHE_VERSION = "v1";
const CACHE_NAME = "dentiq-shell-" + CACHE_VERSION;
const OFFLINE_URL = "/offline.html";

// The complete allowlist. Anything not listed here is never read from or written to the cache.
const SHELL_ASSETS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/brand/dentiq-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      // Remove older shell caches only; never touch caches that belong to something else.
      .then((names) => Promise.all(names.filter((n) => n.startsWith("dentiq-shell-") && n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    // Network only. The response is returned untouched and is NOT stored. Offline: show the static offline page.
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL).then((r) => r || Response.error())));
    return;
  }

  if (SHELL_ASSETS.includes(url.pathname) && url.search === "") {
    // Exact allowlisted public file: cache first, falling back to the network.
    event.respondWith(caches.match(request.url).then((cached) => cached || fetch(request)));
  }
  // Everything else (API, uploads, question images, exports, _next data, auth) is not handled here, so the browser
  // fetches it normally and nothing is stored.
});
