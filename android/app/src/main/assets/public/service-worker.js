const CACHE_NAME = "shramic-local-shell-v1";
const APP_SHELL = [
    "/",
    "/login.html",
    "/shramic.html",
    "/shramic.css",
    "/shramic.js",
    "/i18n.js",
    "/manifest.webmanifest",
    "/icons/icon-192.png",
    "/icons/icon-512.png"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", event => {
    const request = event.request;
    const url = new URL(request.url);
    if (request.method !== "GET" || url.origin !== self.location.origin ||
        url.pathname.startsWith("/api/")) return;

    if (request.mode === "navigate") {
        event.respondWith(
            fetch(request).catch(() => caches.match(request).then(cached => cached || caches.match("/login.html")))
        );
        return;
    }

    event.respondWith(
        caches.match(request).then(cached => cached || fetch(request))
    );
});
