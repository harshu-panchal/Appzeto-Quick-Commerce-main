import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import Sidebar from './Sidebar';
import Topbar from './Topbar';
import BottomNav from './BottomNav';
import { sellerApi } from '@/modules/seller/services/sellerApi';
import { useAuth } from "@core/context/AuthContext";
import { motion, AnimatePresence } from 'framer-motion';
import { BellRing, Check, X, Clock, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import SellerOrdersContext from '@/modules/seller/context/SellerOrdersContext';
import SellerEarningsContext, { defaultEarnings } from '@/modules/seller/context/SellerEarningsContext';
import { getOrderSocket, onSellerOrderNew, onReturnDropOtp } from '@/core/services/orderSocket';
import orderAlertSound from '@/assets/sounds/order_alert.mp3';

const POLL_INTERVAL_MS = 15000;

/** Match server `sellerPendingExpiresAt` — never reset to a full 60s when the modal opens late. */
function secondsLeftUntilSellerExpiry(order) {
    if (!order) return 0;
    const raw = order.sellerPendingExpiresAt ?? order.expiresAt;
    if (!raw) return 60;
    const ms = new Date(raw).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / 1000));
}

function isSellerAlertEligible(order) {
    if (!order?.orderId) return false;
    const ws = String(order.workflowStatus || '').toUpperCase();
    const status = String(order.status || '').toLowerCase();
    const hasExpiry = Boolean(order.sellerPendingExpiresAt ?? order.expiresAt);

    if (hasExpiry && secondsLeftUntilSellerExpiry(order) <= 0) return false;
    if (ws) return ws === 'SELLER_PENDING';

    // Backward compatibility: older payloads may not include workflowStatus.
    return status === 'pending';
}

const isEarningsRoute = (path) =>
    path.includes('earnings') || path.includes('withdrawals') || path.includes('transactions');

