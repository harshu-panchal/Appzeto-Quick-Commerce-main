import React, { useState, useEffect } from "react";
import {
  Bell,
  ArrowLeft,
  Calendar,
  Megaphone,
  CheckCircle,
  Clock,
  Trash2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import Button from "@/shared/components/ui/Button";
import Card from "@/shared/components/ui/Card";
import { deliveryApi } from "../services/deliveryApi";
import { toast } from "sonner";
import {
  getOrderSocket,
  onDeliveryBroadcastWithdrawn,
} from "@/core/services/orderSocket";

const Notifications = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const response = await deliveryApi.getNotifications();
      if (response.data.success) {
        setNotifications(response.data.result.notifications);
      }
    } catch (error) {
      toast.error("Failed to fetch notifications");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  useEffect(() => {
    const getToken = () => localStorage.getItem("auth_delivery");
    getOrderSocket(getToken);
    return onDeliveryBroadcastWithdrawn(getToken, (payload) => {
      const orderId = payload?.orderId;
      if (!orderId) return;
      setNotifications((current) =>
        current.filter((notification) => notification?.data?.orderId !== orderId),
      );
      toast.info("An order request was accepted by another partner.");
    });
  }, []);

  const handleMarkAsRead = async (id) => {
    try {
      await deliveryApi.markNotificationRead(id);
      setNotifications(notifications.map(n => n._id === id ? { ...n, isRead: true } : n));
    } catch (error) {
      toast.error("Failed to update status");
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await deliveryApi.markAllNotificationsRead();
      setNotifications(notifications.map(n => ({ ...n, isRead: true })));
      toast.success("Marked all as read");
    } catch (error) {
      toast.error("Failed to update status");
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: { opacity: 1, x: 0 },
  };

  return (
    <div className="bg-gray-50/50 min-h-screen pb-24 font-sans">
      {/* Header */}
      <div className="bg-white shadow-sm p-4 sticky top-0 z-30 backdrop-blur-md bg-white/90">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(-1)}
              className="mr-2">
              <ArrowLeft size={24} />
            </Button>
            <h1 className="ds-h3 text-gray-900">Notifications</h1>
          </div>
          {notifications.some(n => !n.isRead) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllAsRead}
              className="text-primary text-xs font-bold hover:bg-primary/5 px-2">
              Mark all read
            </Button>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
          </div>
        ) : (
          <motion.div
            className="space-y-3"
            variants={containerVariants}
            initial="hidden"
            animate="visible">
            <AnimatePresence mode="popLayout">
              {notifications.map((notification) => (
                <motion.div
                  key={notification._id}
                  variants={itemVariants}
                  layout
                  onClick={() => !notification.isRead && handleMarkAsRead(notification._id)}>
                  <Card
                    className={`p-4 border-none shadow-sm relative overflow-hidden transition-all duration-300 cursor-pointer ${!notification.isRead
                      ? "bg-brand-50/50 border-l-4 border-l-brand-500 shadow-brand-500/5 scale-[1.02]"
                      : "bg-white opacity-90"
                      }`}>
                    {!notification.isRead && (
                      <div className="absolute top-4 right-4 w-2 h-2 bg-brand-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
                    )}

                    <div className="flex items-start">
                      <div
                        className={`p-3 rounded-full mr-4 flex-shrink-0 ${notification.type === "order"
                          ? "bg-orange-100 text-orange-600"
                          : notification.isRead ? "bg-gray-100 text-gray-400" : "bg-brand-100 text-brand-600"
                          }`}>
                        {notification.type === "order" ? <Megaphone size={20} /> : <Bell size={20} />}
                      </div>

                      <div className="flex-1">
                        <h3
                          className={`font-extrabold text-gray-900 mb-0.5 text-sm ${!notification.isRead ? "text-brand-900" : "text-gray-700 font-bold"}`}>
                          {notification.title}
                        </h3>
                        <p className={`text-xs mb-2 leading-snug ${!notification.isRead ? "text-gray-900 font-medium" : "text-gray-500"}`}>
                          {notification.message}
                        </p>
                        <div className="flex items-center text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                          <Clock size={10} className="mr-1" />
                          {new Date(notification.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, {new Date(notification.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>

            {notifications.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-20 px-6">
                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Bell size={40} className="text-gray-300" />
                </div>
                <h3 className="ds-h3 text-gray-900 mb-2">You're All Caught Up!</h3>
                <p className="text-gray-500 text-sm max-w-[200px] mx-auto">
                  New notifications will appear here automatically.
                </p>
              </motion.div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default Notifications;
