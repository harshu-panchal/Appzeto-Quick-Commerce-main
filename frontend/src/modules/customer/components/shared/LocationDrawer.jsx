import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Search, MapPin, Plus, Home, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "../../context/LocationContext";
import { loadGoogleMaps } from "../../../../core/services/googleMapsLoader";
import { customerApi } from "../../services/customerApi";
import { getCachedGeocode, setCachedGeocode } from "@/core/utils/geocodeCache";

const LocationDrawer = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const {
    currentLocation,
    savedAddresses,
    updateLocation,
    refreshLocation,
    isFetchingLocation,
    locationError,
  } = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [placePredictions, setPlacePredictions] = useState([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const [placesError, setPlacesError] = useState("");

  const MIN_QUERY_LENGTH = 4;
  const SEARCH_DEBOUNCE_MS = 450;
  const MAX_SUGGESTIONS = 5;
  const CACHE_TTL_MS = 3 * 60 * 1000;

  const mapsReadyRef = React.useRef(false);
  const autocompleteServiceRef = React.useRef(null);
  const geocoderRef = React.useRef(null);
  const latestPlacesRequestRef = React.useRef(0);
  const autocompleteSessionTokenRef = React.useRef(null);
  const placesCacheRef = React.useRef(new Map());

  const resetAutocompleteSession = React.useCallback(() => {
    autocompleteSessionTokenRef.current = null;
  }, []);

  const getAutocompleteSessionToken = React.useCallback(() => {
    if (
      !autocompleteSessionTokenRef.current &&
      window.google?.maps?.places?.AutocompleteSessionToken
    ) {
      autocompleteSessionTokenRef.current =
        new window.google.maps.places.AutocompleteSessionToken();
    }
    return autocompleteSessionTokenRef.current;
  }, []);

  const getComponent = React.useCallback((components, types) => {
    return components?.find((c) => types.every((t) => c.types.includes(t)))
      ?.long_name;
  }, []);

  const initGooglePlaces = React.useCallback(async () => {
    if (mapsReadyRef.current) return true;

    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      setPlacesError("Google Maps API key is missing");
      return false;
    }

    try {
      await loadGoogleMaps(apiKey);
      if (!window.google?.maps?.places) {
        setPlacesError("Google Places library is unavailable");
        return false;
      }
      autocompleteServiceRef.current =
        new window.google.maps.places.AutocompleteService();
      geocoderRef.current = new window.google.maps.Geocoder();
      mapsReadyRef.current = true;
      return true;
    } catch (err) {
      setPlacesError(err?.message || "Unable to load Google search");
      return false;
    }
  }, []);

  // Close drawer when location is successfully fetched
  const prevFetching = React.useRef(isFetchingLocation);
  React.useEffect(() => {
    if (prevFetching.current && !isFetchingLocation && !locationError) {
      onClose();
    }
    prevFetching.current = isFetchingLocation;
  }, [isFetchingLocation, locationError, onClose]);

  React.useEffect(() => {
    if (isOpen) return;
    setSearchQuery("");
    setPlacePredictions([]);
    setIsSearchingPlaces(false);
    setPlacesError("");
    setIsSearchFocused(false);
    resetAutocompleteSession();
  }, [isOpen, resetAutocompleteSession]);

  // Lock body scroll when drawer is open
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      document.body.style.paddingRight =
        "var(--removed-body-scroll-bar-size, 0px)"; // Prevent layout shift if possible
    } else {
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
    };
  }, [isOpen]);

  const handleSelectCurrentLocation = (e) => {
    e.preventDefault();
    e.stopPropagation();
    refreshLocation();
    // Keep drawer open so user sees "Detecting..."
  };

  const handleSelectAddress = (address) => {
    const hasCoords =
      address?.location &&
      typeof address.location.lat === "number" &&
      typeof address.location.lng === "number" &&
      Number.isFinite(address.location.lat) &&
      Number.isFinite(address.location.lng);

    const apply = (coords) => {
      const newLoc = {
        name: address.address,
        time: "12-15 mins",
        ...(coords ? { latitude: coords.lat, longitude: coords.lng } : {}),
      };

      // Persist so checkout/nearby sellers use the same chosen address coordinates.
      updateLocation(newLoc, { persist: true, updateSavedHome: false });
      onClose();
    };

    if (hasCoords) {
      apply({ lat: address.location.lat, lng: address.location.lng });
      return;
    }

    // Older saved addresses may not have coords. Prefer backend geocoding so billing is controlled centrally.
    const addrText = address?.address || "";
    const cacheKey = `addr:${addrText}`;
    const cached = getCachedGeocode(cacheKey);
    if (cached?.location?.lat && cached?.location?.lng) {
      apply(cached.location);
      return;
    }

    customerApi
      .geocodeAddress(addrText)
      .then((resp) => {
        const loc = resp.data?.result?.location;
        if (loc && typeof loc.lat === "number" && typeof loc.lng === "number") {
          setCachedGeocode(cacheKey, { location: { lat: loc.lat, lng: loc.lng } });
          apply({ lat: loc.lat, lng: loc.lng });
          return;
        }
        apply(null);
      })
      .catch(() => apply(null));
  };

  const handleAddAddress = () => {
    onClose();
    navigate("/addresses?add=1");
  };

  const handleSelectPlace = React.useCallback(
    (prediction) => {
      const geocoder = geocoderRef.current;
      if (!geocoder || !prediction?.place_id) return;

      geocoder.geocode({ placeId: prediction.place_id }, (results, status) => {
        if (status !== "OK" || !Array.isArray(results) || !results[0]) {
          setPlacesError("Could not resolve selected location");
          return;
        }

        const result = results[0];
        const geometry = result.geometry?.location;
        const components = result.address_components || [];

        if (!geometry) {
          setPlacesError("Location coordinates not available");
          return;
        }

        const city = getComponent(components, ["locality"]);
        const state = getComponent(components, ["administrative_area_level_1"]);
        const pincode = getComponent(components, ["postal_code"]);

        updateLocation(
          {
            name: result.formatted_address || prediction.description,
            time: "12-15 mins",
            city: city || currentLocation.city,
            state: state || currentLocation.state,
            pincode: pincode || currentLocation.pincode,
            latitude: geometry.lat(),
            longitude: geometry.lng(),
          },
          { persist: true, updateSavedHome: false },
        );

        setSearchQuery("");
        setPlacePredictions([]);
        setPlacesError("");
        setIsSearchFocused(false);
        resetAutocompleteSession();
        onClose();
      });
    },
    [
      currentLocation.city,
      currentLocation.pincode,
      currentLocation.state,
      getComponent,
      onClose,
      resetAutocompleteSession,
      updateLocation,
    ],
  );

  React.useEffect(() => {
    if (!isOpen) return;
    if (!isSearchFocused) return;

    const query = searchQuery.trim();
    if (query.length < MIN_QUERY_LENGTH) {
      latestPlacesRequestRef.current += 1;
      setPlacePredictions([]);
      setIsSearchingPlaces(false);
      setPlacesError("");
      return;
    }
    const cacheKey = query.toLowerCase();
    const cached = placesCacheRef.current.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      setPlacePredictions(cached.predictions);
      setIsSearchingPlaces(false);
      setPlacesError("");
      return;
    }

    const timer = setTimeout(async () => {
      const ready = await initGooglePlaces();
      if (!ready || !autocompleteServiceRef.current) return;

      const requestId = latestPlacesRequestRef.current + 1;
      latestPlacesRequestRef.current = requestId;
      const querySnapshot = query;

      setIsSearchingPlaces(true);
      setPlacesError("");

      const request = {
        input: query,
        types: ["geocode"],
        componentRestrictions: { country: "in" },
        sessionToken: getAutocompleteSessionToken(),
      };

      const lat = Number(currentLocation?.latitude);
      const lng = Number(currentLocation?.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        request.location = new window.google.maps.LatLng(lat, lng);
        request.radius = 30000;
      }

      autocompleteServiceRef.current.getPlacePredictions(
        request,
        (predictions, status) => {
          // Ignore stale responses from older keystrokes.
          if (
            requestId !== latestPlacesRequestRef.current ||
            querySnapshot !== searchQuery.trim()
          ) {
            return;
          }

          setIsSearchingPlaces(false);
          if (status === window.google.maps.places.PlacesServiceStatus.OK) {
            const trimmedPredictions = Array.isArray(predictions)
              ? predictions.slice(0, MAX_SUGGESTIONS)
              : [];
            setPlacePredictions(trimmedPredictions);
            placesCacheRef.current.set(cacheKey, {
              predictions: trimmedPredictions,
              expiresAt: Date.now() + CACHE_TTL_MS,
            });
            return;
          }
          if (
            status === window.google.maps.places.PlacesServiceStatus.ZERO_RESULTS
          ) {
            setPlacePredictions([]);
            return;
          }
          setPlacePredictions([]);
          setPlacesError("Google search is temporarily unavailable");
        },
      );
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [
    CACHE_TTL_MS,
    MAX_SUGGESTIONS,
    MIN_QUERY_LENGTH,
    SEARCH_DEBOUNCE_MS,
    currentLocation?.latitude,
    currentLocation?.longitude,
    getAutocompleteSessionToken,
    initGooglePlaces,
    isSearchFocused,
    isOpen,
    searchQuery,
  ]);

  // Saved addresses should remain static and not be part of Google search.
  const visibleSavedAddresses = savedAddresses;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[600]"
          />

          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            data-lenis-prevent
            style={{ overscrollBehavior: "contain" }}
            className="fixed bottom-0 left-0 right-0 bg-[#F3F4F6] rounded-t-[32px] z-[610] max-h-[90vh] overflow-y-auto outline-none shadow-2xl pb-8">
            {/* Header */}
            <div className="sticky top-0 bg-[#F3F4F6] px-6 pt-6 pb-4 flex flex-col gap-4 z-20">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-extrabold text-[#1A1A1A]">
                  Select delivery location
                </h2>
                <button
                  onClick={onClose}
                  className="h-10 w-10 bg-black/5 hover:bg-black/10 rounded-full flex items-center justify-center transition-colors">
                  <X size={20} className="text-[#1A1A1A]" />
                </button>
              </div>

              {/* Search Bar */}
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2">
                  <Search
                    size={20}
                    className="text-[#1A1A1A]/40 group-focus-within:text-primary transition-colors"
                  />
                </div>
                <input
                  type="text"
                  placeholder="Search for area, street name.."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={async () => {
                    setIsSearchFocused(true);
                    await initGooglePlaces();
                  }}
                  onBlur={() => {
                    window.setTimeout(() => setIsSearchFocused(false), 120);
                  }}
                  className="w-full bg-white border-none rounded-2xl py-4 pl-12 pr-4 text-sm font-semibold placeholder:text-[#1A1A1A]/40 shadow-sm focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                />
              </div>
              <p className="text-[11px] font-semibold text-slate-400 px-1">
                Type at least 4 characters
              </p>
            </div>

            {/* Options List */}
            <div className="px-4 flex flex-col gap-3">
              {searchQuery.trim().length >= MIN_QUERY_LENGTH && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                  {isSearchingPlaces && placePredictions.length === 0 && (
                    <div className="px-4 py-3 text-sm font-semibold text-slate-500">
                      Searching with Google...
                    </div>
                  )}

                  {placePredictions.map((prediction) => (
                    <button
                      key={prediction.place_id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelectPlace(prediction)}
                      className="w-full px-4 py-3 text-left hover:bg-slate-50 border-b last:border-b-0 border-slate-100">
                      <div className="flex items-start gap-3">
                        <MapPin
                          size={16}
                          className="text-primary mt-0.5 flex-shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-[13px] font-bold text-slate-800 truncate">
                            {prediction.structured_formatting?.main_text ||
                              prediction.description}
                          </p>
                          <p className="text-xs text-slate-500 truncate">
                            {prediction.structured_formatting?.secondary_text ||
                              prediction.description}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}

                  {!isSearchingPlaces &&
                    placePredictions.length === 0 &&
                    !placesError && (
                      <div className="px-4 py-3 text-sm font-semibold text-slate-500">
                        No locations found
                      </div>
                    )}

                  {placesError && (
                    <div className="px-4 py-3 text-sm font-semibold text-amber-700 bg-amber-50">
                      {placesError}
                    </div>
                  )}
                </div>
              )}

              {/* Current Location - single onClick to avoid duplicate API calls (was 2x from onPointerDown + onClick) */}
              <button
                type="button"
                data-lenis-prevent
                data-lenis-prevent-touch
                onClick={handleSelectCurrentLocation}
                className="flex items-center gap-4 bg-white p-3 rounded-2xl hover:bg-slate-50 transition-colors group text-left shadow-sm w-full">
                <div className="h-10 w-10 flex items-center justify-center text-primary">
                  <MapPin
                    size={24}
                    className="group-hover:scale-110 transition-transform"
                  />
                </div>
                <div className="flex-1 flex items-center gap-2 min-w-0">
                  <h3 className="font-bold text-primary text-[14px] whitespace-nowrap">
                    {isFetchingLocation
                      ? "Detecting..."
                      : "Use current location"}
                  </h3>
                  <p className="text-[12px] text-slate-400 font-medium truncate opacity-60">
                    ({currentLocation.name})
                  </p>
                </div>
                <ChevronRight size={16} className="text-slate-300 flex-shrink-0" />
              </button>

              {/* Add Address */}
              <button
                onClick={handleAddAddress}
                className="flex items-center gap-4 bg-white p-3 rounded-2xl hover:bg-slate-50 transition-colors group text-left shadow-sm">
                <div className="h-10 w-10 flex items-center justify-center text-primary">
                  <Plus
                    size={24}
                    className="group-hover:rotate-90 transition-transform"
                  />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-primary text-[15px]">
                    Add new address
                  </h3>
                </div>
                <ChevronRight size={20} className="text-slate-300" />
              </button>

              {/* Saved Addresses Section */}
              <div className="mt-4 px-2">
                <h4 className="text-[13px] font-bold text-slate-500 uppercase tracking-wider mb-4">
                  Your saved addresses
                </h4>

                <div className="flex flex-col gap-4">
                  {visibleSavedAddresses.map((addr) => (
                    <div
                      key={addr.id}
                      onClick={() => handleSelectAddress(addr)}
                      className="bg-white p-3 rounded-3xl shadow-sm border border-slate-100 relative overflow-hidden group cursor-pointer hover:bg-slate-50 transition-colors">
                      <div className="flex items-start gap-4">
                        <div className="h-12 w-12 bg-slate-50 rounded-xl flex items-center justify-center text-yellow-500 flex-shrink-0">
                          {addr.label === "Home" ? (
                            <Home
                              size={26}
                              fill="currentColor"
                              className="opacity-80"
                            />
                          ) : (
                            <MapPin
                              size={26}
                              fill="currentColor"
                              className="opacity-80"
                            />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-bold text-[#1A1A1A] text-lg">
                              {addr.label}
                            </h3>
                            {(addr.address === currentLocation.name ||
                              addr.isCurrent) && (
                              <span className="text-[10px] bg-teal-50 text-teal-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-tight border border-teal-100">
                                You are here
                              </span>
                            )}
                          </div>
                          <p className="text-[13px] text-slate-500 font-medium leading-relaxed mb-3">
                            {addr.address}
                          </p>
                          <p className="text-[12px] text-slate-400 font-bold">
                            Phone number: {addr.phone}
                          </p>
                        </div>
                      </div>

                      {/* Selection Glow */}
                      {(addr.address === currentLocation.name ||
                        addr.isCurrent) && (
                        <div className="absolute top-0 right-0 h-1 w-24 bg-gradient-to-l from-primary to-transparent opacity-50" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default LocationDrawer;

