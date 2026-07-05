const CACHE_NAME = "forgotten-umbrella-v161";
const ASSETS = [
  ".",
  "index.html",
  "styles.css",
  "app.js",
  "config.js",
  "data/umbrellas.json",
  "data/texts.json",
  "manifest.json",
  "assets/icons/icon.svg",
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

  const isSameOriginImage =
    requestUrl.origin === self.location.origin &&
    (requestUrl.pathname.endsWith(".png") ||
      requestUrl.pathname.endsWith(".jpg") ||
      requestUrl.pathname.endsWith(".jpeg") ||
      requestUrl.pathname.endsWith(".webp") ||
      requestUrl.pathname.endsWith(".gif") ||
      requestUrl.pathname.endsWith(".avif"));

  if (isSameOriginImage) {
    // 只离线缓存小体积的生成图（NAME.thumb.webp / NAME.web.webp）；几 MB 的原图
    // （放大时才按需下载）不进缓存，避免把几百 MB 原图塞满用户设备（用户 #5）。
    const isDerivative =
      requestUrl.pathname.endsWith(".thumb.webp") || requestUrl.pathname.endsWith(".web.webp");
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (isDerivative) {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          }
          return response;
        })
        .catch(() => caches.match(event.request)),
    );
    return;
  }

  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
