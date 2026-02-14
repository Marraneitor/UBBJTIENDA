// UBBJ Tienda – Firebase Messaging Service Worker (fallback)
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
  console.log('📨 Push recibido (fallback SW):', payload);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
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
