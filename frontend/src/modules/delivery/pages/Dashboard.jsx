import React, { useState, useEffect } from "react";
import {
  Bell,
  Star,
  TrendingUp,
  Package,
  MapPin,
  CheckCircle,
  XCircle,
  IndianRupee,
  AlertCircle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import Button from "@/shared/components/ui/Button";
import Card from "@/shared/components/ui/Card";

import { useAuth } from "@core/context/AuthContext";
import { deliveryApi } from "../services/deliveryApi";

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const [isOnline, setIsOnline] = useState(user?.isOnline || false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeTab, setActiveTab] = useState("delivery"); // 'delivery' or 'return'
  const [availableOrders, setAvailableOrders] = useState([]);
  const [earnings, setEarnings] = useState({
    today: 0,
    deliveries: 0,
    incentives: 0,
    cashCollected: 0,
  });

  // Sync isOnline with user profile from context
  useEffect(() => {
    if (user) {
      setIsOnline(user.isOnline);
    }
  }, [user]);

  const fetchStats = async () => {
    try {
      const response = await deliveryApi.getStats();
      if (response.data.success) {
        console.log("Stats Fetched:", response.data.result);
        setEarnings((prev) => ({
          ...prev,
          ...response.data.result,
        }));
      }
    } catch (error) {
      console.error("Failed to fetch statistics:", error);
    }
  };

  const fetchNotifications = async () => {
    try {
      const response = await deliveryApi.getNotifications();
      if (response.data.success && response.data.result) {
        setUnreadCount(response.data.result.unreadCount || 0);
      }
    } catch (error) {
      console.error("Failed to fetch notifications");
    }
  };

  const fetchAvailableOrders = async () => {
    try {
      const response = await deliveryApi.getAvailableOrders({ type: activeTab });
      if (response.data.success) {
        const orders = response.data.results || response.data.result || [];
        setAvailableOrders(orders);
      }
    } catch (error) {
      console.error("Failed to fetch available orders:", error);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchNotifications();
    if (isOnline) fetchAvailableOrders();
  }, [isOnline, activeTab]);

  const handleOnlineToggle = async () => {
    const newStatus = !isOnline;
    try {
      await deliveryApi.updateProfile({ isOnline: newStatus });
      await refreshUser(); // Refresh global auth state
      setIsOnline(newStatus);
      if (newStatus) {
        toast.success("You are now ONLINE. Finding orders...");
      } else {
        toast.info("You are now OFFLINE. No new orders.");
      }
    } catch (error) {
      toast.error("Failed to update status");
    }
  };

  const handleAcceptReturn = async (orderId) => {
    try {
      const response = await deliveryApi.acceptReturnPickup(orderId);
      if (response.data.success) {
        toast.success("Return pickup accepted!");
        fetchAvailableOrders();
        // Option: navigate to details
        navigate(`/delivery/order-details/${orderId}`);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to accept return");
    }
  };

  return (
    <div className="bg-gray-50/50 min-h-screen pb-24 relative overflow-hidden font-sans">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-100 px-6 pt-12 pb-4 flex justify-between items-center sticky top-0 z-30 transition-all duration-300">
        <div className="flex items-center space-x-3">
          <div
            className="w-12 h-12 rounded-full overflow-hidden border-2 border-primary ring-2 ring-primary/20 shadow-sm cursor-pointer"
            onClick={() => navigate("/delivery/profile")}>
            <img
              src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix"
              alt="Profile"
              className="w-full h-full object-cover"
            />
          </div>
          <div
            onClick={() => navigate("/delivery/profile")}
            className="cursor-pointer">
            <h2 className="ds-h2 leading-tight">
              {user?.name || "Delivery Partner"}
            </h2>
            <div className="flex items-center text-sm font-medium">
              <span className="flex items-center bg-yellow-50 text-yellow-600 px-1.5 py-0.5 rounded border border-yellow-100">
                <Star size={12} fill="currentColor" className="mr-1" />
                4.8
              </span>
              <span className="text-gray-300 mx-2">•</span>
              <span className="ds-caption text-gray-500">ID: 882190</span>
            </div>
          </div>
        </div>
        <div
          className="relative p-2.5 bg-gray-50 border border-gray-100 rounded-full hover:bg-gray-100 transition-colors cursor-pointer group"
          onClick={() => navigate("/delivery/notifications")}>
          <Bell
            size={20}
            className="text-gray-600 group-hover:text-primary transition-colors"
          />
          {unreadCount > 0 && (
            <span className="absolute top-2 right-2.5 w-2 h-2 bg-red-500 border-2 border-white rounded-full animate-pulse"></span>
          )}
        </div>
      </header>

      {/* Online/Offline Toggle */}
      <div className="px-6 py-6">
        <div className="bg-white rounded-3xl p-4 shadow-sm border border-gray-100 group">
          <div className="flex items-center justify-between mb-3 px-1">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Service Status</span>
            <div className="flex items-center gap-1.5">
              <div className={cn(
                "w-1.5 h-1.5 rounded-full animate-pulse",
                isOnline ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]"
              )} />
              <span className={cn(
                "text-[11px] font-bold uppercase tracking-wider",
                isOnline ? "text-emerald-600" : "text-rose-600"
              )}>
                {isOnline ? "Receiving Orders" : "Currently Offline"}
              </span>
            </div>
          </div>

          <div
            className="relative w-full h-14 bg-gray-100/80 rounded-2xl flex items-center p-1.5 cursor-pointer shadow-inner overflow-hidden border border-gray-200/50"
            onClick={handleOnlineToggle}
          >
            {/* Background Labels */}
            <div className="absolute inset-0 flex w-full">
              <div className="w-1/2 flex items-center justify-center">
                <span className={cn(
                  "text-[10px] font-black tracking-widest transition-opacity duration-300",
                  isOnline ? "opacity-0" : "opacity-40 text-gray-500"
                )}>SLIDE TO GO ONLINE</span>
              </div>
              <div className="w-1/2 flex items-center justify-center">
                <span className={cn(
                  "text-[10px] font-black tracking-widest transition-opacity duration-300",
                  !isOnline ? "opacity-0" : "opacity-40 text-gray-500"
                )}>SLIDE TO GO OFFLINE</span>
              </div>
            </div>

            <motion.div
              drag="x"
              dragConstraints={{ left: 0, right: 0 }} // We will use dragElastic for feel, but onDragEnd for logic
              dragElastic={0.1}
              onDragEnd={(_, info) => {
                const swipePower = info.offset.x;
                if (swipePower > 50 && !isOnline) {
                  handleOnlineToggle();
                } else if (swipePower < -50 && isOnline) {
                  handleOnlineToggle();
                }
              }}
              whileTap={{ scale: 0.98 }}
              className={cn(
                "w-1/2 h-full rounded-xl shadow-md flex items-center justify-center gap-2 z-10 border transition-all duration-500 cursor-grab active:cursor-grabbing",
                isOnline 
                  ? "bg-gradient-to-r from-primary to-[var(--brand-400)] border-[#389ecb] text-white" 
                  : "bg-gradient-to-r from-slate-700 to-slate-800 border-slate-900 text-white"
              )}
              animate={{ x: isOnline ? "100%" : "0%" }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            >
              <motion.div
                initial={false}
                animate={{ rotate: isOnline ? 0 : 0 }}
              >
                {isOnline ? <CheckCircle size={18} strokeWidth={3} /> : <XCircle size={18} strokeWidth={3} />}
              </motion.div>
              <span className="text-xs font-black uppercase tracking-widest select-none">
                {isOnline ? "ONLINE" : "OFFLINE"}
              </span>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 mb-2">
        <div className="bg-gray-100 p-1.5 rounded-2xl flex gap-1 border border-gray-200">
          <button
            onClick={() => setActiveTab("delivery")}
            className={cn(
              "flex-1 py-3 px-4 rounded-xl text-center text-xs font-black transition-all duration-300 uppercase tracking-widest",
              activeTab === "delivery"
                ? "bg-white text-primary shadow-sm ring-1 ring-black/5"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-200/50"
            )}
          >
            Deliveries
          </button>
          <button
            onClick={() => setActiveTab("return")}
            className={cn(
              "flex-1 py-3 px-4 rounded-xl text-center text-xs font-black transition-all duration-300 uppercase tracking-widest",
              activeTab === "return"
                ? "bg-white text-primary shadow-sm ring-1 ring-black/5"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-200/50"
            )}
          >
            Returns
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-6 space-y-6">
        {/* Earnings Card */}
        <Card className="bg-white shadow-sm border border-gray-100 overflow-hidden relative">
          {/* Background Decoration */}
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-primary/5 rounded-full blur-2xl"></div>

          <div className="flex justify-between items-center mb-4 relative z-10">
            <h3 className="ds-caption font-bold tracking-wider">
              Today's Earnings
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/delivery/earnings")}
              className="text-primary hover:text-primary/80 hover:bg-primary/5 h-8 px-3 text-xs font-bold rounded-full">
              View Details
            </Button>
          </div>

          <div className="flex items-baseline mb-6 relative z-10">
            <span className="text-2xl font-bold text-gray-400 mr-1">₹</span>
            <span className="text-4xl font-extrabold text-gray-900 tracking-tight">
              {earnings.today}
            </span>
            <span className="ml-3 text-brand-600 text-xs font-bold flex items-center bg-brand-50 border border-brand-100 px-2 py-1 rounded-full">
              <TrendingUp size={12} className="mr-1" /> +12%
            </span>
          </div>

          <div className="grid grid-cols-3 gap-4 border-t border-gray-50 pt-4 relative z-10">
            <div className="text-center group cursor-pointer">
              <div className="flex justify-center mb-2 text-brand-600 bg-brand-50 group-hover:bg-brand-100 transition-colors w-10 h-10 rounded-full items-center mx-auto">
                <Package size={18} />
              </div>
              <p className="ds-caption mb-0.5">Orders</p>
              <p className="font-bold text-gray-900">{earnings.deliveries}</p>
            </div>
            <div className="text-center border-l border-r border-gray-50 group cursor-pointer">
              <div className="flex justify-center mb-2 text-amber-500 bg-amber-50 group-hover:bg-amber-100 transition-colors w-10 h-10 rounded-full items-center mx-auto">
                <Star size={18} />
              </div>
              <p className="ds-caption mb-0.5">Incentives</p>
              <p className="font-bold text-gray-900">₹{earnings.incentives}</p>
            </div>
            <div
              className="text-center group cursor-pointer"
              role="button"
              tabIndex={0}
              onClick={() => navigate("/delivery/cod-cash")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") navigate("/delivery/cod-cash");
              }}
            >
              <div className="flex justify-center mb-2 text-brand-600 bg-brand-50 group-hover:bg-brand-100 transition-colors w-10 h-10 rounded-full items-center mx-auto">
                <IndianRupee size={18} />
              </div>
              <p className="ds-caption mb-0.5">COD Cash</p>
              <p className="font-bold text-gray-900">
                ₹{earnings.cashCollected}
              </p>
            </div>
          </div>
        </Card>

        {/* Active Order / Status */}
        <AnimatePresence mode="wait">
          {!isOnline ? (
            <motion.div
              key="offline"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bg-white rounded-2xl p-8 text-center shadow-sm border border-gray-100">
              <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6 border border-gray-100">
                <AlertCircle size={32} className="text-gray-400" />
              </div>
              <h3 className="ds-h3 mb-2">You are Offline</h3>
              <p className="text-sm text-gray-500 max-w-[250px] mx-auto">
                Go online to start receiving delivery requests and earning
                money.
              </p>
            </motion.div>
          ) : activeTab === 'delivery' ? (
            availableOrders.length > 0 ? (
              <motion.div
                key="waiting"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl p-6 border-2 border-primary/25 shadow-md shadow-primary/5 text-center">
                <div className="flex justify-center mb-3">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Package className="text-primary" size={24} />
                  </div>
                </div>
                <h3 className="ds-h3 text-gray-900 mb-1">
                  {availableOrders.length === 1
                    ? "1 order waiting"
                    : `${availableOrders.length} orders waiting`}
                </h3>
                <p className="text-sm text-gray-600 leading-relaxed px-1">
                  A fullscreen alert will open with <strong>Accept</strong> and{" "}
                  <strong>Reject</strong>. Use that to respond before the timer
                  ends.
                </p>
                <div className="mt-4 flex items-center justify-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  <span className="w-2 h-2 bg-brand-500 rounded-full animate-pulse" />
                  Listening for assignments
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="searching"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="bg-white rounded-2xl p-8 text-center border-2 border-dashed border-gray-200 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-tr from-brand-50/50 to-purple-50/50 opacity-50"></div>
                <div className="relative z-10">
                  <div className="relative w-24 h-24 mx-auto mb-6">
                    <div className="absolute inset-0 bg-brand-100 rounded-full animate-ping opacity-20"></div>
                    <div className="absolute inset-2 bg-brand-100 rounded-full animate-ping opacity-40 delay-150"></div>
                    <div className="relative w-full h-full bg-brand-50 rounded-full flex items-center justify-center border border-brand-100 shadow-sm">
                      <MapPin size={36} className="text-brand-600" />
                    </div>
                  </div>
                  <h3 className="ds-h3 mb-2 text-gray-800">
                    Finding Orders Nearby...
                  </h3>
                  <p className="text-sm text-gray-500 max-w-[220px] mx-auto mb-6">
                    We're looking for delivery requests in your area. Stay
                    online!
                  </p>
                </div>
              </motion.div>
            )
          ) : (
            <motion.div
              key="returns-list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <div className="flex justify-between items-center mb-1">
                <h3 className="text-sm font-bold text-gray-800 tracking-tight">Available Return Pickups</h3>
                <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full uppercase italic">Open for Acceptance</span>
              </div>
              {availableOrders.length > 0 ? (
                availableOrders.map((order) => (
                  <Card key={order._id} className="p-4 border-2 border-primary/5 hover:border-primary/20 transition-all shadow-sm">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <span className="text-[10px] font-black text-primary/60 uppercase tracking-widest mb-1 block">Return Task</span>
                        <h4 className="font-bold text-gray-900">#{order.orderId}</h4>
                      </div>
                      <div className="text-right">
                        <span className="block font-black text-brand-600 text-lg">₹{order.returnDeliveryCommission || 0}</span>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Commission</span>
                      </div>
                    </div>
                    
                    <div className="space-y-2 mb-5">
                      <div className="flex items-center text-xs text-gray-600">
                        <MapPin size={12} className="mr-2 text-gray-400" />
                        <span className="truncate">{order.seller?.shopName || "Store"}</span>
                      </div>
                      <div className="flex items-center text-[11px] text-gray-500 font-medium">
                        <Package size={12} className="mr-2 text-gray-400" />
                        <span>Pickup from Customer & Return to Store</span>
                      </div>
                    </div>

                    <div className="flex gap-2">
                       <Button 
                        variant="primary" 
                        size="sm" 
                        className="flex-1 font-black text-[10px] tracking-widest uppercase h-10 shadow-lg shadow-primary/20"
                        onClick={() => handleAcceptReturn(order.orderId)}
                      >
                        Accept Pickup
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="px-4 text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-gray-600 hover:bg-gray-100 h-10"
                        onClick={() => navigate(`/delivery/order-details/${order.orderId}`)}
                      >
                        View
                      </Button>
                    </div>
                  </Card>
                ))
              ) : (
                <div className="bg-white rounded-2xl p-10 text-center border-2 border-dashed border-gray-100 flex flex-col items-center">
                  <div className="w-14 h-14 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-gray-100 opacity-60">
                    <Package size={20} className="text-gray-400" />
                  </div>
                  <h4 className="text-sm font-bold text-gray-800 mb-1">No returns nearby</h4>
                  <p className="text-[11px] text-gray-400">Keep checking back for new return tasks.</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Dashboard;
