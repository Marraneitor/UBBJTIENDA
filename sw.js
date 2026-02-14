// UBBJ Tienda – Service Worker v3 (optimizado)
const CACHE_NAME = "ubbj-tienda-v3";
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

// Firebase SDKs versionados — seguros de cachear
const CDN_CACHE_NAME = "ubbj-cdn-v1";
const CDN_URLS = [
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js"
];

// Install – pre-cache shell assets + Firebase SDKs
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then((cache) => {
        return cache.addAll(PRECACHE_URLS).catch((err) => {
          console.warn("SW: algunos assets no se pudieron cachear", err);
        });
      }),
      caches.open(CDN_CACHE_NAME).then((cache) => {
        return cache.addAll(CDN_URLS).catch((err) => {
          console.warn("SW: algunos CDN assets no se pudieron cachear", err);
        });
      })
    ])
  );
});

// Activate – clean up old caches
self.addEventListener("activate", (event) => {
  const keepCaches = [CACHE_NAME, CDN_CACHE_NAME];
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !keepCaches.includes(k)).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch – Network-first, fallback to cache (skip Firebase/API requests)
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // No cachear requests de Firebase APIs dinámicas
  if (
    request.method !== "GET" ||
    request.url.includes("firestore.googleapis.com") ||
    request.url.includes("firebasestorage.googleapis.com") ||
    request.url.includes("googleapis.com")
  ) {
    return;
  }

  // Cache-first para CDN versionados (Firebase SDKs, jsdelivr)
  if (request.url.includes("gstatic.com/firebasejs/") || request.url.includes("cdn.jsdelivr.net")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CDN_CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
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
          // Para navegación, intentar servir la misma página sin query params
          if (request.mode === "navigate") {
            const url = new URL(request.url);
            url.search = "";
            return caches.match(url.href).then((c) => c || caches.match("/index.html"));
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
  const url = event.notification.data?.url || event.notification.data?.FCM_MSG?.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // Si ya hay una ventana abierta con esa URL, enfocarla
      for (const client of windowClients) {
        if (client.url.includes(url.replace('https://ubbjtienda.vercel.app', '')) && 'focus' in client) {
          return client.focus();
        }
      }
      // Si hay alguna ventana abierta, navegar a la URL
      if (windowClients.length > 0) {
        const client = windowClients[0];
        client.navigate(url);
        return client.focus();
      }
      // Si no hay ventanas, abrir una nueva
      return clients.openWindow(url);
    })
  );
});
