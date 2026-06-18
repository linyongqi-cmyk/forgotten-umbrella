const CACHE_NAME = "forgotten-umbrella-v31";
const ASSETS = [
  ".",
  "index.html",
  "styles.css",
  "app.js",
  "config.js",
  "data/umbrellas.json",
  "manifest.json",
  "assets/icons/icon.svg",
  "assets/photos/umbrella-kanda.svg",
  "assets/photos/umbrella-ginza.svg",
  "assets/photos/umbrella-yanaka.svg",
  "assets/photos/umbrella-shibuya.svg",
  "assets/photos/umbrella-placeholder-1.svg",
  "assets/photos/umbrella-placeholder-2.svg",
  "assets/photos/umbrella-placeholder-3.svg",
  "assets/photos/umbrella-placeholder-4.svg",
  "filebox/welcome-pic/2.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);
  const isAppShellRequest =
    requestUrl.origin === self.location.origin &&
    (requestUrl.pathname.endsWith(".html") ||
      requestUrl.pathname.endsWith(".css") ||
      requestUrl.pathname.endsWith(".js") ||
      requestUrl.pathname.endsWith(".json") ||
      requestUrl.pathname === "/");

  if (isAppShellRequest) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          return response;
        })
        .catch(() => caches.match(event.request)),
    );
    return;
  }

  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
