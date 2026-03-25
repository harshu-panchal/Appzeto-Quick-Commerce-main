import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import InvoiceModal from "../components/order/InvoiceModal";
import HelpModal from "../components/order/HelpModal";
import LiveTrackingMap from "../components/order/LiveTrackingMap";
import DeliveryOtpDisplay from "../components/DeliveryOtpDisplay";
import OrderProgressTracker from "../components/order/OrderProgressTracker";
import {
  ChevronLeft,
  Package,
  Truck,
  CheckCircle,
  Clock,
  MapPin,
  CreditCard,
  Download,
  HelpCircle,
  Phone,
  MessageSquare,
  ArrowRight,
  User,
  Loader2,
  Store,
  Navigation2,
} from "lucide-react";
import { customerApi } from "../services/customerApi";
import { toast } from "sonner";
import { subscribeToOrderLocation, subscribeToOrderTrail, subscribeToOrderRoute } from "@/core/services/trackingClient";
import {
  getOrderSocket,
  joinOrderRoom,
  leaveOrderRoom,
  onOrderStatusUpdate,
  onCustomerOtp,
} from "@/core/services/orderSocket";
import { getLegacyStatusFromOrder } from "@/shared/utils/orderStatus";

const coordsToLatLng = (coords) => {
  if (!Array.isArray(coords) || coords.length < 2) return null;

  const [lng, lat] = coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return { lat, lng };
};

const hasValidLatLng = (location) =>
  location &&
  typeof location.lat === "number" &&
  typeof location.lng === "number" &&
  Number.isFinite(location.lat) &&
  Number.isFinite(location.lng);

const DEFAULT_CITY_SPEED_KMPH = 24;
const ROUTE_REFRESH_THRESHOLD_M = 150;
const ROUTE_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

const toRadians = (value) => (value * Math.PI) / 180;

