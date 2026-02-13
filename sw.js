// UBBJ Tienda – Service Worker v2
const CACHE_NAME = "ubbj-tienda-v2";
const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/vender.html",
  "/perfil.html",
  "/perfilvendedor.html",
  "/ubbjotito.html",
  "/admin.html",
  "/style.css",
  "/app.js",
  "/manifest.json",
  "/favicon.ico",
  "/Logoubbj.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

// Install – pre-cache shell assets
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        console.warn("SW: algunos assets no se pudieron cachear", err);
      });
    })
  );
});

// Activate – clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch – Network-first, fallback to cache (skip Firebase/API requests)
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // No cachear requests de Firebase/APIs/externos
  if (
    request.method !== "GET" ||
    request.url.includes("firestore.googleapis.com") ||
    request.url.includes("firebasestorage.googleapis.com") ||
    request.url.includes("googleapis.com") ||
    request.url.includes("gstatic.com") ||
    request.url.includes("cdn.jsdelivr.net")
  ) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => {
        return caches.match(request).then((cached) => {
          if (cached) return cached;
          // Si es navegación, devolver index.html cacheado
          if (request.mode === "navigate") {
            return caches.match("/index.html");
          }
        });
      })
  );
});

// Push notifications
self.addEventListener("push", (event) => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    const title = data.notification?.title || "UBBJ Tienda";
    const options = {
      body: data.notification?.body || "Tienes una nueva notificación",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      vibrate: [200, 100, 200],
      data: data.data || {}
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch (e) {
    console.warn("SW push parse error", e);
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || "/"));
});
