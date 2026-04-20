import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  GoogleMap,
  useJsApiLoader,
  Marker,
  Circle,
} from "@react-google-maps/api";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import Pagination from "@shared/components/ui/Pagination";
import {
  HiOutlineBuildingOffice2,
  HiOutlineMagnifyingGlass,
  HiOutlineArrowPath,
  HiOutlineInformationCircle,
  HiOutlineExclamationTriangle,
  HiOutlineGlobeAlt,
  HiOutlineMap,
} from "react-icons/hi2";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { adminApi } from "../services/adminApi";

const MAP_LIBRARIES = ["geometry"];
const DEFAULT_CENTER = { lat: 20.5937, lng: 78.9629 };
const PAGE_SIZE = 25;
const TARGET_VIEW_RADIUS_KM = 25;

const LIFECYCLE_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active sellers" },
  { value: "pending", label: "Pending approval" },
  { value: "rejected", label: "Rejected" },
  { value: "inactive", label: "Inactive" },
];

const SORT_OPTIONS = [
  { value: "orders_desc", label: "Most active orders" },
  { value: "radius_desc", label: "Largest radius" },
  { value: "name_asc", label: "Store name A-Z" },
  { value: "city_asc", label: "City A-Z" },
  { value: "recent", label: "Newest first" },
];

const mapContainerStyle = {
  width: "100%",
  height: "100%",
  minHeight: "680px",
};

const lifecycleClassMap = {
  active: "bg-brand-50 text-brand-700 border-brand-100",
  pending: "bg-amber-50 text-amber-700 border-amber-100",
  rejected: "bg-rose-50 text-rose-700 border-rose-100",
  inactive: "bg-slate-100 text-slate-700 border-slate-200",
  verified: "bg-brand-50 text-brand-700 border-brand-100",
  unverified: "bg-slate-100 text-slate-700 border-slate-200",
};

const SELLER_CIRCLE_PALETTE = [
  "#2563eb",
  "var(--primary)",
  "#ea580c",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#ca8a04",
  "#db2777",
  "#4f46e5",
  "#059669",
  "#b91c1c",
  "#9333ea",
];

function hashString(value = "") {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getSellerColor(sellerId = "") {
  return SELLER_CIRCLE_PALETTE[
    hashString(String(sellerId)) % SELLER_CIRCLE_PALETTE.length
  ];
}

function getBoundsForRadius(center, radiusKm = 10) {
  if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) {
    return null;
  }

  const latDelta = radiusKm / 111;
  const cosLat = Math.cos((center.lat * Math.PI) / 180);
  const safeCosLat = Math.max(Math.abs(cosLat), 0.1);
  const lngDelta = radiusKm / (111 * safeCosLat);

  return {
    north: center.lat + latDelta,
    south: center.lat - latDelta,
    east: center.lng + lngDelta,
    west: center.lng - lngDelta,
  };
}

