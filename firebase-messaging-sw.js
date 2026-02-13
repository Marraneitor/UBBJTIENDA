// UBBJ Tienda – Firebase Messaging Service Worker
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

// Notificación en segundo plano (app cerrada o minimizada)
messaging.onBackgroundMessage((payload) => {
  console.log('📨 Notificación en segundo plano:', payload);

  const title = payload.notification?.title || '🔔 UBBJ Tienda';
  const body = payload.notification?.body || 'Tienes una actualización';

  self.registration.showNotification(title, {
    body,
    icon: '/Logoubbj.png',
    badge: '/Logoubbj.png',
    vibrate: [200, 100, 200, 100, 200],
    tag: 'ubbj-order-' + Date.now(),
    renotify: true,
    data: payload.data
  });
});

// Al hacer clic en la notificación, abrir la app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      if (clientList.length > 0) {
        return clientList[0].focus();
      }
      return clients.openWindow('/');
    })
  );
});
