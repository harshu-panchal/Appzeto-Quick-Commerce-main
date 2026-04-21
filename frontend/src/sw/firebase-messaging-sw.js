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
  apiKey: "__VITE_FIREBASE_API_KEY__",
  authDomain: "__VITE_FIREBASE_AUTH_DOMAIN__",
  databaseURL: "__VITE_FIREBASE_DATABASE_URL__",
  projectId: "__VITE_FIREBASE_PROJECT_ID__",
  storageBucket: "__VITE_FIREBASE_STORAGE_BUCKET__",
  messagingSenderId: "__VITE_FIREBASE_MESSAGING_SENDER_ID__",
  appId: "__VITE_FIREBASE_APP_ID__",
  measurementId: "__VITE_FIREBASE_MEASUREMENT_ID__",
};

if (!firebaseConfig.apiKey || !firebaseConfig.projectId || firebaseConfig.apiKey.startsWith("__")) {
  console.warn("[firebase-messaging-sw] Missing Firebase web config; background messaging is disabled.");
} else {
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
    const image = String(notification.image || data.image || data.imageUrl || "").trim();

    return {
      title,
      options: {
        body,
        tag,
        requireInteraction: true,
        renotify: true,
        ...(image ? { image } : {}),
        data: {
          link,
          orderId: data.orderId || "",
          eventType: data.eventType || "",
          image,
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
}
