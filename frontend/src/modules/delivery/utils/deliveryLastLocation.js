/**
 * Persist last known rider coordinates (localStorage) and use as fallback when
 * getCurrentPosition fails (permission denied, timeout, GPS off).
 */

const STORAGE_KEY = "delivery_partner_last_location";

/** Default: accept cached coords up to this age for API calls (geofencing may reject very stale). */
const DEFAULT_MAX_CACHE_AGE_MS = 20 * 60 * 1000; // 20 minutes

export function saveDeliveryPartnerLocation(lat, lng) {
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    return;
  }
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ lat, lng, savedAt: Date.now() }),
    );
  } catch {
    /* quota / private mode */
  }
}

/**
 * @param {number} [maxAgeMs] - ignore cache older than this
 * @returns {{ lat: number, lng: number, savedAt: number } | null}
 */
export function getCachedDeliveryPartnerLocation(
  maxAgeMs = DEFAULT_MAX_CACHE_AGE_MS,
) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (
      typeof o.lat !== "number" ||
      typeof o.lng !== "number" ||
      !Number.isFinite(o.lat) ||
      !Number.isFinite(o.lng)
    ) {
      return null;
    }
    const savedAt = typeof o.savedAt === "number" ? o.savedAt : 0;
    if (maxAgeMs > 0 && Date.now() - savedAt > maxAgeMs) return null;
    return { lat: o.lat, lng: o.lng, savedAt };
  } catch {
    return null;
  }
}

/**
 * Try live GPS (strict), then browser cached position (looser), then localStorage.
 * @param {(result: { lat: number, lng: number, fromCache: boolean }) => void} onSuccess
 * @param {() => void} [onHardFail] - no live fix and no valid localStorage
 * @param {{ maxCacheAgeMs?: number, geoOptions?: PositionOptions }} [options]
 */
export function getCurrentPositionWithCache(onSuccess, onHardFail, options = {}) {
  const maxCacheAgeMs =
    options.maxCacheAgeMs ?? DEFAULT_MAX_CACHE_AGE_MS;
  const strictOpts = options.geoOptions ?? {
    enableHighAccuracy: true,
    maximumAge: 10000,
    timeout: 20000,
  };
  const looseOpts = {
    enableHighAccuracy: false,
    maximumAge: 120000,
    timeout: 15000,
  };

  const finishLive = (pos) => {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    saveDeliveryPartnerLocation(lat, lng);
    onSuccess({ lat, lng, fromCache: false });
  };

  const tryLocalStorage = () => {
    const c = getCachedDeliveryPartnerLocation(maxCacheAgeMs);
    if (c) {
      onSuccess({ lat: c.lat, lng: c.lng, fromCache: true });
      return;
    }
    onHardFail?.();
  };

  if (typeof navigator === "undefined" || !navigator.geolocation) {
    tryLocalStorage();
    return;
  }

  navigator.geolocation.getCurrentPosition(
    finishLive,
    () => {
      navigator.geolocation.getCurrentPosition(
        finishLive,
        tryLocalStorage,
        looseOpts,
      );
    },
    strictOpts,
  );
}
