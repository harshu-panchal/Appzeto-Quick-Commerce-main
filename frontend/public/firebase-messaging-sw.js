/* eslint-disable no-restricted-globals */

self.addEventListener("notificationclick", (event) => {
  const link = event?.notification?.data?.link || "/";
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.focus();
          client.postMessage({ type: "push:navigate", link });
          return client.navigate ? client.navigate(link) : undefined;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(link);
      }
      return undefined;
    }),
  );
});

importScripts("https://www.gstatic.com/firebasejs/11.0.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.0.0/firebase-messaging-compat.js");

const firebaseConfig = {
  apiKey: "AIzaSyBqT8QRQJuljNV1W5-XGK-plhSwLzwUJW4",
  authDomain: "appzeto-quick-commerce.firebaseapp.com",
  databaseURL: "https://appzeto-quick-commerce-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "appzeto-quick-commerce",
  storageBucket: "appzeto-quick-commerce.firebasestorage.app",
  messagingSenderId: "477007016819",
  appId: "1:477007016819:web:cc5fafe34a8b25b24a8b06",
  measurementId: "G-NKHFJRKT0Z",
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const messaging = firebase.messaging();

function buildNotificationOptions(payload = {}) {
  const notification = payload?.notification || {};
  const data = payload?.data || {};
  const title = notification.title || data.title || "Notification";
  const body = notification.body || data.body || "";
  const link = data.link || "/";
  const tag = notification.tag || data.orderId || data.eventType || "quick-commerce";

  return {
    title,
    options: {
      body,
      tag,
      requireInteraction: true,
      renotify: true,
      data: {
        link,
        orderId: data.orderId || "",
        eventType: data.eventType || "",
      },
    },
  };
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

messaging.onBackgroundMessage((payload) => {
  const { title, options } = buildNotificationOptions(payload);
  self.registration.showNotification(title, options);
});
