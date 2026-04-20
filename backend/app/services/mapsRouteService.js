import { Client } from "@googlemaps/google-maps-services-js";
import polyline from "@mapbox/polyline";
import { getRedisClient } from "../config/redis.js";
import { writeRoutePolyline, getRoutePolyline } from "./firebaseService.js";
import { distanceMeters } from "../utils/geoUtils.js";

const client = new Client({});

const ROUTE_CACHE_TTL_SEC = () =>
  parseInt(process.env.ROUTE_CACHE_TTL_SEC || "900", 10);
const ROUTE_CACHE_MATCH_THRESHOLD_M = () =>
  parseInt(process.env.ROUTE_CACHE_MATCH_THRESHOLD_METERS || "150", 10);

function roundCoord(n) {
  return Math.round(n * 1e5) / 1e5;
}

/** Bump when route payload shape changes (invalidates Redis entries). */
function cacheKey(origin, dest, mode) {
  return `route:v4:${roundCoord(origin.lat)},${roundCoord(origin.lng)}:${roundCoord(dest.lat)},${roundCoord(dest.lng)}:${mode}`;
}

/** Directions step polyline — tolerate string or `{ points }` shapes. */
function stepEncodedPolyline(step) {
  if (!step || typeof step !== "object") return null;
  const p = step.polyline;
  if (typeof p === "string") return p;
  if (p && typeof p.points === "string") return p.points;
  return null;
}

/**
 * `overview_polyline` is heavily simplified: decoded points can be kilometers
 * apart, so maps draw long straight "chords" across blocks (looks like a second
 * route). Prefer merging each step's polyline — full road geometry.
 * Iterates all legs (multi-waypoint routes).
 */
function mergeRouteStepPolylines(route) {
  const legs = route?.legs;
  if (!Array.isArray(legs) || legs.length === 0) return null;
  const coords = [];
  for (const leg of legs) {
    if (!leg?.steps?.length) continue;
    for (const step of leg.steps) {
      const enc = stepEncodedPolyline(step);
      if (!enc || typeof enc !== "string") continue;
      let part;
      try {
        part = polyline.decode(enc);
      } catch {
        continue;
      }
      if (!Array.isArray(part) || part.length === 0) continue;
      for (const pair of part) {
        if (!Array.isArray(pair) || pair.length < 2) continue;
        if (coords.length === 0) {
          coords.push(pair);
          continue;
        }
        const prev = coords[coords.length - 1];
        if (prev[0] === pair[0] && prev[1] === pair[1]) continue;
        coords.push(pair);
      }
    }
  }
  if (coords.length < 2) return null;
  try {
    return polyline.encode(coords);
  } catch {
    return null;
  }
}

/**
 * Returns { polyline, bounds, distanceMeters } from Directions API with Redis cache.
 */
function degradedPayload() {
  return { polyline: null, bounds: null, distanceMeters: null, duration: null, degraded: true };
}

function hasValidPoint(point) {
  return (
    point &&
    typeof point.lat === "number" &&
    typeof point.lng === "number" &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng)
  );
}

function isRouteCacheCompatible(cached, origin, dest, phase, mode) {
  if (!cached?.polyline) return false;
  if ((cached.phase || "pickup") !== phase) return false;
  if ((cached.mode || "driving") !== mode) return false;
  if (!hasValidPoint(origin) || !hasValidPoint(dest)) return false;
  if (!hasValidPoint(cached.origin) || !hasValidPoint(cached.destination)) {
    return false;
  }

  const originDrift = distanceMeters(
    origin.lat,
    origin.lng,
    cached.origin.lat,
    cached.origin.lng,
  );
  const destDrift = distanceMeters(
    dest.lat,
    dest.lng,
    cached.destination.lat,
    cached.destination.lng,
  );

  const threshold = Math.max(25, ROUTE_CACHE_MATCH_THRESHOLD_M());
  return originDrift <= threshold && destDrift <= threshold;
}

/**
 * Returns { polyline, bounds, distanceMeters, degraded } from Directions API with Redis + Firebase cache.
 * Requires GOOGLE_MAPS_API_KEY and Directions API enabled in Google Cloud (billing on).
 * Does not cache failed or empty routes so fixing the key takes effect immediately.
 * 
 * @param {Object} origin - { lat, lng }
 * @param {Object} dest - { lat, lng }
 * @param {string} mode - "driving" | "walking" | "bicycling" | "transit"
 * @param {string} orderId - Optional order ID for Firebase caching
 * @param {string} phase - "pickup" | "delivery"
 */
export async function getCachedRoute(origin, dest, mode = "driving", orderId = null, phase = "pickup") {
  // Try Firebase cache first if orderId is provided
  if (orderId) {
    try {
      const firebaseRoute = await getRoutePolyline(orderId);
      const cachedPhase = firebaseRoute?.phase || "pickup";
      if (isRouteCacheCompatible(firebaseRoute, origin, dest, phase, mode)) {
        return {
          polyline: firebaseRoute.polyline,
          bounds: firebaseRoute.bounds,
          distanceMeters: firebaseRoute.distance,
          duration: firebaseRoute.duration,
          degraded: false,
          source: 'firebase',
          phase: cachedPhase,
        };
      }
    } catch {
      /* ignore firebase cache errors */
    }
  }

  // Try Redis cache
  const redis = getRedisClient();
  const key = cacheKey(origin, dest, mode);
  if (redis) {
    try {
      const cached = await redis.get(key);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.polyline && !parsed.degraded) {
          return { ...parsed, source: 'redis', phase };
        }
      }
    } catch {
      /* ignore */
    }
  }

  const apiKey =
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_SERVER_KEY?.trim();
  if (!apiKey) {
    return degradedPayload();
  }

  try {
    const resp = await client.directions({
      params: {
        origin: `${origin.lat},${origin.lng}`,
        destination: `${dest.lat},${dest.lng}`,
        mode,
        key: apiKey,
      },
      timeout: 10000,
    });

    const status = resp.data?.status;
    if (status && status !== "OK") {
      return degradedPayload();
    }

    const route = resp.data.routes?.[0];
    const leg = route?.legs?.[0];
    const mergedFromSteps = mergeRouteStepPolylines(route);
    const polyline =
      mergedFromSteps || route?.overview_polyline?.points || null;
    const distanceMeters = leg?.distance?.value ?? null;
    const duration = leg?.duration?.value ?? null;

    if (!polyline) {
      return degradedPayload();
    }

    const payload = {
      polyline,
      bounds: route?.bounds || null,
      distanceMeters,
      duration,
      degraded: false,
      source: 'api',
      phase,
    };

    // Cache in Redis
    if (redis) {
      try {
        await redis.set(key, JSON.stringify(payload), "EX", ROUTE_CACHE_TTL_SEC());
      } catch {
        /* ignore */
      }
    }

    // Cache in Firebase if orderId is provided
    if (orderId) {
      try {
        await writeRoutePolyline(orderId, {
          polyline,
          phase,
          origin,
          destination: dest,
          mode,
          bounds: route?.bounds || null,
          distance: distanceMeters,
          duration,
        });
      } catch {
        /* ignore firebase write errors */
      }
    }

    return payload;
  } catch {
    return degradedPayload();
  }
}
