// UBBJ Tienda – Firebase Messaging Service Worker v2
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

  // Leer de data (mensajes data-only) o de notification como fallback
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

// Al hacer clic en la notificación, abrir la conversación/página correcta
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Si hay una ventana abierta, navegar a la URL y enfocar
      if (clientList.length > 0) {
        const client = clientList[0];
        client.navigate(targetUrl);
        return client.focus();
      }
      // Si no hay ventanas, abrir una nueva
      return clients.openWindow(targetUrl);
    })
  );
});