const ActiveSellerMap = ({
  googleMapApiKey,
  mapMeta,
  mapItems,
  selectedSeller,
  setSelectedSellerId,
  getCircleOptions,
}) => {
  const mapRef = useRef(null);
  const { isLoaded: mapLoaded, loadError: mapLoadError } = useJsApiLoader({
    id: "admin-seller-locations-map",
    googleMapsApiKey: googleMapApiKey,
    libraries: MAP_LIBRARIES,
  });

  useEffect(() => {
    if (!mapLoaded || !mapRef.current || !window.google) return;

    if (selectedSeller?.hasValidLocation && selectedSeller?.location) {
      const focusBounds = getBoundsForRadius(
        {
          lat: selectedSeller.location.lat,
          lng: selectedSeller.location.lng,
        },
        TARGET_VIEW_RADIUS_KM,
      );

      if (focusBounds) {
        const bounds = new window.google.maps.LatLngBounds(
          { lat: focusBounds.south, lng: focusBounds.west },
          { lat: focusBounds.north, lng: focusBounds.east },
        );
        mapRef.current.fitBounds(bounds, 40);
      } else {
        mapRef.current.panTo({
          lat: selectedSeller.location.lat,
          lng: selectedSeller.location.lng,
        });
        mapRef.current.setZoom(12);
      }
      return;
    }

    if (mapMeta?.bounds) {
      const bounds = new window.google.maps.LatLngBounds(
        { lat: mapMeta.bounds.south, lng: mapMeta.bounds.west },
        { lat: mapMeta.bounds.north, lng: mapMeta.bounds.east },
      );
      mapRef.current.fitBounds(bounds, 60);
      window.google.maps.event.addListenerOnce(mapRef.current, "idle", () => {
        const currentZoom = mapRef.current?.getZoom?.();
        if (typeof currentZoom === "number" && currentZoom > 11) {
          mapRef.current.setZoom(11);
        }
      });
      return;
    }

    const center = mapMeta?.center || DEFAULT_CENTER;
    mapRef.current.panTo(center);
    mapRef.current.setZoom(11);
  }, [mapLoaded, mapMeta, mapItems.length, selectedSeller]);

  if (!googleMapApiKey || mapLoadError) {
    return (
      <div className="absolute inset-0 z-20 bg-slate-950/80 text-white flex items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-3">
          <HiOutlineExclamationTriangle className="h-9 w-9 mx-auto text-amber-300" />
          <p className="text-lg font-black">Google Maps is not available</p>
          <p className="text-sm text-slate-200">
            Set `VITE_GOOGLE_MAPS_API_KEY` with Maps JavaScript API enabled to
            render live coverage.
          </p>
        </div>
      </div>
    );
  }

  if (!mapLoaded) {
    return (
      <div className="h-full min-h-[680px] flex items-center justify-center text-slate-500 font-bold">
        Loading map...
      </div>
    );
  }

  return (
    <GoogleMap
      mapContainerStyle={mapContainerStyle}
      center={mapMeta.center || DEFAULT_CENTER}
      zoom={5}
      onLoad={(map) => {
        mapRef.current = map;
      }}
      options={{
        disableDefaultUI: true,
        zoomControl: true,
        streetViewControl: false,
        fullscreenControl: false,
        mapTypeControl: false,
        minZoom: 3,
        maxZoom: 14,
      }}>
      {mapItems.map((seller) => {
        if (!seller.hasValidLocation || !seller.location) return null;
        return (
          <React.Fragment key={seller.id}>
            <Circle
              center={{
                lat: seller.location.lat,
                lng: seller.location.lng,
              }}
              radius={Number(seller.serviceRadiusMeters || 0)}
              options={getCircleOptions(seller)}
            />
            <Marker
              position={{
                lat: seller.location.lat,
                lng: seller.location.lng,
              }}
              onClick={() => setSelectedSellerId(seller.id)}
              title={seller.shopName}
            />
          </React.Fragment>
        );
      })}
    </GoogleMap>
  );
};

