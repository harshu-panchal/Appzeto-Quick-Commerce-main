import { isSupported, getMessaging, getToken, onMessage } from "firebase/messaging";
import { getFirebaseApp } from "./client";
import axiosInstance from "@core/api/axios";

let foregroundListenerStarted = false;
let foregroundUnsubscribe = null;
const REGISTERED_KEY_PREFIX = "push:registered:";
const TOKEN_KEY_PREFIX = "push:fcm-token:";

function registeredKey(role = "customer") {
  return `${REGISTERED_KEY_PREFIX}${String(role || "customer").toLowerCase()}`;
}

function tokenKey(role = "customer") {
  return `${TOKEN_KEY_PREFIX}${String(role || "customer").toLowerCase()}`;
}

export function hasRegisteredFcmToken(role = "customer") {
  return sessionStorage.getItem(registeredKey(role)) === "1";
}

export function getStoredFcmToken(role = "customer") {
  return localStorage.getItem(tokenKey(role)) || "";
}

export function clearStoredFcmToken(role = "customer") {
  localStorage.removeItem(tokenKey(role));
  sessionStorage.removeItem(registeredKey(role));
}

function persistStoredFcmToken(role = "customer", token = "") {
  if (!token) return;
  localStorage.setItem(tokenKey(role), token);
  sessionStorage.setItem(registeredKey(role), "1");
}

async function ensureServiceWorkerRegistration() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service workers are not supported in this browser");
  }
  // Must be at site root for FCM web push.
  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
    updateViaCache: "none",
  });
  await registration.update();
  await navigator.serviceWorker.ready;
  return registration;
}

async function showSystemNotification({ title, body, data } = {}) {
  const safeTitle = String(title || "Notification");
  const safeBody = String(body || "");
  const link = data?.link || "/";
  const tag = data?.orderId || data?.eventType || "quick-commerce";

  // Prefer SW notifications so they land in the OS notification center consistently.
  try {
    const reg = await navigator.serviceWorker.ready;
    if (reg?.showNotification) {
      await reg.showNotification(safeTitle, {
        body: safeBody,
        tag,
        requireInteraction: true,
        renotify: true,
        data: {
          link,
          orderId: data?.orderId || "",
          eventType: data?.eventType || "",
        },
      });
      return;
    }
  } catch {
    // fallback below
  }

  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    new Notification(safeTitle, {
      body: safeBody,
      tag,
      requireInteraction: true,
      renotify: true,
      data: {
        link,
        orderId: data?.orderId || "",
        eventType: data?.eventType || "",
      },
    });
  }
}

export async function ensureFcmTokenRegistered({
  role = "customer",
  platform = "web",
  device = "",
} = {}) {
  const supported = await isSupported().catch(() => false);
  if (!supported) {
    throw new Error("Firebase Messaging is not supported in this environment");
  }

  const app = getFirebaseApp();
  if (!app) {
    throw new Error("Firebase is not configured (missing VITE_FIREBASE_* env)");
  }

  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
  if (!vapidKey) {
    throw new Error("Missing VITE_FIREBASE_VAPID_KEY");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission not granted");
  }

  const swRegistration = await ensureServiceWorkerRegistration();
  const messaging = getMessaging(app);
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: swRegistration });
  if (!token) {
    throw new Error("Failed to obtain FCM token");
  }

  await axiosInstance.post("/push/register", {
    token,
    platform,
    device: device || navigator.userAgent,
  });

  persistStoredFcmToken(role, token);
  return token;
}

export async function removeStoredFcmToken({
  role = "customer",
  token = "",
} = {}) {
  const candidateToken = String(token || getStoredFcmToken(role) || "").trim();
  if (!candidateToken) {
    clearStoredFcmToken(role);
    return false;
  }

  await axiosInstance.delete("/push/remove", {
    data: {
      token: candidateToken,
    },
  });

  clearStoredFcmToken(role);
  return true;
}

export async function startForegroundPushListener() {
  if (foregroundListenerStarted && foregroundUnsubscribe) {
    return foregroundUnsubscribe;
  }

  const supported = await isSupported().catch(() => false);
  if (!supported) return () => {};

  const app = getFirebaseApp();
  if (!app) return () => {};

  // Ensure SW exists (helps with consistent notification center behavior).
  try {
    await ensureServiceWorkerRegistration();
  } catch {
    // ignore
  }

  const messaging = getMessaging(app);
  const unsubscribe = onMessage(messaging, async (payload) => {
    const title =
      payload?.notification?.title || payload?.data?.title || "Notification";
    const body =
      payload?.notification?.body || payload?.data?.body || "";
    await showSystemNotification({
      title,
      body,
      data: payload?.data || {},
    });
  });

  foregroundListenerStarted = true;
  foregroundUnsubscribe = unsubscribe;
  return unsubscribe;
}

export default {
  clearStoredFcmToken,
  ensureFcmTokenRegistered,
  getStoredFcmToken,
  hasRegisteredFcmToken,
  removeStoredFcmToken,
  startForegroundPushListener,
};
