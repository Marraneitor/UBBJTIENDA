// UBBJ Tienda – Firebase Messaging Service Worker (legacy fallback)
// El SW principal es sw.js — este archivo solo existe por compatibilidad
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

messaging.onBackgroundMessage((payload) => {
  const title = payload.data?.title || payload.notification?.title || '🔔 UBBJ Tienda';
  const body = payload.data?.body || payload.notification?.body || 'Tienes una actualización';
  const url = payload.data?.url || '/';

  self.registration.showNotification(title, {
    body,
    icon: '/Logoubbj.png',
    badge: '/Logoubbj.png',
    vibrate: [200, 100, 200, 100, 200],
    tag: 'ubbj-notif-' + Date.now(),
    renotify: true,
    data: { url }
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
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