const DashboardLayout = ({ children, navItems, title }) => {
    const [newOrderAlert, setNewOrderAlert] = useState(null);
    const [newReturnAlert, setNewReturnAlert] = useState(null);
    const [shownOrderIds, setShownOrderIds] = useState(() => new Set());
    const [shownReturnOrderIds, setShownReturnOrderIds] = useState(() => new Set());
    const [timeLeft, setTimeLeft] = useState(0);
    /** Total seconds in this acceptance window (for progress bar), set when modal opens */
    const acceptWindowTotalRef = useRef(60);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [returnDropOtpAlert, setReturnDropOtpAlert] = useState(null); // { orderId, otp, expiresAt }
    const { user, logout, role } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();

    // Shared data for seller – single source, avoids duplicate API calls
    const [sellerOrders, setSellerOrders] = useState([]);
    const [ordersLoading, setOrdersLoading] = useState(false);
    const [sellerEarningsData, setSellerEarningsData] = useState(defaultEarnings);
    const [earningsLoading, setEarningsLoading] = useState(false);

    const shownOrderIdsRef = useRef(new Set());
    const shownReturnOrderIdsRef = useRef(new Set());
    const isFirstLoadRef = useRef(true);
    const newOrderAlertRef = useRef(null);
    const newReturnAlertRef = useRef(null);
    const fetchOrdersRef = useRef(null);
    const isOrdersFetchInFlightRef = useRef(false);
    const earningsFetchedRef = useRef(false);
    const orderRingtoneRef = useRef(null);
    const ringtoneRetryTimerRef = useRef(null);
    const ringtoneUnlockHandlerRef = useRef(null);

    const getOrderRingtone = () => {
        if (!orderRingtoneRef.current) {
            const audio = new Audio(orderAlertSound);
            audio.loop = true;
            audio.preload = 'auto';
            orderRingtoneRef.current = audio;
        }
        return orderRingtoneRef.current;
    };

    const startOrderRingtone = () => {
        const audio = getOrderRingtone();
        audio.loop = true;
        audio.preload = 'auto';
        audio.muted = false;
        audio.volume = 1;
        audio.play().catch(() => { });

        if (!ringtoneRetryTimerRef.current) {
            ringtoneRetryTimerRef.current = setInterval(() => {
                if (!newOrderAlertRef.current) return;
                const currentAudio = getOrderRingtone();
                if (!currentAudio.paused) return;
                currentAudio.play().catch(() => { });
            }, 1200);
        }

        if (!ringtoneUnlockHandlerRef.current && typeof window !== 'undefined' && typeof document !== 'undefined') {
            const unlockPlayback = () => {
                if (!newOrderAlertRef.current) return;
                const currentAudio = getOrderRingtone();
                if (!currentAudio.paused) return;
                currentAudio.play().catch(() => { });
            };
            ringtoneUnlockHandlerRef.current = unlockPlayback;
            window.addEventListener('focus', unlockPlayback);
            document.addEventListener('visibilitychange', unlockPlayback);
            document.addEventListener('pointerdown', unlockPlayback);
            document.addEventListener('touchstart', unlockPlayback);
            document.addEventListener('keydown', unlockPlayback);
        }
    };

    const stopOrderRingtone = () => {
        const audio = orderRingtoneRef.current;
        if (ringtoneRetryTimerRef.current) {
            clearInterval(ringtoneRetryTimerRef.current);
            ringtoneRetryTimerRef.current = null;
        }
        if (ringtoneUnlockHandlerRef.current && typeof window !== 'undefined' && typeof document !== 'undefined') {
            window.removeEventListener('focus', ringtoneUnlockHandlerRef.current);
            document.removeEventListener('visibilitychange', ringtoneUnlockHandlerRef.current);
            document.removeEventListener('pointerdown', ringtoneUnlockHandlerRef.current);
            document.removeEventListener('touchstart', ringtoneUnlockHandlerRef.current);
            document.removeEventListener('keydown', ringtoneUnlockHandlerRef.current);
            ringtoneUnlockHandlerRef.current = null;
        }
        if (!audio) return;
        audio.pause();
        audio.currentTime = 0;
    };

    useEffect(() => {
        shownOrderIdsRef.current = shownOrderIds;
    }, [shownOrderIds]);
    useEffect(() => {
        shownReturnOrderIdsRef.current = shownReturnOrderIds;
    }, [shownReturnOrderIds]);
    useEffect(() => {
        newOrderAlertRef.current = newOrderAlert;
    }, [newOrderAlert]);
    useEffect(() => {
        newReturnAlertRef.current = newReturnAlert;
    }, [newReturnAlert]);

    useEffect(() => {
        if (role !== 'seller') {
            setSellerOrders([]);
            setOrdersLoading(false);
            return;
        }
        setOrdersLoading(true);

        const fetchOrders = async () => {
            if (isOrdersFetchInFlightRef.current) return;
            isOrdersFetchInFlightRef.current = true;
            try {
                const res = await sellerApi.getOrders();
                if (!res?.data?.success) return;

                const payload = res.data.result || {};
                const rawOrders = Array.isArray(payload.items)
                    ? payload.items
                    : (res.data.results || []);
                const allOrders = Array.isArray(rawOrders) ? rawOrders : [];
                setSellerOrders(allOrders);

                const pendingOrders = allOrders.filter(isSellerAlertEligible);

                if (isFirstLoadRef.current) {
                    const existingIds = new Set(pendingOrders.map((o) => o.orderId).filter(Boolean));
                    shownOrderIdsRef.current = existingIds;
                    isFirstLoadRef.current = false;
                    setShownOrderIds(existingIds);
                    return;
                }

                const newOrder = pendingOrders.find((o) => !shownOrderIdsRef.current.has(o.orderId));
                if (!newOrder || newOrderAlertRef.current) return;

                setNewOrderAlert(newOrder);
                setShownOrderIds((prev) => new Set(prev).add(newOrder.orderId));
                shownOrderIdsRef.current = new Set(shownOrderIdsRef.current).add(newOrder.orderId);
                newOrderAlertRef.current = newOrder;
            } catch (error) {
                console.error("Polling Error:", error);
            } finally {
                isOrdersFetchInFlightRef.current = false;
                setOrdersLoading(false);
            }
        };

        fetchOrdersRef.current = fetchOrders;
        fetchOrders();
    }, [role]);

    // Resilient fallback when socket events are missed (tab backgrounded/suspended).
    useEffect(() => {
        if (role !== 'seller') return undefined;

        const syncOrders = () => {
            if (fetchOrdersRef.current) fetchOrdersRef.current();
        };

        const timer = setInterval(syncOrders, POLL_INTERVAL_MS);
        const onFocus = () => syncOrders();
        const onVisible = () => {
            if (document.visibilityState === 'visible') syncOrders();
        };
        const onOnline = () => syncOrders();

        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('online', onOnline);

        return () => {
            clearInterval(timer);
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('online', onOnline);
        };
    }, [role]);

    useEffect(() => {
        if (newOrderAlert) {
            startOrderRingtone();
            return undefined;
        }
        stopOrderRingtone();
        return undefined;
    }, [newOrderAlert]);

    useEffect(() => {
        return () => {
            stopOrderRingtone();
        };
    }, []);

    useEffect(() => {
        if (role === 'seller') return;
        stopOrderRingtone();
    }, [role]);

    useEffect(() => {
        if (role !== 'seller') return undefined;
        const getToken = () => localStorage.getItem('auth_seller');
        getOrderSocket(getToken);
        const unsubscribeSellerNew = onSellerOrderNew(getToken, () => {
            if (fetchOrdersRef.current) fetchOrdersRef.current();
        });

        const unsubscribeDrop = onReturnDropOtp(getToken, (payload) => {
            console.log("[DashboardLayout] Received return drop OTP:", payload);
            setReturnDropOtpAlert(payload);
            const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
            audio.play().catch(() => { });
        });

        return () => {
            unsubscribeSellerNew();
            unsubscribeDrop();
        };
    }, [role]);

    // Single earnings fetch when seller is on earnings/withdrawals/transactions – no duplicate calls
    useEffect(() => {
        if (role !== 'seller' || !isEarningsRoute(location.pathname)) {
            if (!isEarningsRoute(location.pathname)) earningsFetchedRef.current = false;
            return;
        }
        if (earningsFetchedRef.current) return;
        earningsFetchedRef.current = true;
        setEarningsLoading(true);

        sellerApi
            .getEarnings()
            .then((response) => {
                const raw = response?.data?.result ?? response?.data?.data;
                if (response?.data?.success && raw && typeof raw === 'object') {
                    setSellerEarningsData({
                        balances: raw.balances ?? {},
                        ledger: Array.isArray(raw.ledger) ? raw.ledger : [],
                        monthlyChart: Array.isArray(raw.monthlyChart) ? raw.monthlyChart : [],
                    });
                }
            })
            .catch((err) => console.error("Earnings Fetch Error:", err))
            .finally(() => setEarningsLoading(false));
    }, [role, location.pathname]);

    const refreshOrders = () => {
        if (fetchOrdersRef.current) fetchOrdersRef.current();
    };
    const refreshEarnings = () => {
        earningsFetchedRef.current = false;
        setEarningsLoading(true);
        sellerApi
            .getEarnings()
            .then((response) => {
                const raw = response?.data?.result ?? response?.data?.data;
                if (response?.data?.success && raw && typeof raw === 'object') {
                    setSellerEarningsData({
                        balances: raw.balances ?? {},
                        ledger: Array.isArray(raw.ledger) ? raw.ledger : [],
                        monthlyChart: Array.isArray(raw.monthlyChart) ? raw.monthlyChart : [],
                    });
                }
            })
            .catch((err) => console.error("Earnings Fetch Error:", err))
            .finally(() => {
                setEarningsLoading(false);
                earningsFetchedRef.current = true;
            });
    };

    useEffect(() => {
        setIsSidebarOpen(false);
    }, [location.pathname]);

    // Timer: driven by server expiry (sellerPendingExpiresAt), not a local 60s from modal open
    useEffect(() => {
        if (!newOrderAlert) return undefined;

        const left = secondsLeftUntilSellerExpiry(newOrderAlert);
        if (left <= 0) {
            setNewOrderAlert(null);
            toast.error("This order has already expired — you can no longer accept it.");
            return undefined;
        }

        acceptWindowTotalRef.current = left;
        setTimeLeft(left);

        const timer = setInterval(() => {
            const next = secondsLeftUntilSellerExpiry(newOrderAlertRef.current);
            setTimeLeft(next);
            if (next <= 0) {
                clearInterval(timer);
                setNewOrderAlert(null);
                toast.error("Order timed out!");
            }
        }, 1000);

        return () => clearInterval(timer);
    }, [newOrderAlert]);

    const handleAcceptOrder = async (orderId) => {
        try {
            await sellerApi.updateOrderStatus(orderId, { status: 'confirmed' });
            toast.success(`Order #${orderId} Accepted!`);
            stopOrderRingtone();
            setNewOrderAlert(null);
        } catch (error) {
            const msg =
                error?.response?.data?.message ||
                "Failed to accept order";
            const normalizedMsg = String(msg).toLowerCase();
            if (
                normalizedMsg.includes('not available') ||
                normalizedMsg.includes('expired')
            ) {
                stopOrderRingtone();
                setNewOrderAlert(null);
                if (fetchOrdersRef.current) fetchOrdersRef.current();
            }
            toast.error(msg);
        }
    };

    const handleDeclineOrder = async (orderId) => {
        try {
            await sellerApi.updateOrderStatus(orderId, { status: 'cancelled' });
            toast.error(`Order #${orderId} Declined`);
            stopOrderRingtone();
            setNewOrderAlert(null);
        } catch (error) {
            const msg =
                error?.response?.data?.message ||
                "Failed to update order";
            toast.error(msg);
        }
    };

    return (
        <div className="min-h-screen mesh-gradient-light relative overflow-x-hidden">
            {/* Background Blobs for depth */}
            <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px] -z-10 animate-pulse pointer-events-none"></div>
            <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-brand-500/5 rounded-full blur-[120px] -z-10 animate-pulse pointer-events-none" style={{ animationDelay: '2s' }}></div>

            <Sidebar
                items={navItems}
                title={title}
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
            />
            <div className={cn("transition-all duration-300", (role === "admin" || role === "seller") ? "pl-0 md:pl-72" : "pl-72")}>
                <Topbar onMenuClick={() => setIsSidebarOpen(true)} />
                <main className={cn("p-4 md:p-6 min-h-screen", (role === "admin" || role === "seller") ? "pt-20 md:pt-6 pb-24 md:pb-6" : "pt-20")}>
                    <div className="w-full pb-12">
                        <SellerOrdersContext.Provider
                            value={{
                                orders: role === 'seller' ? sellerOrders : [],
                                ordersLoading: role === 'seller' ? ordersLoading : false,
                                refreshOrders,
                            }}>
                            <SellerEarningsContext.Provider
                                value={{
                                    earningsData: role === 'seller' ? sellerEarningsData : defaultEarnings,
                                    earningsLoading: role === 'seller' ? earningsLoading : false,
                                    refreshEarnings,
                                }}>
                                {children}
                            </SellerEarningsContext.Provider>
                        </SellerOrdersContext.Provider>
                    </div>
                </main>
            </div>

            {/* Global Order Alert Modal */}
            <AnimatePresence>
                {newOrderAlert && (
                    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-slate-100"
                        >
                            <div className="flex flex-col items-center text-center">
                                <div className="h-20 w-20 bg-primary/10 rounded-full flex items-center justify-center mb-6 animate-bounce">
                                    <BellRing className="h-10 w-10 text-primary" />
                                </div>

                                <h2 className="text-2xl font-black text-slate-900 mb-2">New Order Received!</h2>
                                <p className="text-slate-600 font-medium mb-6">
                                    You have a new order <span className="text-primary font-bold">#{newOrderAlert.orderId}</span> for <span className="text-slate-900 font-bold">₹{newOrderAlert.pricing?.total || newOrderAlert.total}</span>
                                </p>

                                {/* Timer Bar — width from real server deadline */}
                                <div className="w-full bg-slate-100 h-2 rounded-full mb-8 overflow-hidden">
                                    <div
                                        className={cn(
                                            "h-full transition-[width] duration-1000 ease-linear",
                                            timeLeft < 15 ? "bg-rose-500" : "bg-primary",
                                        )}
                                        style={{
                                            width: `${acceptWindowTotalRef.current > 0 ? (timeLeft / acceptWindowTotalRef.current) * 100 : 0}%`,
                                        }}
                                    />
                                </div>

                                <div className="flex items-center gap-4 text-sm font-bold mb-8">
                                    <Clock className={cn("h-4 w-4", timeLeft < 15 ? "text-rose-500 animate-pulse" : "text-slate-600")} />
                                    <span className={timeLeft < 15 ? "text-rose-500" : "text-slate-600"}>
                                        Accept within {timeLeft} {timeLeft === 1 ? "second" : "seconds"}
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-4 w-full">
                                    <button
                                        onClick={() => handleDeclineOrder(newOrderAlert.orderId)}
                                        className="flex items-center justify-center gap-2 py-4 rounded-2xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition-colors"
                                    >
                                        <X className="h-5 w-5" />
                                        Decline
                                    </button>
                                    <button
                                        onClick={() => handleAcceptOrder(newOrderAlert.orderId)}
                                        className="flex items-center justify-center gap-2 py-4 rounded-2xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 shadow-xl shadow-primary/20 transition-all active:scale-95"
                                    >
                                        <Check className="h-5 w-5" />
                                        Accept
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* Global Return Drop OTP Modal */}
                {returnDropOtpAlert && (
                    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-brand-100"
                        >
                            <div className="flex flex-col items-center text-center">
                                <div className="h-20 w-20 bg-brand-50 rounded-full flex items-center justify-center mb-6 animate-pulse">
                                    <Truck className="h-10 w-10 text-brand-600" />
                                </div>

                                <h2 className="text-2xl font-black text-slate-900 mb-2">Rider at Store!</h2>
                                <p className="text-slate-600 font-medium mb-6">
                                    A rider is at your store for Return <span className="text-brand-600 font-bold">#{returnDropOtpAlert.orderId}</span>.
                                    Please share the OTP below:
                                </p>

                                <div className="flex items-center justify-center gap-3 mb-8">
                                    {returnDropOtpAlert.otp.split('').map((char, i) => (
                                        <div key={i} className="h-16 w-14 bg-slate-50 rounded-2xl shadow-sm border border-brand-100 flex items-center justify-center text-4xl font-black text-slate-900 border-b-4 border-b-brand-600">
                                            {char}
                                        </div>
                                    ))}
                                </div>

                                <p className="text-xs font-bold text-slate-500 italic mb-8">
                                    Confirm receipt of the product by sharing this code.
                                </p>

                                <button
                                    onClick={() => setReturnDropOtpAlert(null)}
                                    className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-black hover:bg-primary/90 shadow-xl shadow-primary/20 transition-all active:scale-95 uppercase tracking-widest text-xs"
                                >
                                    Dismiss Alert
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {(role === "admin" || role === "seller") && <BottomNav navItems={navItems} />}
        </div>
    );
};

export default DashboardLayout;
