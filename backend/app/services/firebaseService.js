import { getFirebaseRealtimeDb } from "../config/firebaseAdmin.js";

/**
 * RTDB paths — customer reads `deliveryLocations/{orderId}/{deliveryBoyId}`.
 */
export const trackingPaths = {
  deliveryLocation: (orderId, deliveryBoyId) =>
    `/deliveryLocations/${orderId}/${deliveryBoyId}`,
  orderRider: (orderId) => `/orders/${orderId}/rider`,
  orderTrail: (orderId) => `/orders/${orderId}/trail`,
  orderRoute: (orderId) => `/orders/${orderId}/route`,
  deliveryCurrent: (deliveryId) => `/deliveries/${deliveryId}/current`,
  fleetActive: (deliveryId) => `/fleet/active/${deliveryId}`,
};

export const writeDeliveryLocation = async (deliveryId, orderId, snapshot) => {
  try {
    const db = getFirebaseRealtimeDb();
    if (!db) {
      return { deliveryId, orderId, snapshot, skipped: true };
    }

    const timestamp = snapshot.lastUpdatedAt || new Date().toISOString();
    const cleanSnapshot = {
      lat: snapshot.lat,
      lng: snapshot.lng,
      lastUpdatedAt: timestamp,
      deliveryId: snapshot.deliveryId,
      orderId: snapshot.orderId ?? null,
      source: snapshot.source || "gps",
    };

    if (snapshot.accuracy !== undefined && snapshot.accuracy !== null) {
      cleanSnapshot.accuracy = snapshot.accuracy;
    }
    if (snapshot.heading !== undefined && snapshot.heading !== null) {
      cleanSnapshot.heading = snapshot.heading;
    }
    if (snapshot.speed !== undefined && snapshot.speed !== null) {
      cleanSnapshot.speed = snapshot.speed;
    }

    const updates = {};
    updates[trackingPaths.deliveryCurrent(deliveryId)] = cleanSnapshot;
    updates[trackingPaths.fleetActive(deliveryId)] = {
      lat: snapshot.lat,
      lng: snapshot.lng,
      orderId: snapshot.orderId || null,
      lastUpdatedAt: timestamp,
      source: cleanSnapshot.source,
    };

    if (orderId && deliveryId) {
      updates[trackingPaths.deliveryLocation(orderId, deliveryId)] = {
        lat: snapshot.lat,
        lng: snapshot.lng,
        timestamp,
        lastUpdatedAt: timestamp,
        deliveryId,
        orderId,
        source: cleanSnapshot.source,
        ...(snapshot.accuracy !== undefined && snapshot.accuracy !== null
          ? { accuracy: snapshot.accuracy }
          : {}),
        ...(snapshot.heading !== undefined && snapshot.heading !== null
          ? { heading: snapshot.heading }
          : {}),
        ...(snapshot.speed !== undefined && snapshot.speed !== null
          ? { speed: snapshot.speed }
          : {}),
      };
      updates[trackingPaths.orderRider(orderId)] = cleanSnapshot;
    }

    await db.ref().update(updates);
    return { deliveryId, orderId, snapshot: cleanSnapshot };
  } catch (err) {
    console.error("writeDeliveryLocation error:", err.message);
    return null;
  }
};

export const appendTrailPoint = async (orderId, point) => {
  try {
    const db = getFirebaseRealtimeDb();
    if (!db) {
      return { orderId, point, skipped: true };
    }
    await db.ref(trackingPaths.orderTrail(orderId)).push(point);
    return { orderId, point };
  } catch (err) {
    console.error("appendTrailPoint error:", err.message);
    return null;
  }
};

export const writeRoutePolyline = async (orderId, routeData) => {
  try {
    const db = getFirebaseRealtimeDb();
    if (!db) {
      console.log(`[Firebase] writeRoutePolyline skipped - no DB for order ${orderId}`);
      return { orderId, routeData, skipped: true };
    }

    const routeCache = {
      polyline: routeData.polyline,
      phase: routeData.phase || null,
      origin: routeData.origin || null,
      destination: routeData.destination || null,
      mode: routeData.mode || "driving",
      distance: routeData.distance,
      duration: routeData.duration,
      bounds: routeData.bounds,
      cachedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 minutes
    };

    await db.ref(trackingPaths.orderRoute(orderId)).set(routeCache);
    console.log(`[Firebase] ✓ Route cached for order ${orderId} at path /orders/${orderId}/route`);
    return { orderId, routeCache };
  } catch (err) {
    console.error("writeRoutePolyline error:", err.message);
    return null;
  }
};

export const getRoutePolyline = async (orderId) => {
  try {
    const db = getFirebaseRealtimeDb();
    if (!db) {
      console.log(`[Firebase] getRoutePolyline skipped - no DB for order ${orderId}`);
      return null;
    }

    const snapshot = await db.ref(trackingPaths.orderRoute(orderId)).once('value');
    const routeData = snapshot.val();

    if (!routeData) {
      console.log(`[Firebase] No cached route found for order ${orderId}`);
      return null;
    }

    // Check if route is expired
    const expiresAt = new Date(routeData.expiresAt);
    if (expiresAt < new Date()) {
      // Route expired, delete it
      console.log(`[Firebase] Route expired for order ${orderId}, removing cache`);
      await db.ref(trackingPaths.orderRoute(orderId)).remove();
      return null;
    }

    console.log(`[Firebase] ✓ Route cache hit for order ${orderId}`);
    return routeData;
  } catch (err) {
    console.error("getRoutePolyline error:", err.message);
    return null;
  }
};
