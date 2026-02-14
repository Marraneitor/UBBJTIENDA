// UBBJ Tienda – Service Worker único (FCM + Caching)
// Firebase Messaging DEBE ir al inicio
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCIggz9kowWV0aiq95GV-7KStBBdNry7NI",
  authDomain: "ubbjtienda.firebaseapp.com",
  projectId: "ubbjtienda",
  storageBucket: "ubbjtienda.firebasestorage.app",
  messagingSenderId: "156880129521",
  appId: "1:156880129521:web:c245ca7018dd90d4454850"
});

const messaging = firebase.messaging();

// Background: FCM muestra la notificación automáticamente con el campo 'notification'
// onBackgroundMessage es solo para logging
messaging.onBackgroundMessage((payload) => {
  console.log('📨 Push en background:', payload);
});

// Click en notificación: navegar a la URL correcta
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // FCM guarda data dentro de FCM_MSG
  const fcmData = event.notification.data?.FCM_MSG?.data || event.notification.data || {};
  const targetUrl = fcmData.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      if (clientList.length > 0) {
        clientList[0].navigate(targetUrl);
        return clientList[0].focus();
      }
      return clients.openWindow(targetUrl);
    })
  );
});

// =============================================
// 📦 CACHING (PWA)
// =============================================
const CACHE_NAME = "ubbj-tienda-v9";
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

const CDN_CACHE_NAME = "ubbj-cdn-v1";
const CDN_URLS = [
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js"
];

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

self.addEventListener("activate", (event) => {
  const keepCaches = [CACHE_NAME, CDN_CACHE_NAME];
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !keepCaches.includes(k)).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (
    request.method !== "GET" ||
    request.url.includes("firestore.googleapis.com") ||
    request.url.includes("firebasestorage.googleapis.com") ||
    request.url.includes("googleapis.com")
  ) {
    return;
  }

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
          if (request.mode === "navigate") {
            const url = new URL(request.url);
            url.search = "";
            return caches.match(url.href).then((c) => c || caches.match("/index.html"));
          }
        });
      })
  );
});
