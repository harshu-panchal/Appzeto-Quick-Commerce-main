import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import { GoogleMap, useJsApiLoader, Marker } from "@react-google-maps/api";
import { Loader2 } from "lucide-react";
import customerPin from "@/assets/customer-pin.png";
import { deliveryApi } from "../services/deliveryApi";
import deliveryIcon from "@/assets/deliveryIcon.png";
import storePin from "@/assets/store-pin.png";
import {
  getCachedDeliveryPartnerLocation,
  saveDeliveryPartnerLocation,
} from "../utils/deliveryLastLocation";

const libraries = ["geometry"];
const ROUTE_REFRESH_THRESHOLD_M = 150;
const ROUTE_REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const RECENTER_INTERVAL_MS = 15000;
const RIDER_FOCUS_RADIUS_M = 500;
const LOCATION_POST_INTERVAL_MS = 5000;

// Container style will be 100% to fill parent
const containerStyle = {
  width: "100%",
  height: "100%",
  minHeight: "200px",
};

/** GeoJSON [lng, lat] → { lat, lng } */
function coordsToLatLng(coords) {
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const [lng, lat] = coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function distanceMeters(from, to) {
  if (!from || !to) return null;
  if (
    typeof from.lat !== "number" ||
    typeof from.lng !== "number" ||
    typeof to.lat !== "number" ||
    typeof to.lng !== "number" ||
    !Number.isFinite(from.lat) ||
    !Number.isFinite(from.lng) ||
    !Number.isFinite(to.lat) ||
    !Number.isFinite(to.lng)
  ) {
    return null;
  }

  const r = 6371000;
  const dLat = ((to.lat - from.lat) * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function destinationForPhase(order, phase) {
  const isReturn = order?.returnStatus && order.returnStatus !== "none";
  if (phase === "pickup") {
    if (isReturn) {
      const loc = order?.address?.location;
      if (
        loc &&
        typeof loc.lat === "number" &&
        typeof loc.lng === "number" &&
        Number.isFinite(loc.lat) &&
        Number.isFinite(loc.lng)
      ) {
        return { lat: loc.lat, lng: loc.lng };
      }
      return null;
    }
    return coordsToLatLng(order?.seller?.location?.coordinates);
  }
  if (isReturn) {
    return coordsToLatLng(order?.seller?.location?.coordinates);
  }
  const loc = order?.address?.location;
  if (
    loc &&
    typeof loc.lat === "number" &&
    typeof loc.lng === "number" &&
    Number.isFinite(loc.lat) &&
    Number.isFinite(loc.lng)
  ) {
    return { lat: loc.lat, lng: loc.lng };
  }
  return null;
}

/**
 * Live tracking map: rider + one road route from GET /orders/workflow/:orderId/route.
 * Uses a single native google.maps.Polyline (ref) so the React wrapper cannot leave
 * duplicate overlays. No geodesic rider→dest line — that caused a second “straight” path.
 */
const DeliveryTrackingMapComponent = ({
  orderId,
  phase,
  order,
  onRouteStatsChange,
}) => {
  const mapRef = useRef(null);
  const routePolylineRef = useRef(null);
  const [mapInstance, setMapInstance] = useState(null);
  const [rider, setRider] = useState(() => {
    const c = getCachedDeliveryPartnerLocation();
    return c ? { lat: c.lat, lng: c.lng } : null;
  });
  // Initialize riderRef from cache so fetchRoute works immediately on mount
  const riderRef = useRef((() => {
    const c = getCachedDeliveryPartnerLocation();
    return c ? { lat: c.lat, lng: c.lng } : null;
  })());
  const [routeData, setRouteData] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const lastFetchRef = useRef({ at: 0, phase: null, orderId: null });
  const routeOriginRef = useRef(null);
  const watchIdRef = useRef(null);
  const lastLocationPostRef = useRef(0);
  const locationInFlightRef = useRef(false);
  const locationAbortRef = useRef(null);

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

  const { isLoaded, loadError } = useJsApiLoader({
    id: "delivery-tracking-map",
    googleMapsApiKey: apiKey,
    libraries,
  });

  useEffect(() => {
    if (!navigator.geolocation) return undefined;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = pos.coords.accuracy;
        const heading = pos.coords.heading;
        const speed = pos.coords.speed;
        
        saveDeliveryPartnerLocation(lat, lng);
        setRider({ lat, lng });
        riderRef.current = { lat, lng };
        
        // Throttle location POSTs to once every 5s and skip if one is already in-flight
        const now = Date.now();
        if (now - lastLocationPostRef.current < LOCATION_POST_INTERVAL_MS) return;
        if (locationInFlightRef.current) return;
        lastLocationPostRef.current = now;
        locationInFlightRef.current = true;

        // Abort any previous stale request
        if (locationAbortRef.current) locationAbortRef.current.abort();
        const controller = new AbortController();
        locationAbortRef.current = controller;

        deliveryApi.postLocation(
          { lat, lng, accuracy, heading, speed, orderId: orderId || null },
          { signal: controller.signal, timeout: 8000 },
        ).catch(() => {}).finally(() => {
          locationInFlightRef.current = false;
          if (locationAbortRef.current === controller) locationAbortRef.current = null;
        });
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    );
    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (locationAbortRef.current) {
        locationAbortRef.current.abort();
        locationAbortRef.current = null;
      }
      locationInFlightRef.current = false;
    };
  }, [orderId]);

  const routeAbortRef = useRef(null);
  const routeInFlightRef = useRef(false);

  const fetchRoute = useCallback(async () => {
    const currentRider = riderRef.current;
    if (!orderId || !currentRider) return;
    if (routeInFlightRef.current) return;
    const now = Date.now();
    const sameRouteContext =
      lastFetchRef.current.phase === phase &&
      lastFetchRef.current.orderId === orderId;
    const originDrift =
      routeOriginRef.current && currentRider
        ? distanceMeters(routeOriginRef.current, currentRider)
        : null;

    if (
      sameRouteContext &&
      lastFetchRef.current.at &&
      now - lastFetchRef.current.at < ROUTE_REFRESH_INTERVAL_MS &&
      (originDrift === null || originDrift < ROUTE_REFRESH_THRESHOLD_M)
    ) {
      return;
    }

    lastFetchRef.current = { at: now, phase, orderId };
    routeInFlightRef.current = true;

    if (routeAbortRef.current) routeAbortRef.current.abort();
    const controller = new AbortController();
    routeAbortRef.current = controller;

    setRouteLoading(true);
    try {
      const res = await deliveryApi.getOrderRoute(orderId, {
        phase,
        originLat: currentRider.lat,
        originLng: currentRider.lng,
        _t: now,
      }, { signal: controller.signal });
      if (res.data?.success) {
        const nextRoute = res.data.result || res.data.data || null;
        setRouteData(nextRoute);
        routeOriginRef.current = { lat: currentRider.lat, lng: currentRider.lng };
      }
    } catch {
      setRouteData((prev) => prev || { degraded: true });
    } finally {
      routeInFlightRef.current = false;
      if (routeAbortRef.current === controller) routeAbortRef.current = null;
      setRouteLoading(false);
    }
  // Stable — uses riderRef so GPS ticks don't recreate this callback
  }, [orderId, phase]);

  useEffect(() => {
    setRouteData((prev) => (prev?.phase === phase ? prev : null));
    lastFetchRef.current = { at: 0, phase: null, orderId: null };
    routeOriginRef.current = null;
  }, [orderId, phase]);

  useEffect(() => {
    if (!rider) return undefined;
    fetchRoute();
    const iv = setInterval(fetchRoute, ROUTE_REFRESH_INTERVAL_MS);
    return () => {
      clearInterval(iv);
      if (routeAbortRef.current) {
        routeAbortRef.current.abort();
        routeAbortRef.current = null;
      }
      routeInFlightRef.current = false;
    };
  // rider in deps only to trigger initial fetch when location first becomes available
  // fetchRoute is stable (doesn't depend on rider state)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!rider, fetchRoute, phase, orderId]);

  const isReturn = order?.returnStatus && order.returnStatus !== "none";
  // Use order address location, fall back to the destination resolved by the route API
  const dest = useMemo(() => {
    const fromOrder = destinationForPhase(order, phase);
    if (fromOrder) return fromOrder;
    // routeData may contain the resolved destination (set by backend geocode fallback)
    const rd = routeData?.destination;
    if (rd && typeof rd.lat === "number" && typeof rd.lng === "number") {
      return { lat: rd.lat, lng: rd.lng };
    }
    return null;
  }, [order, phase, routeData]);

  useEffect(() => {
    if (typeof onRouteStatsChange !== "function") return undefined;
    onRouteStatsChange({
      phase,
      rider,
      destination: dest,
      routeDurationSeconds: Number(routeData?.duration) || null,
      routeDistanceMeters:
        Number(routeData?.distanceMeters ?? routeData?.distance) || null,
    });
    return undefined;
  }, [onRouteStatsChange, phase, rider, dest, routeData]);

  const decodedPath = useMemo(() => {
    const encoded = routeData?.polyline;
    if (!encoded || !isLoaded || !mapInstance) return null;
    try {
      const decode = window.google?.maps?.geometry?.encoding?.decodePath;
      if (!decode) return null;
      return decode(encoded);
    } catch {
      return null;
    }
  }, [routeData?.polyline, isLoaded, mapInstance]);

  /** Only the road polyline from the API — never a 2-point geodesic “fallback”. */
  const linePath = useMemo(() => {
    if (decodedPath?.length) return decodedPath;
    return [];
  }, [decodedPath]);

  const riderMarkerIcon = useMemo(() => {
    if (!isLoaded || !window.google?.maps) return undefined;

    return {
      url: deliveryIcon,
      scaledSize: new window.google.maps.Size(44, 64),
      anchor: new window.google.maps.Point(22, 64),
    };
  }, [isLoaded]);

  const customerMarkerIcon = useMemo(() => {
    if (!isLoaded || !window.google?.maps) return undefined;

    return {
      url: customerPin,
      scaledSize: new window.google.maps.Size(40, 40),
      anchor: new window.google.maps.Point(20, 40),
    };
  }, [isLoaded]);

  const storeMarkerIcon = useMemo(() => {
    if (!isLoaded || !window.google?.maps) return undefined;

    return {
      url: storePin,
      scaledSize: new window.google.maps.Size(40, 40),
      anchor: new window.google.maps.Point(20, 40),
    };
  }, [isLoaded]);

  const mapCenter = useMemo(() => {
    if (rider) return rider;
    if (dest) return dest;
    return { lat: 20.5937, lng: 78.9629 };
  }, [rider, dest]);

  const onMapLoad = useCallback((map) => {
    mapRef.current = map;
    setMapInstance(map);
  }, []);

  const focusOnRider500m = useCallback((map, riderLocation) => {
    if (!map || !window.google?.maps?.geometry?.spherical || !riderLocation) return;

    const center = new window.google.maps.LatLng(riderLocation.lat, riderLocation.lng);
    const bounds = new window.google.maps.LatLngBounds();
    [0, 90, 180, 270].forEach((heading) => {
      const edge = window.google.maps.geometry.spherical.computeOffset(
        center,
        RIDER_FOCUS_RADIUS_M,
        heading,
      );
      bounds.extend(edge);
    });
    map.fitBounds(bounds, 24);
  }, []);

  const strokeColor = "#2563eb";

  useEffect(() => {
    if (!isLoaded || !mapInstance || !window.google?.maps) return undefined;

    // Clear previous polyline
    if (routePolylineRef.current) {
      routePolylineRef.current.setMap(null);
      routePolylineRef.current = null;
    }

    if (!linePath?.length) return undefined;

    const pl = new window.google.maps.Polyline({
      path: linePath,
      strokeColor: "#2563eb",
      strokeOpacity: 0.95,
      strokeWeight: 5,
      map: mapInstance,
      zIndex: 10,
    });
    routePolylineRef.current = pl;

    return () => {
      if (routePolylineRef.current) {
        routePolylineRef.current.setMap(null);
        routePolylineRef.current = null;
      }
    };
  }, [isLoaded, mapInstance, linePath]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.google) return;

    if (rider) {
      focusOnRider500m(map, rider);
      return;
    }

    try {
      const bounds = new window.google.maps.LatLngBounds();
      if (linePath?.length) {
        linePath.forEach((p) => bounds.extend(p));
      }
      if (rider) bounds.extend(rider);
      if (dest) bounds.extend(dest);
      map.fitBounds(bounds, 32);
    } catch {
      /* ignore */
    }
  }, [linePath, rider, dest, focusOnRider500m]);

  // Smoothly keep rider centered and zoomed to 500m view.
  useEffect(() => {
    if (!isLoaded || !rider) return undefined;
    const map = mapRef.current;
    if (!map) return undefined;

    const id = setInterval(() => {
      const currentMap = mapRef.current;
      if (!currentMap || !rider) return;
      currentMap.panTo(rider);
      focusOnRider500m(currentMap, rider);
    }, RECENTER_INTERVAL_MS);

    return () => clearInterval(id);
  }, [isLoaded, rider?.lat, rider?.lng, focusOnRider500m]);

  // Add resize observer to handle dynamic height changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.google) return undefined;

    const handleResize = () => {
      window.google.maps.event.trigger(map, 'resize');
      // Re-focus rider after resize when available
      try {
        if (rider) {
          focusOnRider500m(map, rider);
          return;
        }
        const bounds = new window.google.maps.LatLngBounds();
        if (linePath?.length) {
          linePath.forEach((p) => bounds.extend(p));
        }
        if (rider) bounds.extend(rider);
        if (dest) bounds.extend(dest);
        map.fitBounds(bounds, 32);
      } catch {
        /* ignore */
      }
    };

    // Listen for window resize events
    window.addEventListener('resize', handleResize);
    
    // Create a resize observer for the map container
    const mapContainer = map.getDiv()?.parentElement;
    let resizeObserver;
    
    if (mapContainer && window.ResizeObserver) {
      resizeObserver = new ResizeObserver(() => {
        handleResize();
      });
      resizeObserver.observe(mapContainer);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [linePath, rider, dest, focusOnRider500m]);

  if (!apiKey) {
    return (
      <div className="relative w-full h-48 bg-slate-100 rounded-2xl flex items-center justify-center text-center px-4">
        <p className="text-xs text-slate-500">
          Set <code className="font-mono">VITE_GOOGLE_MAPS_API_KEY</code> to show live
          tracking.
        </p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="relative w-full h-48 bg-rose-50 rounded-2xl flex items-center justify-center text-xs text-rose-700 px-4">
        Map failed to load. Check the API key and billing.
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="relative w-full h-48 bg-slate-50 rounded-2xl flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-100">
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={mapCenter}
        zoom={14}
        onLoad={onMapLoad}
        options={{
          disableDefaultUI: true,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        }}
      >
        {rider && (
          <Marker
            position={rider}
            title="Your location"
            icon={riderMarkerIcon}
          />
        )}
        {dest && (
          <Marker
            position={dest}
            title={
              phase === "pickup"
                ? isReturn
                  ? "Pickup (customer)"
                  : "Pickup (store)"
                : isReturn
                  ? "Drop (seller)"
                  : "Drop (customer)"
            }
            icon={
              phase === "pickup"
                ? isReturn
                  ? customerMarkerIcon
                  : storeMarkerIcon
                : isReturn
                  ? storeMarkerIcon
                  : customerMarkerIcon
            }
          />
        )}
      </GoogleMap>
      <div className="absolute bottom-2 right-2 bg-white/95 backdrop-blur px-2 py-1 rounded-md text-[10px] text-slate-600 font-bold border border-slate-200 shadow-sm">
        {routeLoading ? "Updating route…" : "Tracking View"}
      </div>
      {routeData?.degraded && (
        <div className="absolute top-2 left-2 bg-amber-50/95 text-amber-900 text-[10px] px-2 py-1 rounded border border-amber-200 max-w-[85%] leading-snug">
          Route unavailable. Add{" "}
          <span className="font-mono">GOOGLE_MAPS_API_KEY</span> to the{" "}
          <strong>backend</strong> <span className="font-mono">.env</span>, enable
          Directions API + billing, then restart the API server.
        </div>
      )}
    </div>
  );
}


// Memoized export to prevent unnecessary re-renders and reduce Google Maps API costs
const DeliveryTrackingMap = memo(DeliveryTrackingMapComponent, (prevProps, nextProps) => {
  // Only re-render if these props actually change
  const destPrev = destinationForPhase(prevProps.order, prevProps.phase);
  const destNext = destinationForPhase(nextProps.order, nextProps.phase);
  
  return (
    prevProps.orderId === nextProps.orderId &&
    prevProps.phase === nextProps.phase &&
    destPrev?.lat === destNext?.lat &&
    destPrev?.lng === destNext?.lng
  );
});

DeliveryTrackingMap.displayName = 'DeliveryTrackingMap';

export default DeliveryTrackingMap;