const distanceMeters = (from, to) => {
  if (!hasValidLatLng(from) || !hasValidLatLng(to)) return null;
  const r = 6371000;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const formatArrivalTime = (arrivalMs) =>
  new Date(arrivalMs).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

const formatArrivingIn = (minutes) => {
  if (!Number.isFinite(minutes) || minutes < 0) return "Soon";
  const rounded = Math.max(1, Math.round(minutes));
  return `${rounded} min${rounded === 1 ? "" : "s"}`;
};

const formatDistance = (meters) => {
  if (!Number.isFinite(meters) || meters <= 0) return "—";
  if (meters < 1000) {
    return `${Math.max(50, Math.round(meters / 10) * 10)} m`;
  }
  return `${(meters / 1000).toFixed(meters >= 10000 ? 1 : 2)} km`;
};

const estimateMinutesFromDistance = (meters) => {
  if (!Number.isFinite(meters) || meters <= 0) return null;
  return (meters * 60) / (DEFAULT_CITY_SPEED_KMPH * 1000);
};

const getTrackingRoutePhase = (order) => {
  if (!order) return "pickup";

  const workflowStatus = String(order.workflowStatus || "").toUpperCase();
  const legacyStatus = String(order.status || "").toLowerCase();
  const riderStep = Number(order.deliveryRiderStep) || 0;

  const isDeliveryPhase =
    workflowStatus === "OUT_FOR_DELIVERY" ||
    workflowStatus === "DELIVERED" ||
    legacyStatus === "out_for_delivery" ||
    legacyStatus === "delivered" ||
    riderStep >= 3 ||
    Boolean(order.pickupConfirmedAt);

  return isDeliveryPhase ? "delivery" : "pickup";
};

const OrderDetailPage = () => {
  const { orderId } = useParams();
  const [showInvoice, setShowInvoice] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [returnDetails, setReturnDetails] = useState(null);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [requestingReturn, setRequestingReturn] = useState(false);
  const [selectedReturnItems, setSelectedReturnItems] = useState({});
  const [returnReason, setReturnReason] = useState("");
  const [returnImages, setReturnImages] = useState([]);
  const [liveLocation, setLiveLocation] = useState(null);
  const [trail, setTrail] = useState([]);
  const [routePolyline, setRoutePolyline] = useState(null);
  const [handoffOtp, setHandoffOtp] = useState(null);
  const [clockTick, setClockTick] = useState(Date.now());
  const routeRequestRef = useRef({ phase: null, startedAt: 0 });
  const routeOriginRef = useRef(null);

  // Scroll to top on load
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const fetchOrderDetails = async () => {
      try {
        const response = await customerApi.getOrderDetails(orderId);
        const ord = response.data.result;
        setOrder(ord);

        try {
          const retRes = await customerApi.getReturnDetails(orderId);
          setReturnDetails(retRes.data.result);
        } catch {
          setReturnDetails(null);
        }
      } catch (error) {
        console.error("Failed to fetch order details:", error);
        toast.error("Failed to load order details");
      } finally {
        setLoading(false);
      }
    };

    if (orderId) {
      fetchOrderDetails();
    }
  }, [orderId]);

  useEffect(() => {
    if (!orderId) return undefined;
    const iv = setInterval(() => {
      customerApi
        .getOrderDetails(orderId)
        .then((r) => setOrder(r.data.result))
        .catch(() => {});
    }, 12000);
    return () => clearInterval(iv);
  }, [orderId]);

  useEffect(() => {
    if (!orderId) return undefined;
    const getToken = () => localStorage.getItem("auth_customer");
    getOrderSocket(getToken);
    joinOrderRoom(orderId, getToken);
    const offStatus = onOrderStatusUpdate(getToken, () => {
      customerApi
        .getOrderDetails(orderId)
        .then((r) => setOrder(r.data.result))
        .catch(() => {});
    });
    const offOtp = onCustomerOtp(getToken, (payload) => {
      if (payload?.orderId === orderId && payload?.code) {
        setHandoffOtp(payload.code);
        toast.info("Delivery OTP received — share with rider if asked.");
      }
    });
    return () => {
      offStatus();
      offOtp();
      leaveOrderRoom(orderId, getToken);
    };
  }, [orderId]);

  // Subscribe to live tracking from Firebase (if available)
  useEffect(() => {
    if (!orderId) return;

    console.log(`[OrderDetailPage] Setting up Firebase subscriptions for order ${orderId}`);
    const offLocation = subscribeToOrderLocation(orderId, (loc) => {
      console.log(`[OrderDetailPage] Location update:`, loc);
      setLiveLocation(loc);
    });
    const offTrail = subscribeToOrderTrail(orderId, (t) => {
      console.log(`[OrderDetailPage] Trail update: ${t.length} points`);
      setTrail(t);
    });
    const offRoute = subscribeToOrderRoute(orderId, (route) => {
      console.log(`[OrderDetailPage] Route update:`, route);
      setRoutePolyline(route);
    });

    return () => {
      console.log(`[OrderDetailPage] Cleaning up Firebase subscriptions for order ${orderId}`);
      offLocation && offLocation();
      offTrail && offTrail();
      offRoute && offRoute();
    };
  }, [orderId]);

  useEffect(() => {
    const iv = setInterval(() => setClockTick(Date.now()), 30000);
    return () => clearInterval(iv);
  }, []);

  const handleOpenInMaps = () => {
    const loc = order?.address?.location;
    const dest =
      loc &&
      typeof loc.lat === "number" &&
      typeof loc.lng === "number" &&
      Number.isFinite(loc.lat) &&
      Number.isFinite(loc.lng)
        ? loc
        : null;

    const rider =
      liveLocation &&
      typeof liveLocation.lat === "number" &&
      typeof liveLocation.lng === "number"
        ? liveLocation
        : null;

    if (rider && dest) {
      window.open(
        `https://www.google.com/maps/dir/?api=1&origin=${rider.lat},${rider.lng}&destination=${dest.lat},${dest.lng}`,
        "_blank",
      );
      return;
    }

    if (dest) {
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}`,
        "_blank",
      );
      return;
    }

    window.open("https://maps.google.com", "_blank");
  };

  const status = order ? getLegacyStatusFromOrder(order) : null;
  const sellerLocation = coordsToLatLng(order?.seller?.location?.coordinates);
  const routePhase = getTrackingRoutePhase(order);
  const routeMatchesPhase =
    routePhase === "pickup"
      ? routePolyline?.phase
        ? routePolyline.phase === routePhase
        : !!routePolyline?.polyline
      : routePolyline?.phase === routePhase;
  const activeRoutePolyline = routeMatchesPhase ? routePolyline : null;
  const estimatedArrival = useMemo(() => {
    if (!order) {
      return {
        arrivalTimeText: "--",
        arrivingInText: "--",
      };
    }

    if (status === "delivered") {
      return {
        arrivalTimeText: "Arrived",
        arrivingInText: "Delivered",
      };
    }

    const targetLocation =
      routePhase === "delivery" ? order?.address?.location : sellerLocation;

    let minutes = null;
    const routeDurationSeconds = Number(activeRoutePolyline?.duration);
    if (Number.isFinite(routeDurationSeconds) && routeDurationSeconds > 0) {
      minutes = routeDurationSeconds / 60;
    } else {
      const routeDistanceMeters = Number(activeRoutePolyline?.distanceMeters);
      minutes =
        estimateMinutesFromDistance(routeDistanceMeters) ??
        estimateMinutesFromDistance(distanceMeters(liveLocation, targetLocation));
    }

    if (!Number.isFinite(minutes) || minutes <= 0) {
      minutes = status === "confirmed" ? 12 : 8;
    }

    const arrivalMs = clockTick + minutes * 60 * 1000;
    const routeDistanceMeters = Number(
      activeRoutePolyline?.distanceMeters ?? activeRoutePolyline?.distance,
    );
    return {
      arrivalTimeText: formatArrivalTime(arrivalMs),
      arrivingInText: formatArrivingIn(minutes),
      totalDistanceText: formatDistance(
        routeDistanceMeters ||
          distanceMeters(liveLocation, targetLocation),
      ),
    };
  }, [
    activeRoutePolyline?.distanceMeters,
    activeRoutePolyline?.duration,
    liveLocation,
    order,
    routePhase,
    sellerLocation,
    status,
    clockTick,
  ]);

  useEffect(() => {
    if (!orderId || status === "delivered" || status === "cancelled") return;
    if (!hasValidLatLng(liveLocation)) return;

    const currentOrigin = {
      lat: liveLocation.lat,
      lng: liveLocation.lng,
    };
    const originDrift =
      routeOriginRef.current && hasValidLatLng(routeOriginRef.current)
        ? distanceMeters(routeOriginRef.current, currentOrigin)
        : null;
    const routeIsFresh =
      activeRoutePolyline?.polyline &&
      originDrift !== null &&
      originDrift < ROUTE_REFRESH_THRESHOLD_M &&
      routePhase === activeRoutePolyline?.phase;

    if (routeIsFresh) return;

    const now = Date.now();
    if (
      routeRequestRef.current.phase === routePhase &&
      now - routeRequestRef.current.startedAt < ROUTE_REFRESH_INTERVAL_MS &&
      (originDrift === null || originDrift < ROUTE_REFRESH_THRESHOLD_M)
    ) {
      return;
    }

    routeRequestRef.current = { phase: routePhase, startedAt: now };
    let ignore = false;

    customerApi
      .getOrderRoute(orderId, {
        phase: routePhase,
        originLat: liveLocation.lat,
        originLng: liveLocation.lng,
        _t: now,
      })
      .then((response) => {
        if (ignore) return;
        const nextRoute = response.data?.result;
        if (nextRoute?.polyline) {
          setRoutePolyline(nextRoute);
          routeOriginRef.current = currentOrigin;
        }
      })
      .catch(() => {});

    return () => {
      ignore = true;
    };
  }, [
    activeRoutePolyline?.polyline,
    liveLocation,
    orderId,
    routePhase,
    status,
  ]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-white">
        <Loader2 className="animate-spin text-emerald-600" size={32} />
      </div>
    );
  }

  const canRequestReturn = () => {
    if (!order) return false;
    if (getLegacyStatusFromOrder(order) !== "delivered") return false;
    if (
      returnDetails &&
      returnDetails.returnStatus &&
      returnDetails.returnStatus !== "none" &&
      returnDetails.returnStatus !== null
    ) {
      return false;
    }
    return true;
  };

  const toggleItemSelection = (index) => {
    setSelectedReturnItems((prev) => {
      const next = { ...prev };
      if (next[index]) {
        delete next[index];
      } else {
        next[index] = { quantity: order.items[index].quantity };
      }
      return next;
    });
  };

  const handleReturnSubmit = async () => {
    if (!order) return;
    if (!Object.keys(selectedReturnItems).length) {
      toast.error("Please select at least one item to return.");
      return;
    }
    if (!returnReason.trim()) {
      toast.error("Please provide a reason for return.");
      return;
    }

    const payload = {
      items: Object.entries(selectedReturnItems).map(([idx, val]) => ({
        itemIndex: Number(idx),
        quantity: val.quantity,
      })),
      reason: returnReason,
      images: returnImages,
    };

    try {
      setRequestingReturn(true);
      await customerApi.requestReturn(order.orderId, payload);
      toast.success("Return request submitted");
      setShowReturnModal(false);
      setSelectedReturnItems({});
      setReturnReason("");
      setReturnImages([]);

      const [orderRes, retRes] = await Promise.all([
        customerApi.getOrderDetails(orderId),
        customerApi.getReturnDetails(orderId),
      ]);
      setOrder(orderRes.data.result);
      setReturnDetails(retRes.data.result);
    } catch (error) {
      console.error("Failed to submit return request", error);
      toast.error(
        error.response?.data?.message || "Failed to submit return request",
      );
    } finally {
      setRequestingReturn(false);
    }
  };

  if (!order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-white">
        <Package size={64} className="text-slate-300 mb-4" />
        <h3 className="text-lg font-bold text-slate-800">Order not found</h3>
        <Link to="/orders" className="text-emerald-600 font-bold mt-4 hover:text-emerald-700">
          Back to my orders
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white pb-24 font-sans">
      {/* Minimal Header */}
      <div className="bg-white/80 backdrop-blur-md sticky top-0 z-30 px-4 py-3 flex items-center justify-between border-b border-slate-100">
        <Link
          to="/orders"
          className="p-2 -ml-2 rounded-full hover:bg-slate-100 transition-colors">
          <ChevronLeft size={24} className="text-slate-800" />
        </Link>
        <div className="flex-1 text-center">
          <h1 className="text-base font-bold text-slate-800">Order</h1>
          <p className="text-xs text-slate-500 font-medium">#{order.orderId.slice(-8)}</p>
        </div>
        <div className="w-10" />
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {/* Enhanced Map with Cleaner Design - Hide when delivered or cancelled */}
        {status !== "delivered" && status !== "cancelled" && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl overflow-hidden shadow-lg border border-slate-200/50"
          >
            <LiveTrackingMap
              status={order.workflowStatus || order.status}
              eta={estimatedArrival.arrivingInText}
              riderName={order.deliveryBoy?.name || "Delivery Partner"}
              riderLocation={liveLocation}
              sellerLocation={sellerLocation}
              destinationLocation={order.address?.location || null}
              routePhase={routePhase}
              routePolyline={activeRoutePolyline}
              onOpenInMaps={handleOpenInMaps}
            />
          </motion.div>
        )}

        {/* Order Progress Tracker - New Component */}
        <OrderProgressTracker
          order={order}
          estimatedArrivalText={estimatedArrival.arrivalTimeText}
          arrivingInText={estimatedArrival.arrivingInText}
          totalDistanceText={estimatedArrival.totalDistanceText}
        />

        {/* Proximity-based Delivery OTP Display */}
        <DeliveryOtpDisplay orderId={orderId} />

        {/* Delivery Partner Card - Redesigned */}
        {order.deliveryBoy && status !== "delivered" && status !== "cancelled" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-3xl p-5 shadow-lg text-white"
          >
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="h-14 w-14 rounded-full bg-white/20 backdrop-blur-sm overflow-hidden border-2 border-white/40 shadow-lg">
                  <img
                    src="https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=100&auto=format&fit=crop&q=60"
                    alt="Rider"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="absolute -bottom-1 -right-1 bg-white text-emerald-600 text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 shadow-md">
                  4.8 ★
                </div>
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-white/80 uppercase tracking-wider">Your Courier</p>
                <h3 className="font-bold text-white text-lg">{order.deliveryBoy?.name || "Delivery Partner"}</h3>
                <p className="text-xs text-white/90 mt-0.5">On the way to you</p>
              </div>
              <div className="flex items-center gap-2">
                <button className="h-11 w-11 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors border border-white/30">
                  <MessageSquare size={20} className="text-white" />
                </button>
                <button className="h-11 w-11 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors border border-white/30">
                  <Phone size={20} className="text-white" />
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Pickup Location Card - Redesigned */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100"
        >
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-2xl bg-orange-50 flex items-center justify-center flex-shrink-0">
              <Store size={24} className="text-orange-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-xs font-bold text-orange-600 uppercase tracking-wider">Pickup Location</p>
              </div>
              <h4 className="font-bold text-slate-900 text-base mb-1">Store Location</h4>
              <p className="text-sm text-slate-500 leading-relaxed">
                {order.address?.address || "Address not available"}
              </p>
            </div>
            <button 
              onClick={handleOpenInMaps}
              className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors flex-shrink-0"
            >
              <Navigation2 size={18} className="text-slate-700" />
            </button>
          </div>
        </motion.div>

        {/* Delivery Address Card - Redesigned */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100"
        >
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-2xl bg-blue-50 flex items-center justify-center flex-shrink-0">
              <MapPin size={24} className="text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-xs font-bold text-blue-600 uppercase tracking-wider">Delivery Address</p>
                <span className="bg-blue-50 text-blue-700 text-[10px] px-2 py-0.5 rounded-full font-bold">
                  {order.address.type}
                </span>
              </div>
              <h4 className="font-bold text-slate-900 text-base mb-1">{order.address.name}</h4>
              <p className="text-sm text-slate-500 leading-relaxed">
                {order.address.address}, {order.address.city}
              </p>
              {order.address?.location &&
                typeof order.address.location.lat === "number" &&
                typeof order.address.location.lng === "number" && (
                  <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg">
                    <CheckCircle size={14} className="text-emerald-600" />
                    Precise location confirmed
                  </p>
                )}
              <p className="text-sm text-slate-800 font-semibold mt-3 flex items-center gap-2">
                <Phone size={16} className="text-slate-400" />
                {order.address.phone}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Order Items - Compact Design */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100"
        >
          <h3 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Package size={18} className="text-slate-400" />
            Order Items
          </h3>
          <div className="space-y-3">
            {order.items.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center gap-3 p-3 rounded-2xl hover:bg-slate-50 transition-colors">
                <div className="h-14 w-14 bg-slate-50 rounded-xl overflow-hidden flex-shrink-0 border border-slate-100">
                  <img
                    src={item.image}
                    alt={item.name}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-slate-800 text-sm mb-0.5 truncate">
                    {item.name}
                  </h4>
                  <p className="text-slate-500 text-xs font-medium">
                    Qty: {item.quantity}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-bold text-slate-900">
                    ₹{item.price * item.quantity}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Bill Summary - Cleaner Design */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100"
        >
          <h3 className="text-base font-bold text-slate-800 mb-4">Bill Summary</h3>
          <div className="space-y-2.5 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Item Total</span>
              <span className="font-semibold">₹{order.pricing.subtotal}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Delivery Fee</span>
              <span
                className={
                  order.pricing.deliveryFee === 0 ? "text-emerald-600 font-bold" : "font-semibold"
                }>
                {order.pricing.deliveryFee === 0
                  ? "FREE"
                  : `₹${order.pricing.deliveryFee}`}
              </span>
            </div>
            {order.pricing.tip > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Tip</span>
                <span className="font-semibold">₹{order.pricing.tip}</span>
              </div>
            )}
            <div className="border-t border-slate-100 mt-3 pt-3 flex justify-between items-center">
              <span className="text-base font-bold text-slate-900">
                Total Amount
              </span>
              <span className="text-xl font-black text-emerald-600">
                ₹{order.pricing.total}
              </span>
            </div>
          </div>
          
          {/* Payment Method */}
          <div className="mt-4 bg-slate-50 rounded-2xl p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 bg-white rounded-xl flex items-center justify-center shadow-sm">
                <CreditCard size={18} className="text-slate-700" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Payment
                </p>
                <p className="text-sm font-bold text-slate-900">
                  {order.payment.method === "cash"
                    ? "Cash on Delivery"
                    : order.payment.method}
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Action Buttons - Redesigned */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="grid grid-cols-2 gap-3"
        >
          <button
            onClick={() => setShowInvoice(true)}
            className="py-3.5 rounded-2xl bg-white border-2 border-slate-200 text-slate-700 font-bold hover:bg-slate-50 transition-all flex items-center justify-center gap-2 text-sm shadow-sm hover:shadow-md active:scale-[0.98]">
            <Download size={18} /> Invoice
          </button>
          <button
            onClick={() => setShowHelp(true)}
            className="py-3.5 rounded-2xl bg-white border-2 border-slate-200 text-slate-700 font-bold hover:bg-slate-50 transition-all flex items-center justify-center gap-2 text-sm shadow-sm hover:shadow-md active:scale-[0.98]">
            <HelpCircle size={18} /> Help
          </button>
        </motion.div>

        {/* Return Section - Only if applicable */}
        {(canRequestReturn() || (returnDetails && returnDetails.returnStatus && returnDetails.returnStatus !== "none")) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100"
          >
            <h3 className="text-base font-bold text-slate-800 mb-3">
              Return & Refund
            </h3>
            {returnDetails &&
            returnDetails.returnStatus &&
            returnDetails.returnStatus !== "none" ? (
              <div className="space-y-2 text-sm">
                <p className="font-semibold text-slate-700">
                  Status:{" "}
                  <span className="uppercase text-xs font-black px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800">
                    {returnDetails.returnStatus.replace(/_/g, " ")}
                  </span>
                </p>
                {returnDetails.returnStatus === "return_rejected" && (
                  <p className="text-sm text-rose-600 font-medium bg-rose-50 p-3 rounded-xl">
                    Return request rejected:{" "}
                    {returnDetails.returnRejectedReason || "No reason provided"}
                  </p>
                )}
                {returnDetails.returnRefundAmount > 0 &&
                  returnDetails.returnStatus === "refund_completed" && (
                    <p className="text-sm text-emerald-700 font-semibold bg-emerald-50 p-3 rounded-xl">
                      ₹{returnDetails.returnRefundAmount} has been added to your
                      wallet for future purchases.
                    </p>
                  )}
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                No return requested for this order.
              </p>
            )}
            {canRequestReturn() && (
              <button
                onClick={() => setShowReturnModal(true)}
                className="mt-4 w-full py-3 rounded-2xl bg-slate-900 text-white text-sm font-bold shadow-md hover:bg-slate-800 transition-all active:scale-[0.98]">
                Request Return
              </button>
            )}
          </motion.div>
        )}
      </div>

      {/* Modals */}
      <InvoiceModal
        isOpen={showInvoice}
        onClose={() => setShowInvoice(false)}
        order={order}
      />
      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />

      {/* Return Request Modal */}
      {showReturnModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => !requestingReturn && setShowReturnModal(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative z-10 w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 space-y-4"
          >
            <h3 className="text-lg font-black text-slate-900">
              Request Return
            </h3>
            <p className="text-xs text-slate-500">
              Select the items you want to return and tell us why.
            </p>
            <div className="max-h-48 overflow-y-auto space-y-3">
              {order.items.map((item, idx) => {
                const checked = !!selectedReturnItems[idx];
                return (
                  <label
                    key={idx}
                    className="flex items-center gap-3 p-3 rounded-2xl border border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleItemSelection(idx)}
                      className="h-4 w-4 rounded border-slate-300 text-slate-900"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-bold text-slate-800">
                        {item.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        Qty: {item.quantity} • ₹{item.price * item.quantity}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-600">
                Reason for return
              </label>
              <textarea
                rows={3}
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900/10"
                placeholder="Describe the issue with the product..."
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => !requestingReturn && setShowReturnModal(false)}
                className="px-4 py-2 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                disabled={requestingReturn}>
                Cancel
              </button>
              <button
                onClick={handleReturnSubmit}
                className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-70 transition-all"
                disabled={requestingReturn}>
                {requestingReturn ? "Submitting..." : "Submit Request"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default OrderDetailPage;
