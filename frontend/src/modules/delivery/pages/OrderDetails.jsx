import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Phone,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  Navigation,
  Package,
  CheckCircle,
  Store,
  User,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Button from "@/shared/components/ui/Button";
import Card from "@/shared/components/ui/Card";
import { toast } from "sonner";
import { deliveryApi } from "../services/deliveryApi";
import { Loader2 } from "lucide-react";
import DeliveryTrackingMap from "../components/DeliveryTrackingMap";
import DeliverySlideButton from "../components/DeliverySlideButton";
import OtpInput from "../components/OtpInput";
import {
  getCachedDeliveryPartnerLocation,
  getCurrentPositionWithCache,
} from "../utils/deliveryLastLocation";

const getPublicStatusStage = (internalStep) => {
  if (internalStep >= 4) return 3;
  if (internalStep >= 3) return 2;
  return 1;
};

const PUBLIC_STATUS_STEPS = [
  { id: 1, label: "Confirmed" },
  { id: 2, label: "Out for Delivery" },
  { id: 3, label: "Delivered" },
];

const getPersistedRiderStep = (order) => {
  if (!order) return 1;

  const workflowStatus = String(order.workflowStatus || "").toUpperCase();
  const legacyStatus = String(order.status || "").toLowerCase();
  const riderStep = Number(order.deliveryRiderStep) || 0;

  if (
    riderStep >= 4 ||
    workflowStatus === "DELIVERED" ||
    legacyStatus === "delivered"
  ) {
    return 4;
  }

  if (
    riderStep >= 3 ||
    workflowStatus === "OUT_FOR_DELIVERY" ||
    legacyStatus === "out_for_delivery" ||
    order.outForDeliveryAt
  ) {
    return 3;
  }

  if (
    riderStep >= 2 ||
    workflowStatus === "PICKUP_READY" ||
    legacyStatus === "packed" ||
    order.pickupReadyAt
  ) {
    return 2;
  }

  return 1;
};

const DEFAULT_CITY_SPEED_KMPH = 24;

const hasValidLatLng = (location) =>
  location &&
  typeof location.lat === "number" &&
  typeof location.lng === "number" &&
  Number.isFinite(location.lat) &&
  Number.isFinite(location.lng);

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

