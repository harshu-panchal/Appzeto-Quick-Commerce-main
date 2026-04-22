import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import BottomNav from "../components/BottomNav";
import { Toaster, toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { BellRing, MapPin } from "lucide-react";
import { deliveryApi } from "../services/deliveryApi";
import { useAuth } from "@core/context/AuthContext";
import {
  getOrderSocket,
  onDeliveryBroadcast,
  onDeliveryBroadcastWithdrawn,
} from "@/core/services/orderSocket";
import {
  loadHandledIncomingOrderIds,
  markIncomingOrderHandled,
} from "../utils/deliveryHandledOrders";
import { saveDeliveryPartnerLocation } from "../utils/deliveryLastLocation";
import orderAlertSound from "@/assets/sounds/order_alert.mp3";

/** Match server `deliverySearchExpiresAt` — progress bar + countdown stay aligned when modal opens late. */
function secondsLeftUntilDeliveryExpiry(expiresAt) {
  if (!expiresAt) return 60;
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 1000));
}

const DeliveryLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [activeOrder, setActiveOrder] = useState(null);
  const [timeLeft, setTimeLeft] = useState(60);
  const [acceptWindowTotal, setAcceptWindowTotal] = useState(60);
  const shownOrderIdsRef = useRef(new Set());
  const activeOrderRef = useRef(null);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [availableOrdersCount, setAvailableOrdersCount] = useState(0);
  const [isAcceptingOrder, setIsAcceptingOrder] = useState(false);
  const acceptInFlightRef = useRef(false);
  const didInitialAvailableFetchRef = useRef(false);
  const didInitialNotificationsPollRef = useRef(false);
  const didInitialLocationSendRef = useRef(false);
  const availableOrdersRequestRef = useRef({ inFlight: false, controller: null });
  const notificationsRequestRef = useRef({ inFlight: false, controller: null });
  const locationRequestRef = useRef({ inFlight: false, controller: null });
  const orderRingtoneRef = useRef(null);
  const ringtoneRetryTimerRef = useRef(null);
  const ringtoneUnlockHandlerRef = useRef(null);

  const getOrderRingtone = () => {
    if (!orderRingtoneRef.current) {
      const audio = new Audio(orderAlertSound);
      audio.loop = true;
      audio.preload = "auto";
      orderRingtoneRef.current = audio;
    }
    return orderRingtoneRef.current;
  };

  const startOrderRingtone = () => {
    const audio = getOrderRingtone();
    audio.loop = true;
    audio.preload = "auto";
    audio.muted = false;
    audio.volume = 1;
    audio.play().catch(() => { });

    if (!ringtoneRetryTimerRef.current) {
      ringtoneRetryTimerRef.current = setInterval(() => {
        if (!activeOrderRef.current) return;
        const currentAudio = getOrderRingtone();
        if (!currentAudio.paused) return;
        currentAudio.play().catch(() => { });
      }, 1200);
    }

    if (
      !ringtoneUnlockHandlerRef.current &&
      typeof window !== "undefined" &&
      typeof document !== "undefined"
    ) {
      const unlockPlayback = () => {
        if (!activeOrderRef.current) return;
        const currentAudio = getOrderRingtone();
        if (!currentAudio.paused) return;
        currentAudio.play().catch(() => { });
      };
      ringtoneUnlockHandlerRef.current = unlockPlayback;
      window.addEventListener("focus", unlockPlayback);
      document.addEventListener("visibilitychange", unlockPlayback);
      document.addEventListener("pointerdown", unlockPlayback);
      document.addEventListener("touchstart", unlockPlayback);
      document.addEventListener("keydown", unlockPlayback);
    }
  };

  const stopOrderRingtone = () => {
    const audio = orderRingtoneRef.current;
    if (ringtoneRetryTimerRef.current) {
      clearInterval(ringtoneRetryTimerRef.current);
      ringtoneRetryTimerRef.current = null;
    }
    if (
      ringtoneUnlockHandlerRef.current &&
      typeof window !== "undefined" &&
      typeof document !== "undefined"
    ) {
      window.removeEventListener("focus", ringtoneUnlockHandlerRef.current);
      document.removeEventListener("visibilitychange", ringtoneUnlockHandlerRef.current);
      document.removeEventListener("pointerdown", ringtoneUnlockHandlerRef.current);
      document.removeEventListener("touchstart", ringtoneUnlockHandlerRef.current);
      document.removeEventListener("keydown", ringtoneUnlockHandlerRef.current);
      ringtoneUnlockHandlerRef.current = null;
    }
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  };

  useEffect(() => {
    activeOrderRef.current = activeOrder;
  }, [activeOrder]);

  /** While working an active order, do not stack the global incoming-offer modal (fixes refresh on order details). */
  const suppressIncomingModal = useMemo(
    () =>
      /\/delivery\/(confirm-delivery|navigation)/.test(location.pathname),
    [location.pathname],
  );

  useEffect(() => {
    loadHandledIncomingOrderIds().forEach((id) => shownOrderIdsRef.current.add(id));
  }, []);

  const applyFromBroadcastPayload = useCallback((payload) => {
    if (!payload?.orderId) return false;
    if (activeOrderRef.current) return true;
    if (shownOrderIdsRef.current.has(payload.orderId)) return true;
    const p = payload.preview;
    if (
      !p ||
      typeof p.pickup !== "string" ||
      (typeof p.drop !== "string" && typeof p.drop !== "number") ||
      String(p.drop).trim() === ""
    ) {
      return false;
    }
    const exp = payload.deliverySearchExpiresAt;
    if (exp && secondsLeftUntilDeliveryExpiry(exp) <= 0) {
      return false;
    }
    shownOrderIdsRef.current = new Set(shownOrderIdsRef.current).add(payload.orderId);
    const total = typeof p.total === "number" ? p.total : Number(p.total) || 0;
    const dropLabel = typeof p.drop === "string" ? p.drop : String(p.drop);
    const earnings = typeof p.earnings === "number" ? p.earnings : Math.round(total * 0.1);
    setActiveOrder({
      id: payload.orderId,
      mongoId: undefined,
      pickup: p.pickup,
      drop: dropLabel,
      distance: "Nearby",
      estTime: "10-15 min",
      value: total,
      earnings: earnings,
      expiresAt: payload.deliverySearchExpiresAt || null,
      isReturnPickup: payload.type === "RETURN_PICKUP" || payload.isReturnPickup === true,
      items: payload.items || [],
    });
    return true;
  }, []);

  const applyAvailableOrdersList = useCallback((availableOrders) => {
    setAvailableOrdersCount(availableOrders.length);
    if (activeOrderRef.current) return;
    const newOrder = availableOrders.find((o) => {
      if (shownOrderIdsRef.current.has(o.orderId)) return false;
      if (
        o.deliverySearchExpiresAt &&
        secondsLeftUntilDeliveryExpiry(o.deliverySearchExpiresAt) <= 0
      ) {
        return false;
      }
      return true;
    });
    if (!newOrder) return;
    shownOrderIdsRef.current = new Set(shownOrderIdsRef.current).add(newOrder.orderId);
    const total = newOrder.pricing?.total || 0;
    const isReturnPickup = newOrder.isReturnPickup || false;
    const earnings = newOrder.riderEarnings || Math.round(total * 0.1);
    setActiveOrder({
      id: newOrder.orderId,
      mongoId: newOrder._id,
      pickup: isReturnPickup
        ? newOrder.address?.address || "Customer Address"
        : newOrder.seller?.shopName || "Seller",
      drop: isReturnPickup
        ? newOrder.seller?.shopName || "Seller Store"
        : newOrder.address?.address || "Customer Address",
      distance: "Nearby",
      estTime: "10-15 min",
      value: total,
      earnings: earnings,
      expiresAt: newOrder.deliverySearchExpiresAt || null,
      isReturnPickup,
      items: newOrder.items || [],
    });
  }, []);

  useEffect(() => {
    if (activeOrder) {
      startOrderRingtone();
      return undefined;
    }
    stopOrderRingtone();
    return undefined;
  }, [activeOrder]);

  useEffect(() => {
    return () => {
      stopOrderRingtone();
    };
  }, []);

  const hideBottomNavRoutes = [
    "/delivery/login",
    "/delivery/auth",
    "/delivery/splash",
    "/delivery/navigation",
    "/delivery/confirm-delivery",
    "/delivery/order-details",
  ];

  const shouldShowBottomNav = !hideBottomNavRoutes.some((route) =>
    location.pathname.includes(route),
  );

  const fetchAvailableOrders = useCallback(async () => {
    if (availableOrdersRequestRef.current.inFlight) return null;
    availableOrdersRequestRef.current.inFlight = true;

    if (availableOrdersRequestRef.current.controller) {
      availableOrdersRequestRef.current.controller.abort();
    }
    const controller = new AbortController();
    availableOrdersRequestRef.current.controller = controller;

    try {
      return await deliveryApi.getAvailableOrders({}, {
        signal: controller.signal,
        timeout: 15000,
      });
    } catch (error) {
      if (
        error?.code === "ERR_CANCELED" ||
        error?.name === "CanceledError" ||
        error?.name === "AbortError"
      ) {
        return null;
      }
      throw error;
    } finally {
      if (availableOrdersRequestRef.current.controller === controller) {
        availableOrdersRequestRef.current.controller.abort();
        availableOrdersRequestRef.current.controller = null;
        availableOrdersRequestRef.current.inFlight = false;
      }
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (notificationsRequestRef.current.inFlight) return null;
    notificationsRequestRef.current.inFlight = true;

    if (notificationsRequestRef.current.controller) {
      notificationsRequestRef.current.controller.abort();
    }
    const controller = new AbortController();
    notificationsRequestRef.current.controller = controller;

    try {
      return await deliveryApi.getNotifications({
        signal: controller.signal,
        timeout: 15000,
      });
    } catch (error) {
      if (
        error?.code === "ERR_CANCELED" ||
        error?.name === "CanceledError" ||
        error?.name === "AbortError"
      ) {
        return null;
      }
      throw error;
    } finally {
      if (notificationsRequestRef.current.controller === controller) {
        notificationsRequestRef.current.controller = null;
        notificationsRequestRef.current.inFlight = false;
      }
    }
  }, []);

  const postLocationOnce = useCallback(async (lat, lng) => {
    if (locationRequestRef.current.inFlight) return;
    locationRequestRef.current.inFlight = true;

    if (locationRequestRef.current.controller) {
      locationRequestRef.current.controller.abort();
    }
    const controller = new AbortController();
    locationRequestRef.current.controller = controller;

    try {
      saveDeliveryPartnerLocation(lat, lng);
      await deliveryApi.postLocation(
        { lat, lng },
        { signal: controller.signal, timeout: 10000 },
      );
    } catch {
      /* ignore */
    } finally {
      if (locationRequestRef.current.controller === controller) {
        locationRequestRef.current.controller = null;
        locationRequestRef.current.inFlight = false;
      }
    }
  }, []);

  // Polling for available orders
  useEffect(() => {
    const fetchOrders = async () => {
      // Only poll if online and NOT currently in an active order alert
      if (!user?.isOnline || activeOrder || suppressIncomingModal) return;

      try {
        const res = await fetchAvailableOrders();
        if (!res) return;
        if (res.data.success) {
          const availableOrders = res.data.results || res.data.result || [];
          applyAvailableOrdersList(availableOrders);
        }
      } catch (error) {
        // Silently handle aborted requests to reduce log noise
        if (error.name !== 'CanceledError' && error.name !== 'AbortError') {
          console.error("Delivery Polling Error:", error);
        }
      } finally {
        if (isFirstLoad) setIsFirstLoad(false);
      }
    };

    if (!user?.isOnline) {
      didInitialAvailableFetchRef.current = false;
      if (availableOrdersRequestRef.current.controller) {
        availableOrdersRequestRef.current.controller.abort();
      }
      return undefined;
    }

    if (didInitialAvailableFetchRef.current) return undefined;
    didInitialAvailableFetchRef.current = true;

    fetchOrders(); // single fetch when going online
    return () => {
      if (availableOrdersRequestRef.current.controller) {
        availableOrdersRequestRef.current.controller.abort();
      }
    };
  }, [
    user?.isOnline,
    activeOrder,
    applyAvailableOrdersList,
    suppressIncomingModal,
    fetchAvailableOrders,
  ]);

  // Real-time location while online — required for seller service-radius matching on new orders
  useEffect(() => {
    if (!user?.isOnline || typeof navigator === "undefined" || !navigator.geolocation) {
      didInitialLocationSendRef.current = false;
      if (locationRequestRef.current.controller) {
        locationRequestRef.current.controller.abort();
      }
      return undefined;
    }

    if (didInitialLocationSendRef.current) return undefined;
    didInitialLocationSendRef.current = true;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        postLocationOnce(pos.coords.latitude, pos.coords.longitude);
      },
      () => { },
      { enableHighAccuracy: false, maximumAge: 30000, timeout: 20000 },
    );

    return () => {
      if (locationRequestRef.current.controller) {
        locationRequestRef.current.controller.abort();
      }
    };
  }, [user?.isOnline, postLocationOnce]);

  useEffect(() => {
    if (!user?.isOnline) return undefined;
    const getToken = () => localStorage.getItem("auth_delivery");
    getOrderSocket(getToken);
    return onDeliveryBroadcast(getToken, (payload) => {
      if (activeOrderRef.current || suppressIncomingModal) return;
      const opened = applyFromBroadcastPayload(payload);
      if (opened) return;
      fetchAvailableOrders()
        .then((res) => {
          if (!res?.data?.success) return;
          const list = res.data.results || res.data.result || [];
          applyAvailableOrdersList(list);
        })
        .catch(() => { });
    });
  }, [
    user?.isOnline,
    applyAvailableOrdersList,
    applyFromBroadcastPayload,
    suppressIncomingModal,
    fetchAvailableOrders,
  ]);

  useEffect(() => {
    if (!user?.isOnline) return undefined;
    const getToken = () => localStorage.getItem("auth_delivery");
    return onDeliveryBroadcastWithdrawn(getToken, (payload) => {
      const orderId = payload?.orderId;
      if (!orderId) return;

      shownOrderIdsRef.current = new Set(shownOrderIdsRef.current).add(orderId);
      markIncomingOrderHandled(orderId);

      if (activeOrderRef.current?.id === orderId) {
        acceptInFlightRef.current = false;
        setIsAcceptingOrder(false);
        stopOrderRingtone();
        setActiveOrder(null);
        toast.info("Another delivery partner accepted this order.");
      }
    });
  }, [user?.isOnline]);

  // When a new DB notification arrives (same row as bell list), open the same popup if socket was missed
  useEffect(() => {
    if (!user?.isOnline) {
      didInitialNotificationsPollRef.current = false;
      if (notificationsRequestRef.current.controller) {
        notificationsRequestRef.current.controller.abort();
      }
      return undefined;
    }

    if (didInitialNotificationsPollRef.current) return undefined;
    didInitialNotificationsPollRef.current = true;

    const poll = async () => {
      try {
        const res = await fetchNotifications();
        if (!res?.data?.success) return;
        const result = res.data.result || res.data.data;
        const notifications = result?.notifications || [];
        if (activeOrderRef.current) return;
        for (const n of notifications) {
          const isIncomingOrderType =
            n.type === "order" || n.type === "RETURN_PICKUP_ASSIGNED";
          if (!isIncomingOrderType || n.isRead || !n.data?.orderId) continue;
          const oid = n.data.orderId;
          if (shownOrderIdsRef.current.has(oid)) continue;
          const fromStored = applyFromBroadcastPayload({
            orderId: oid,
            preview: n.data.preview,
            deliverySearchExpiresAt: n.data.deliverySearchExpiresAt,
            type: n.data.type || (n.data.preview?.type),
          });
          if (fromStored) return;
          const r2 = await fetchAvailableOrders();
          if (!r2?.data?.success) return;
          const list = r2.data.results || r2.data.result || [];
          applyAvailableOrdersList(list);
          return;
        }
      } catch {
        /* ignore */
      }
    };
    poll();
    return () => {
      if (notificationsRequestRef.current.controller) {
        notificationsRequestRef.current.controller.abort();
      }
    };
  }, [
    user?.isOnline,
    applyFromBroadcastPayload,
    applyAvailableOrdersList,
    suppressIncomingModal,
    fetchNotifications,
    fetchAvailableOrders,
  ]);

  const skipOrder = useCallback(async () => {
    const current = activeOrderRef.current;
    if (!current || acceptInFlightRef.current) return;
    try {
      console.log("Delivery Alert - Skipping order:", current.id);
      if (current.isReturnPickup) {
        await deliveryApi.rejectReturnPickup(current.id);
      } else {
        await deliveryApi.skipOrder(current.id);
      }
      shownOrderIdsRef.current = new Set(shownOrderIdsRef.current).add(current.id);
      markIncomingOrderHandled(current.id);
      stopOrderRingtone();
      setActiveOrder(null);
      toast.info("Order skipped");
    } catch (error) {
      console.error("Delivery Alert - Skip failed:", error);
      setActiveOrder(null);
    }
  }, []);

  // Countdown from server deadline (same idea as seller panel)
  useEffect(() => {
    if (!activeOrder) return undefined;
    const left = secondsLeftUntilDeliveryExpiry(activeOrder.expiresAt);
    if (left <= 0) {
      if (!acceptInFlightRef.current) {
        skipOrder();
        toast.error("Order request timed out");
      }
      return undefined;
    }
    setAcceptWindowTotal(left);
    setTimeLeft(left);
    const timer = setInterval(() => {
      const next = secondsLeftUntilDeliveryExpiry(activeOrderRef.current?.expiresAt);
      setTimeLeft(next);
      if (next <= 0) {
        clearInterval(timer);
        if (!acceptInFlightRef.current) {
          skipOrder();
          toast.error("Order request timed out");
        }
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [activeOrder, skipOrder]);

  const handleAcceptOrder = async () => {
    if (!activeOrder || acceptInFlightRef.current) return;
    if (
      activeOrder.expiresAt &&
      secondsLeftUntilDeliveryExpiry(activeOrder.expiresAt) <= 0
    ) {
      toast.error("This request has expired. Try the next one.");
      setActiveOrder(null);
      return;
    }
    acceptInFlightRef.current = true;
    setIsAcceptingOrder(true);
    try {
      console.log("Delivery Alert - Accepting order:", activeOrder.id);
      const idem =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}`;
      if (activeOrder.isReturnPickup) {
        await deliveryApi.acceptReturnPickup(activeOrder.id);
      } else {
        await deliveryApi.acceptOrder(activeOrder.id, idem);
      }
      toast.success("Order accepted!");
      const orderId = activeOrder.id;
      shownOrderIdsRef.current = new Set(shownOrderIdsRef.current).add(orderId);
      markIncomingOrderHandled(orderId);
      stopOrderRingtone();
      setActiveOrder(null);
      navigate(`/delivery/order-details/${orderId}`);
    } catch (error) {
      console.error("Delivery Alert - Accept failed:", error);
      const msg =
        error.response?.data?.message ||
        (typeof error.response?.data === "string" ? error.response.data : null);
      toast.error(msg || "Failed to accept order");
      setActiveOrder(null);
    } finally {
      acceptInFlightRef.current = false;
      setIsAcceptingOrder(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans max-w-md mx-auto relative shadow-2xl overflow-hidden border-x border-gray-100">
      {/* Full-screen order alert — portaled so it always stacks above nav/content */}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {activeOrder && (
              <div
                className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/85 backdrop-blur-sm"
                role="dialog"
                aria-modal="true"
                aria-labelledby="delivery-order-alert-title"
              >
                <motion.div
                  key={activeOrder.id}
                  initial={{ scale: 0.92, opacity: 0, y: 24 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.96, opacity: 0, y: 16 }}
                  transition={{ type: "spring", stiffness: 380, damping: 28 }}
                  className="bg-white rounded-[32px] p-6 w-full max-w-[340px] shadow-2xl border-4 border-primary/20"
                >
                  <div className="flex flex-col items-center">
                    <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center mb-4 animate-bounce">
                      <BellRing className="h-8 w-8 text-primary" />
                    </div>

                    <h2
                      id="delivery-order-alert-title"
                      className="text-xl font-black text-slate-900 mb-1"
                    >
                      {activeOrder.isReturnPickup ? "Return pickup request" : "New order request"}
                    </h2>
                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-4">
                      {activeOrder.isReturnPickup ? "Collect return item" : "Accept or reject"}
                    </p>
                    <div className="flex items-center gap-2 mb-6">
                      <span className="text-2xl font-black text-brand-600">₹{activeOrder.earnings}</span>
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider font-outfit">
                        Earnings
                      </span>
                    </div>

                    <div className="w-full space-y-4 mb-6">
                      {/* Return Items "Small Cart" */}
                      {activeOrder.isReturnPickup && activeOrder.items?.length > 0 && (
                        <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100 flex flex-col gap-2">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">
                            Return Items ({activeOrder.items.length})
                          </p>
                          <div className="flex gap-2 overflow-x-auto no-scrollbar">
                            {activeOrder.items.map((item, idx) => (
                              <div key={idx} className="flex-shrink-0 flex items-center gap-3 bg-white p-2 rounded-xl border border-slate-100 shadow-sm min-w-[140px]">
                                <div className="h-10 w-10 rounded-lg bg-slate-100 overflow-hidden flex-shrink-0">
                                  {item.image ? (
                                    <img src={item.image} alt="" className="h-full w-full object-cover" />
                                  ) : (
                                    <div className="h-full w-full flex items-center justify-center text-slate-300 font-bold text-[8px]">
                                      NO IMG
                                    </div>
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-[10px] font-bold text-slate-900 truncate mb-0.5">
                                    {item.name}
                                  </p>
                                  <p className="text-[10px] font-black text-primary">
                                    {item.quantity} Unit{item.quantity > 1 ? 's' : ''}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex items-start gap-3">
                        <div className="w-5 h-5 rounded-full bg-brand-100 flex items-center justify-center mt-1">
                          <div className="w-2 h-2 rounded-full bg-black " />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase">
                            {activeOrder.isReturnPickup ? "Customer Pickup" : "Pickup"}
                          </p>
                          <p className="text-sm font-bold text-slate-900">{activeOrder.pickup}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <MapPin className="h-5 w-5 text-rose-500 mt-1 shrink-0" />
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase">
                            {activeOrder.isReturnPickup ? "Return To Seller" : "Drop"}
                          </p>
                          <p className="text-sm font-bold text-slate-900 line-clamp-2">{activeOrder.drop}</p>
                        </div>
                      </div>
                    </div>

                    <div className="w-full h-1.5 bg-slate-100 rounded-full mb-2 overflow-hidden">
                      <motion.div
                        key={`${activeOrder.id}-${acceptWindowTotal}`}
                        initial={{ width: "100%" }}
                        animate={{ width: "0%" }}
                        transition={{
                          duration: Math.max(1, acceptWindowTotal || 60),
                          ease: "linear",
                        }}
                        className={timeLeft < 10 ? "bg-rose-500 h-full" : "bg-primary h-full"}
                      />
                    </div>
                    <p className="text-[10px] font-bold text-slate-400 mb-4 w-full text-center">
                      {timeLeft}s left to respond
                    </p>

                    <div className="grid grid-cols-2 gap-4 w-full">
                      <button
                        type="button"
                        onClick={skipOrder}
                        disabled={isAcceptingOrder}
                        className="py-4 rounded-2xl bg-slate-100 text-slate-700 font-black text-xs uppercase tracking-wider hover:bg-slate-200/80 disabled:opacity-50 disabled:pointer-events-none"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={handleAcceptOrder}
                        disabled={isAcceptingOrder}
                        className="py-4 rounded-2xl bg-primary text-primary-foreground font-black text-xs uppercase tracking-wider shadow-lg shadow-primary/30 active:scale-95 disabled:opacity-60 disabled:pointer-events-none"
                      >
                        {isAcceptingOrder ? "Accepting…" : "Accept"}
                      </button>
                    </div>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body,
        )}

      <main
        className={`h-full min-h-screen overflow-y-auto ${shouldShowBottomNav ? "pb-24" : ""} no-scrollbar`}>
        <Outlet />
      </main>

      {shouldShowBottomNav && <BottomNav />}
      <Toaster position="top-center" />
    </div>
  );
};

export default DeliveryLayout;