const SellerLocations = () => {
  const requestSeq = useRef(0);

  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [lifecycle, setLifecycle] = useState("all");
  const [category, setCategory] = useState("all");
  const [city, setCity] = useState("all");
  const [sort, setSort] = useState("orders_desc");
  const [mapView, setMapView] = useState("coverage");
  const [page, setPage] = useState(1);
  const [selectedSellerId, setSelectedSellerId] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [mapUnlocked, setMapUnlocked] = useState(false);

  const [items, setItems] = useState([]);
  const [mapItems, setMapItems] = useState([]);
  const [stats, setStats] = useState({
    totalSellers: 0,
    mappedSellers: 0,
    unmappedSellers: 0,
    citiesCovered: 0,
    totalActiveOrders: 0,
    averageRadiusKm: 0,
    maxRadiusKm: 0,
  });
  const [filtersMeta, setFiltersMeta] = useState({
    categories: [],
    cities: [],
  });
  const [mapMeta, setMapMeta] = useState({
    center: DEFAULT_CENTER,
    bounds: null,
  });
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const googleMapApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setPage(1);
  }, [lifecycle, category, city, sort]);

  useEffect(() => {
    const currentSeq = ++requestSeq.current;
    const loadData = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await adminApi.getSellerLocations({
          q: debouncedSearch || undefined,
          lifecycle,
          category: category !== "all" ? category : undefined,
          city: city !== "all" ? city : undefined,
          sort,
          page,
          limit: PAGE_SIZE,
          mapLimit: mapUnlocked ? 300 : 0,
        });

        if (currentSeq !== requestSeq.current) return;

        const payload = response.data?.result || {};
        const listItems = Array.isArray(payload.items) ? payload.items : [];
        const fullMapItems = Array.isArray(payload.mapItems)
          ? payload.mapItems
          : [];

        setItems(listItems);
        setMapItems(fullMapItems);
        setStats({
          totalSellers: Number(payload.stats?.totalSellers || 0),
          mappedSellers: Number(payload.stats?.mappedSellers || 0),
          unmappedSellers: Number(payload.stats?.unmappedSellers || 0),
          citiesCovered: Number(payload.stats?.citiesCovered || 0),
          totalActiveOrders: Number(payload.stats?.totalActiveOrders || 0),
          averageRadiusKm: Number(payload.stats?.averageRadiusKm || 0),
          maxRadiusKm: Number(payload.stats?.maxRadiusKm || 0),
        });
        setFiltersMeta({
          categories: Array.isArray(payload.filters?.categories)
            ? payload.filters.categories
            : [],
          cities: Array.isArray(payload.filters?.cities)
            ? payload.filters.cities
            : [],
        });
        setMapMeta({
          center: payload.map?.center || DEFAULT_CENTER,
          bounds: payload.map?.bounds || null,
        });
        setTotal(Number(payload.total || listItems.length));
        setTotalPages(Number(payload.totalPages || 1));

        setSelectedSellerId((previous) => {
          if (!listItems.length) return null;
          if (!previous) return listItems[0].id;
          const stillExists = listItems.some(
            (seller) => seller.id === previous,
          );
          return stillExists ? previous : listItems[0].id;
        });
      } catch (err) {
        if (currentSeq !== requestSeq.current) return;
        console.error("Failed to load seller locations", err);
        const message =
          err.response?.data?.message || "Failed to load seller locations.";
        setError(message);
        toast.error(message);
      } finally {
        if (currentSeq === requestSeq.current) {
          setLoading(false);
        }
      }
    };

    loadData();
  }, [
    debouncedSearch,
    lifecycle,
    category,
    city,
    sort,
    page,
    refreshTick,
    mapUnlocked,
  ]);

  const selectedSeller = useMemo(
    () =>
      mapItems.find((seller) => seller.id === selectedSellerId) ||
      items.find((seller) => seller.id === selectedSellerId) ||
      null,
    [mapItems, items, selectedSellerId],
  );

  const mapRowClass = (seller) =>
    cn(
      "w-full text-left rounded-xl px-3 py-3 transition-all border",
      selectedSellerId === seller.id
        ? "bg-slate-900 text-white border-slate-900 shadow-lg"
        : "bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50",
    );

  const getCircleOptions = (seller) => {
    const selected = selectedSellerId === seller.id;
    const baseColor = getSellerColor(seller.id);
    const density = Number(seller.densityScore || 1);

    let fillOpacity = selected ? 0.22 : 0.11;
    let strokeOpacity = selected ? 0.88 : 0.5;
    let strokeWeight = selected ? 2.2 : 1.4;

    if (mapView === "density") {
      if (density >= 4) {
        fillOpacity = selected ? 0.28 : 0.16;
        strokeOpacity = selected ? 0.95 : 0.62;
        strokeWeight = selected ? 2.8 : 1.8;
      } else if (density >= 3) {
        fillOpacity = selected ? 0.25 : 0.14;
        strokeOpacity = selected ? 0.92 : 0.56;
        strokeWeight = selected ? 2.5 : 1.6;
      } else if (density >= 2) {
        fillOpacity = selected ? 0.23 : 0.12;
        strokeOpacity = selected ? 0.9 : 0.52;
      }
    }

    return {
      fillColor: baseColor,
      fillOpacity,
      strokeColor: baseColor,
      strokeOpacity,
      strokeWeight,
    };
  };

  return (
    <div className="h-[calc(100vh-84px)] min-h-[820px] flex flex-col gap-5 animate-in fade-in duration-700 overflow-hidden">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h1 className="ds-h1 flex items-center gap-2">
            Seller Locations
            <Badge
              variant="primary"
              className="text-[9px] px-1.5 py-0 font-bold tracking-wider uppercase">
              Google Maps
            </Badge>
          </h1>
          <p className="ds-description mt-0.5">
            Global view of seller locations, radius coverage, and order density.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setMapView("coverage")}
              disabled={!mapUnlocked}
              className={cn(
                "px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all",
                !mapUnlocked
                  ? "text-slate-400 cursor-not-allowed"
                  : mapView === "coverage"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700",
              )}>
              COVERAGE
            </button>
            <button
              onClick={() => setMapView("density")}
              disabled={!mapUnlocked}
              className={cn(
                "px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all",
                !mapUnlocked
                  ? "text-slate-400 cursor-not-allowed"
                  : mapView === "density"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700",
              )}>
              DENSITY
            </button>
          </div>

          {mapUnlocked && (
            <button
              onClick={() => setMapUnlocked(false)}
              className="px-3 py-2.5 bg-white ring-1 ring-slate-200 rounded-xl shadow-sm text-[11px] font-bold text-slate-600 hover:text-slate-900 transition-all"
              title="Lock map to save API cost">
              Lock Map
            </button>
          )}

          <button
            onClick={() => setRefreshTick((value) => value + 1)}
            className="p-2.5 bg-white ring-1 ring-slate-200 rounded-xl shadow-sm text-slate-500 hover:text-primary transition-all"
            title="Refresh">
            <HiOutlineArrowPath
              className={cn("h-5 w-5", loading && "animate-spin")}
            />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
        <Card className="border-none ring-1 ring-slate-100 p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Sellers
          </p>
          <p className="text-2xl font-black text-slate-900 mt-1">
            {stats.totalSellers.toLocaleString("en-IN")}
          </p>
        </Card>
        <Card className="border-none ring-1 ring-slate-100 p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Mapped
          </p>
          <p className="text-2xl font-black text-brand-600 mt-1">
            {stats.mappedSellers.toLocaleString("en-IN")}
          </p>
        </Card>
        <Card className="border-none ring-1 ring-slate-100 p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Avg Radius
          </p>
          <p className="text-2xl font-black text-slate-900 mt-1">
            {stats.averageRadiusKm} km
          </p>
        </Card>
        <Card className="border-none ring-1 ring-slate-100 p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Active Orders
          </p>
          <p className="text-2xl font-black text-slate-900 mt-1">
            {stats.totalActiveOrders.toLocaleString("en-IN")}
          </p>
        </Card>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-5">
        <Card className="border-none shadow-xl ring-1 ring-slate-100 rounded-2xl overflow-hidden flex flex-col min-h-0">
          <div className="p-4 border-b border-slate-100 space-y-3">
            <div className="relative">
              <HiOutlineMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by store, owner, city..."
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 text-xs font-semibold outline-none ring-1 ring-transparent focus:ring-primary/20"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <select
                value={lifecycle}
                onChange={(event) => setLifecycle(event.target.value)}
                className="px-3 py-2 rounded-xl bg-white ring-1 ring-slate-200 text-[11px] font-bold text-slate-700 outline-none">
                {LIFECYCLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value)}
                className="px-3 py-2 rounded-xl bg-white ring-1 ring-slate-200 text-[11px] font-bold text-slate-700 outline-none">
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="px-3 py-2 rounded-xl bg-white ring-1 ring-slate-200 text-[11px] font-bold text-slate-700 outline-none">
                <option value="all">All categories</option>
                {filtersMeta.categories.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <select
                value={city}
                onChange={(event) => setCity(event.target.value)}
                className="px-3 py-2 rounded-xl bg-white ring-1 ring-slate-200 text-[11px] font-bold text-slate-700 outline-none">
                <option value="all">All cities</option>
                {filtersMeta.cities.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
            {loading ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-sm font-bold">
                Loading seller nodes...
              </div>
            ) : error ? (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
                <HiOutlineExclamationTriangle className="h-8 w-8 text-rose-400" />
                <p className="text-sm font-bold text-slate-600">{error}</p>
              </div>
            ) : items.length ? (
                items.map((seller) => {
                const sellerColor = getSellerColor(seller.id);
                return (
                  <button
                    key={seller.id}
                    onClick={() => setSelectedSellerId(seller.id)}
                    className={mapRowClass(seller)}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "h-10 w-10 rounded-xl flex items-center justify-center shrink-0 border-2",
                          selectedSellerId === seller.id
                            ? "border-white/20 bg-white/10"
                            : "border-slate-50"
                        )}
                        style={selectedSellerId !== seller.id ? { backgroundColor: `${sellerColor}15`, color: sellerColor, borderColor: `${sellerColor}30` } : {}}
                      >
                        <HiOutlineBuildingOffice2 className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-black truncate flex items-center gap-2">
                          <span 
                            className="h-2 w-2 rounded-full shrink-0 shadow-sm"
                            style={{ backgroundColor: sellerColor }}
                          />
                          {seller.shopName}
                        </p>
                      <p
                        className={cn(
                          "text-[10px] mt-1 truncate",
                          selectedSellerId === seller.id
                            ? "text-slate-200"
                            : "text-slate-500",
                        )}>
                        {seller.ownerName || "Owner not available"}
                      </p>
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <span
                          className={cn(
                            "text-[9px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wide",
                            selectedSellerId === seller.id
                              ? "bg-white/10 border-white/20 text-white"
                              : lifecycleClassMap[seller.lifecycle] ||
                                  lifecycleClassMap.unverified,
                          )}>
                          {seller.lifecycle}
                        </span>
                        <span
                          className={cn(
                            "text-[9px] font-bold",
                            selectedSellerId === seller.id
                              ? "text-slate-100"
                              : "text-slate-500",
                          )}>
                          {seller.serviceRadiusKm}km
                        </span>
                        <span
                          className={cn(
                            "text-[9px] font-bold",
                            selectedSellerId === seller.id
                              ? "text-slate-100"
                              : "text-slate-500",
                          )}>
                          {seller.activeOrders} active orders
                        </span>
                        {!seller.hasValidLocation && (
                          <span
                            className={cn(
                              "text-[9px] font-bold px-2 py-0.5 rounded-full border",
                              selectedSellerId === seller.id
                                ? "bg-white/10 border-white/20 text-white"
                                : "bg-amber-50 text-amber-700 border-amber-100",
                            )}>
                            No map pin
                          </span>
                        )}
                      </div>
                    </div>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-4">
                <HiOutlineGlobeAlt className="h-10 w-10 text-slate-300" />
                <p className="text-sm font-bold text-slate-500">
                  No sellers matched the selected filters.
                </p>
              </div>
            )}
          </div>

          <div className="px-3 pb-3 pt-1 border-t border-slate-100">
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              onPageSizeChange={() => {}}
              loading={loading}
            />
          </div>
        </Card>

        <Card className="border-none shadow-xl ring-1 ring-slate-100 rounded-2xl overflow-hidden relative min-h-0">
          {!mapUnlocked ? (
            <div className="h-full min-h-[680px] bg-gradient-to-br from-slate-100 via-slate-50 to-white p-6 flex items-center justify-center">
              <div className="max-w-xl text-center space-y-4">
                <div className="mx-auto h-12 w-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center">
                  <HiOutlineMap className="h-6 w-6" />
                </div>
                <h3 className="text-2xl font-black text-slate-900">
                  Map Is Locked To Save API Cost
                </h3>
                <p className="text-sm font-semibold text-slate-600 leading-relaxed">
                  Google Maps loads only when needed. Click below to open the
                  live map for this session.
                </p>
                <button
                  onClick={() => setMapUnlocked(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-black hover:bg-slate-800 transition-colors">
                  <HiOutlineMap className="h-4 w-4" />
                  Open Live Map
                </button>
                <p className="text-[11px] font-semibold text-slate-500">
                  Tip: keep map closed while filtering to minimize Google Maps
                  charges.
                </p>
              </div>
            </div>
          ) : (
            <ActiveSellerMap
              googleMapApiKey={googleMapApiKey}
              mapMeta={mapMeta}
              mapItems={mapItems}
              selectedSeller={selectedSeller}
              setSelectedSellerId={setSelectedSellerId}
              getCircleOptions={getCircleOptions}
            />
          )}

          <div className="absolute bottom-5 left-5 z-20">
            <div className="bg-white/90 backdrop-blur-md px-4 py-2 rounded-xl text-[10px] font-bold text-slate-700 flex items-center gap-2 shadow-lg ring-1 ring-slate-200">
              <HiOutlineInformationCircle className="h-4 w-4 text-slate-500" />
              {mapUnlocked
                ? "Circles represent seller service radius. Density colors indicate live order load."
                : "Map is locked by default to reduce Google Maps API usage."}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default SellerLocations;