const OrderDetails = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1); // Internal rider flow: 1 pickup, 2 at store, 3 delivery, 4 delivered
  const [itemsExpanded, setItemsExpanded] = useState(false);
  const [isSlideComplete, setIsSlideComplete] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [routeStats, setRouteStats] = useState(null);
  const [clockTick, setClockTick] = useState(Date.now());

  useEffect(() => {
    const fetchOrderDetails = async () => {
      try {
        const response = await deliveryApi.getOrderDetails(orderId);
        const ord = response.data.result;
        setOrder(ord);

        setStep(getPersistedRiderStep(ord));
      } catch (error) {
        toast.error("Failed to fetch order details");
        navigate("/delivery/dashboard");
      } finally {
        setLoading(false);
      }
    };

    if (orderId) {
      fetchOrderDetails();
    }
  }, [orderId, navigate]);

  useEffect(() => {
    const iv = setInterval(() => setClockTick(Date.now()), 30000);
    return () => clearInterval(iv);
  }, []);

  const steps = [
    {
      id: 1,
      label: "Navigate to Store",
      action: "ARRIVED AT STORE",
      color: "bg-blue-600",
      bg: "bg-blue-50",
      text: "text-blue-600",
    },
    {
      id: 2,
      label: "At Store",
      action: "PICKED UP ORDER",
      color: "bg-orange-500",
      bg: "bg-orange-50",
      text: "text-orange-600",
    },
    {
      id: 3,
      label: "Start Delivery",
      action: "START DELIVERY",
      color: "bg-green-600",
      bg: "bg-green-50",
      text: "text-green-600",
    },
    {
      id: 4,
      label: "Delivering",
      action: "DELIVERED",
      color: "bg-green-700",
      bg: "bg-green-50",
      text: "text-green-700",
    },
  ];

  const publicStatusStage = getPublicStatusStage(step);
  const cachedRiderLocation = getCachedDeliveryPartnerLocation(30 * 60 * 1000);
  const destinationLocation = order?.address?.location;
  const summary = useMemo(() => {
    if (!order) {
      return {
        arrivalTimeText: "--",
        arrivingInText: "--",
        totalDistanceText: "—",
      };
    }

    if (publicStatusStage === 3) {
      return {
        arrivalTimeText: "Arrived",
        arrivingInText: "Delivered",
        totalDistanceText: "0 km",
      };
    }

    const routeDistanceMeters = Number(
      routeStats?.routeDistanceMeters ?? routeStats?.distanceMeters,
    );
    const routeDurationSeconds = Number(routeStats?.routeDurationSeconds);
    const riderLocation = routeStats?.rider || cachedRiderLocation;
    const targetLocation =
      step <= 2
        ? order?.seller?.location?.coordinates
          ? { lat: order.seller.location.coordinates[1], lng: order.seller.location.coordinates[0] }
          : null
        : destinationLocation;

    let minutes = null;
    if (Number.isFinite(routeDurationSeconds) && routeDurationSeconds > 0) {
      minutes = routeDurationSeconds / 60;
    } else {
      minutes =
        estimateMinutesFromDistance(routeDistanceMeters) ??
        estimateMinutesFromDistance(distanceMeters(riderLocation, targetLocation));
    }

    if (!Number.isFinite(minutes) || minutes <= 0) {
      minutes = step <= 2 ? 10 : 8;
    }

    const arrivalMs = clockTick + minutes * 60 * 1000;
    const totalDistanceMeters =
      routeDistanceMeters || distanceMeters(riderLocation, targetLocation);

    return {
      arrivalTimeText: formatArrivalTime(arrivalMs),
      arrivingInText: formatArrivingIn(minutes),
      totalDistanceText: formatDistance(totalDistanceMeters),
    };
  }, [
    cachedRiderLocation,
    clockTick,
    destinationLocation,
    order,
    publicStatusStage,
    routeStats,
    step,
  ]);

  const handleNextStep = async () => {
    const currentStep = steps[step - 1];

    try {
      // If this is a return pickup flow, drive returnStatus instead of main status
      if (order?.returnStatus && order.returnStatus !== "none") {
        let nextReturnStatus = order.returnStatus;
        if (order.returnStatus === "return_pickup_assigned") {
          nextReturnStatus = "return_in_transit";
        } else if (order.returnStatus === "return_in_transit") {
          nextReturnStatus = "returned";
        }

        const res = await deliveryApi.updateReturnStatus(order.orderId, {
          returnStatus: nextReturnStatus,
        });
        const updated = res.data.result;
        setOrder((prev) => ({ ...(prev || {}), ...updated }));
        toast.success(`${currentStep.action} Confirmed!`);

        if (nextReturnStatus === "returned") {
          navigate("/delivery/dashboard");
        }
      } else {
        const location = await new Promise((resolve, reject) => {
          getCurrentPositionWithCache(resolve, reject, {
            maxCacheAgeMs: 20 * 60 * 1000,
          });
        });

        if (step === 1) {
          const res = await deliveryApi.markArrivedAtStore(order.orderId, {
            lat: location.lat,
            lng: location.lng,
          });
          const updated = res.data.result;
          setOrder((prev) => ({ ...(prev || {}), ...updated }));
          setStep(2);
          toast.success(`${currentStep.action} Confirmed!`);
        } else if (step === 2) {
          const res = await deliveryApi.confirmPickup(order.orderId, {
            lat: location.lat,
            lng: location.lng,
          });
          const updated = res.data.result;
          setOrder((prev) => ({ ...(prev || {}), ...updated }));
          setStep(3);
          toast.success(`${currentStep.action} Confirmed!`);
        } else if (step === 3) {
          setStep(4);
          toast.success(`${currentStep.action} Confirmed!`);
        } else {
          navigate(`/delivery/confirm-delivery/${order.orderId}`);
        }

        setIsSlideComplete(false);
        setDragX(0);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (error) {
      console.error("Failed to update return status", error);
      toast.error("Failed to update status");
    }
  };

  const handleNavigate = () => {
    // When delivering (step 3-4), use order's precise coordinates if set at checkout
    if (step >= 3) {
      const loc = order?.address?.location;
      if (
        loc &&
        typeof loc.lat === "number" &&
        typeof loc.lng === "number" &&
        Number.isFinite(loc.lat) &&
        Number.isFinite(loc.lng)
      ) {
        window.open(
          `https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}`,
          "_blank"
        );
        return;
      }
    }
    // Store (step 1-2) or fallback when no coordinates
    window.open("https://maps.google.com", "_blank");
  };

  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
  };

  const handleOtpGenerated = (data) => {
    console.log("OTP generated successfully:", data);
    setShowOtpInput(true);
    toast.success("OTP sent to customer!");
  };

  const handleOtpGenerationError = (error) => {
    console.error("Failed to generate OTP:", error);
  };

  const handleOtpValidationSuccess = (data) => {
    console.log("OTP validated successfully:", data);
    toast.success("Delivery confirmed!");
    setTimeout(() => {
      navigate("/delivery/dashboard");
    }, 1500);
  };

  const handleOtpValidationError = (error) => {
    console.error("OTP validation error:", error);
  };

  // Determine current phase for map
  const currentPhase = step <= 2 ? "pickup" : "delivery";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="animate-spin text-primary" size={48} />
      </div>
    );
  }

  if (!order) return null;

  const orderShortId =
    typeof order.orderId === "string" ? order.orderId.slice(-8) : order.orderId;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white pb-28 font-sans">
      {/* Header */}
      <div className="bg-white/85 backdrop-blur-md sticky top-0 z-30 px-4 py-3 flex items-center justify-between border-b border-slate-100">
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="mr-2"
          >
            <ChevronDown className="rotate-90 text-slate-800" size={24} />
          </Button>
          <h1 className="text-base font-bold text-slate-800">Order #{orderShortId}</h1>
        </div>
        <div className="flex flex-col items-end">
          <span
            className={`text-xs font-bold px-3 py-1.5 rounded-full uppercase tracking-wide ${
              publicStatusStage === 1
                ? "bg-blue-100 text-blue-700"
                : publicStatusStage === 2
                ? "bg-amber-100 text-amber-700"
                : "bg-emerald-100 text-emerald-700"
            }`}
          >
            {publicStatusStage === 1
              ? "Confirmed"
              : publicStatusStage === 2
              ? "Out for Delivery"
              : "Delivered"}
          </span>
          {(order.payment?.method?.toLowerCase() === "cash" ||
            order.payment?.method?.toLowerCase() === "cod") &&
            step < 4 && (
              <span className="mt-1 bg-orange-600 text-white text-[10px] font-black px-2 py-0.5 rounded shadow-sm animate-pulse">
                COLLECT CASH: ₹{order.pricing?.total}
              </span>
            )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">

      {/* Map Section - Hidden when delivered */}
      {step < 4 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl overflow-hidden shadow-lg border border-slate-200/50 bg-white"
        >
          <div className="h-[340px] sm:h-[420px]">
            <DeliveryTrackingMap
              orderId={orderId}
              phase={currentPhase}
              order={order}
              onRouteStatsChange={setRouteStats}
            />
          </div>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[#FFF8E8] rounded-3xl p-4 shadow-sm border border-[#F4D98B] flex items-center justify-between gap-4"
      >
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 bg-[#F6E7BF] rounded-xl flex items-center justify-center text-[#C87400]">
              <Navigation size={20} />
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#C85D00] uppercase tracking-wider">
                Estimated Time
              </p>
              <p className="text-xl font-black text-[#8B3F00] leading-none">
                {summary.arrivalTimeText}
              </p>
            </div>
          </div>
          <div className="text-right flex flex-col items-end gap-2">
            <div>
              <p className="text-[11px] font-bold text-[#C85D00] uppercase tracking-wider">
                Arriving in
              </p>
              <p className="text-xl font-black text-[#8B3F00] leading-none">
                {summary.arrivingInText}
              </p>
            </div>
            <div className="inline-flex items-center rounded-full bg-white/80 px-3 py-1.5 text-[11px] font-bold text-[#C87400] ring-1 ring-[#F4D98B]">
              Total distance: {summary.totalDistanceText}
            </div>
          </div>
      </motion.div>

      <Card className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
        <div className="flex justify-between items-center px-2 mb-2 relative">
          <div className="absolute top-1/2 left-0 w-full h-1 bg-slate-100 -z-10 rounded-full" />
          <motion.div
            className="absolute top-1/2 left-0 h-1 bg-blue-500 -z-10 rounded-full"
            initial={{ width: "0%" }}
            animate={{
              width: `${((publicStatusStage - 1) / (PUBLIC_STATUS_STEPS.length - 1)) * 100}%`,
            }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
          />
          {PUBLIC_STATUS_STEPS.map(({ id, label }) => (
            <motion.div
              key={id}
              initial={false}
              animate={{
                scale: id === publicStatusStage ? 1.15 : 1,
                backgroundColor: id <= publicStatusStage ? "var(--primary)" : "#ffffff",
                borderColor: id <= publicStatusStage ? "var(--primary)" : "#e5e7eb",
                color: id <= publicStatusStage ? "#ffffff" : "#9ca3af",
              }}
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 z-10 shadow-sm"
              aria-label={label}
            >
              {id < publicStatusStage ? <CheckCircle size={16} /> : id}
            </motion.div>
          ))}
        </div>
        <div className="flex justify-between mt-2 text-xs text-slate-500 font-medium px-1">
          {PUBLIC_STATUS_STEPS.map(({ id, label }) => (
            <span key={id} className="text-center">
              {label}
            </span>
          ))}
        </div>
      </Card>

      <AnimatePresence mode="wait">
        {step <= 2 && (
          <motion.div
            key="pickup"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit={{ opacity: 0, height: 0 }}
          >
            <Card className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-4 border-b border-gray-100 bg-orange-50/50 flex items-center justify-between">
                <div className="flex items-center">
                  <div className="p-2 bg-white rounded-full shadow-sm mr-3">
                    <Store className="text-orange-600" size={20} />
                  </div>
                  <div>
                    <h2 className="font-bold text-gray-800">Pickup Location</h2>
                    <p className="text-xs text-orange-600 font-medium">Store Location</p>
                  </div>
                </div>
                {order.seller?.phone && (
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => (window.location.href = `tel:${order.seller.phone}`)}
                  >
                    <Phone size={18} />
                  </Button>
                )}
              </div>
              <div className="p-4">
                <h3 className="font-bold text-lg mb-1">{order.seller?.shopName || "Seller Store"}</h3>
                <p className="text-gray-500 text-sm mb-4 leading-relaxed">
                  {order.seller?.address || "Address not available"}
                </p>
                <Button onClick={handleNavigate} className="w-full" variant="outline">
                  <Navigation size={18} className="mr-2" /> Navigate to Store
                </Button>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {step >= 3 && (
          <motion.div
            key="customer"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            <Card className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-4 border-b border-gray-100 bg-blue-50/50 flex items-center justify-between">
                <div className="flex items-center">
                  <div className="p-2 bg-white rounded-full shadow-sm mr-3">
                    <User className="text-blue-600" size={20} />
                  </div>
                  <div>
                    <h2 className="font-bold text-gray-800">Customer Details</h2>
                    <div className="flex items-center space-x-2 mt-0.5">
                      <p
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                          order.payment?.method?.toLowerCase() === "cash" ||
                          order.payment?.method?.toLowerCase() === "cod"
                            ? "bg-orange-50 text-orange-700 border-orange-200"
                            : "bg-green-50 text-green-700 border-green-200"
                        }`}
                      >
                        {order.payment?.method?.toUpperCase() || "PENDING"}
                      </p>
                      <p className="text-[10px] text-gray-400 font-medium">Bill: Rs.{order.pricing?.total}</p>
                    </div>
                  </div>
                </div>
                <div className="flex space-x-2">
                  <Button variant="outline" size="icon" className="h-9 w-9">
                    <MessageSquare size={18} />
                  </Button>
                  {order.address?.phone && (
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => (window.location.href = `tel:${order.address.phone}`)}
                    >
                      <Phone size={18} />
                    </Button>
                  )}
                </div>
              </div>
              <div className="p-4">
                <h3 className="font-bold text-lg mb-1">{order.address?.name || "Customer"}</h3>
                <p className="text-gray-500 text-sm mb-1">{order.address?.address}</p>
                <p className="text-gray-500 text-sm mb-4">{order.address?.city}</p>
                <Button onClick={handleNavigate} className="w-full bg-blue-600 hover:bg-blue-700 text-white border-none">
                  <Navigation size={18} className="mr-2" /> Navigate to Customer
                </Button>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <Card className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <motion.div
          className="p-4 flex justify-between items-center cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={() => setItemsExpanded(!itemsExpanded)}
        >
          <div className="flex items-center font-bold text-gray-800">
            <div className="p-2 bg-purple-100 text-purple-600 rounded-lg mr-3">
              <Package size={20} />
            </div>
            <div>
              <span>Order Items</span>
              <span className="ml-2 text-xs font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                {order.items?.length || 0} items
              </span>
            </div>
          </div>
          <motion.div animate={{ rotate: itemsExpanded ? 180 : 0 }} transition={{ duration: 0.3 }}>
            <ChevronDown size={20} className="text-gray-400" />
          </motion.div>
        </motion.div>

        <AnimatePresence>
          {itemsExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="p-4 border-t border-gray-100 bg-gray-50/50 space-y-3">
                {order.items?.map((item, i) => (
                  <div key={i} className="flex justify-between items-center text-sm">
                    <div className="flex items-center">
                      <span className="font-bold text-gray-500 mr-3 text-xs w-6 bg-white border border-gray-200 text-center rounded py-0.5">
                        x{item.quantity}
                      </span>
                      <span className="text-gray-800 font-medium">{item.name}</span>
                    </div>
                    <span className="font-bold text-gray-600">Rs.{item.price * item.quantity}</span>
                  </div>
                ))}
                <div className="pt-3 mt-2 border-t border-gray-200 flex justify-between items-center">
                  <span className="text-gray-500 text-sm">Total Bill</span>
                  <span className="text-lg font-bold text-gray-900">Rs.{order.pricing?.total}</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      <motion.div
        className="bg-yellow-50 rounded-2xl p-4 border border-yellow-200 flex items-start shadow-sm"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <AlertTriangle className="text-yellow-600 mr-3 mt-0.5 flex-shrink-0" size={18} />
        <p className="text-sm text-yellow-800 leading-relaxed">
          <strong>Note:</strong> Handle eggs with care. Call customer if location is hard to find.
        </p>
      </motion.div>

      {step === 3 && !showOtpInput && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="p-6 rounded-3xl shadow-sm border border-slate-100">
            <div className="flex items-center mb-4 text-gray-800">
              <ShieldCheck className="mr-2 text-primary" size={24} />
              <h3 className="font-bold text-lg">Generate Delivery OTP</h3>
            </div>
            <p className="text-gray-500 text-sm mb-4">
              Slide to generate an OTP for the customer. You must be within 0-120 meters of the delivery location.
            </p>
            <DeliverySlideButton orderId={orderId} onSuccess={handleOtpGenerated} onError={handleOtpGenerationError} />
          </Card>
        </motion.div>
      )}

      {showOtpInput && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="p-6 rounded-3xl shadow-sm border border-slate-100">
            <OtpInput
              orderId={orderId}
              onSuccess={handleOtpValidationSuccess}
              onError={handleOtpValidationError}
              onCancel={() => setShowOtpInput(false)}
            />
          </Card>
        </motion.div>
      )}

      </div>

      {step <= 2 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-md shadow-[0_-4px_20px_-5px_rgba(0,0,0,0.1)]">
          <div className="max-w-2xl mx-auto p-4">
            <div className="relative h-16 bg-slate-100 rounded-full overflow-hidden select-none">
              <motion.div
                className={`absolute inset-0 flex items-center justify-center text-slate-400 font-bold text-lg pointer-events-none transition-opacity duration-300 ${
                  dragX > 50 ? "opacity-0" : "opacity-100"
                }`}
                animate={{ x: [0, 5, 0] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
              >
                Slide to {steps[step - 1].action} <ChevronRight className="ml-1" />
              </motion.div>

              <motion.div
                className={`absolute inset-y-0 left-0 ${steps[step - 1].bg} opacity-50`}
                style={{ width: dragX + 60 }}
              />

              <motion.div
                className={`absolute top-1 bottom-1 left-1 w-14 rounded-full flex items-center justify-center shadow-md cursor-grab active:cursor-grabbing z-20 ${
                  steps[step - 1].color || "bg-primary"
                }`}
                drag="x"
                dragConstraints={{ left: 0, right: 280 }}
                dragElastic={0.05}
                dragMomentum={false}
                onDrag={(event, info) => {
                  setDragX(info.point.x);
                }}
                onDragEnd={(event, info) => {
                  if (info.offset.x > 150) {
                    setIsSlideComplete(true);
                    handleNextStep();
                  } else {
                    setDragX(0);
                  }
                }}
                animate={{ x: isSlideComplete ? 280 : 0 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <ChevronRight className="text-white" size={24} />
              </motion.div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderDetails;
