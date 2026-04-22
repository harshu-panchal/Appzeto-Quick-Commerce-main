import React, { useState, useMemo, useEffect } from "react";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import {
  HiOutlineMagnifyingGlass,
  HiOutlineTruck,
  HiOutlinePhone,
  HiOutlineMapPin,
  HiOutlineClock,
  HiOutlineCheckCircle,
  HiOutlineUser,
  HiOutlineInformationCircle,
} from "react-icons/hi2";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { BlurFade } from "@/components/ui/blur-fade";
import { MagicCard } from "@/components/ui/magic-card";

import { sellerApi } from "../services/sellerApi";
import { useToast } from "@shared/components/ui/Toast";
import { Loader2 } from "lucide-react";
import Pagination from "@shared/components/ui/Pagination";

const DeliveryTracking = () => {
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("Active");
  const { showToast } = useToast();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    fetchDeliveries();
  }, []);

  const fetchDeliveries = async () => {
    try {
      setLoading(true);
      const requestLimit = 100;
      const maxPages = 50;
      let requestedPage = 1;
      let totalPages = 1;
      const collectedOrders = [];

      while (requestedPage <= totalPages && requestedPage <= maxPages) {
        const response = await sellerApi.getOrders({
          page: requestedPage,
          limit: requestLimit,
        });
        const payload = response.data.result || {};
        const pageOrders = Array.isArray(payload.items)
          ? payload.items
          : (response.data.results || []);

        collectedOrders.push(...pageOrders);
        totalPages = Number(payload.totalPages || 1);

        if (!pageOrders.length || requestedPage >= totalPages) {
          break;
        }
        requestedPage += 1;
      }

      // Only show orders that are confirmed, packed, or out for delivery (Tracking flow)
      const formattedDeliveries = collectedOrders
        .filter(order => order.status !== 'pending' && order.status !== 'cancelled')
        .map(order => {
          let uiStatus = "Active";
          if (order.status === 'delivered') uiStatus = "Delivered";
          else if (order.status === 'out_for_delivery') uiStatus = "On the Way";
          else uiStatus = "Picked Up";

          return {
            id: order._id,
            orderId: order.orderId,
            status: uiStatus,
            deliveryBoy: order.deliveryBoy ? {
              name: order.deliveryBoy.name,
              phone: order.deliveryBoy.phone,
              avatar: order.deliveryBoy.name?.charAt(0) || "?",
              image: order.deliveryBoy.image || "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=100&h=100&fit=crop",
              rating: order.deliveryBoy.rating || 4.5,
            } : {
              name: "Not Assigned",
              phone: "N/A",
              avatar: "?",
              image: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=100&h=100&fit=crop",
              rating: 0,
            },
            location: order.status === 'delivered' && order.updatedAt
              ? `Delivered at ${new Date(order.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : "In Progress",
            orderDate: order.createdAt
              ? new Date(order.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
              : "",
            startTime: order.createdAt
              ? new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : "",
            estimatedDelivery: "20-30 mins",
            customerName: order.customer?.name || "Customer",
            address: order.address
              ? `${order.address.address || ""}, ${order.address.city || ""}`.trim()
              : "",
            addressCoords: order.address?.location || null,
          };
        });

      setDeliveries(formattedDeliveries);
    } catch (error) {
      console.error("Tracking Error:", error);
      showToast("Failed to fetch tracking data", "error");
    } finally {
      setLoading(false);
    }
  };

  const tabs = ["Active", "Completed", "All"];

  const filteredDeliveries = useMemo(() => {
    const result = deliveries.filter((dlv) => {
      const matchesSearch =
        dlv.orderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        dlv.deliveryBoy.name.toLowerCase().includes(searchTerm.toLowerCase());

      const isCompleted = dlv.status === "Delivered";
      if (activeTab === "Active") return matchesSearch && !isCompleted;
      if (activeTab === "Completed") return matchesSearch && isCompleted;
      return matchesSearch;
    });
    // Reset to first page if current page exceeds total pages
    const totalPages = Math.max(1, Math.ceil(result.length / pageSize));
    if (page > totalPages) {
      setPage(1);
    }
    return result;
  }, [deliveries, searchTerm, activeTab, page, pageSize]);

  const paginatedDeliveries = useMemo(() => {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return filteredDeliveries.slice(start, end);
  }, [filteredDeliveries, page, pageSize]);

  const stats = useMemo(
    () => [
      {
        label: "On the Way",
        value: deliveries.filter((d) => d.status === "On the Way").length,
        icon: HiOutlineTruck,
        color: "text-brand-600",
        bg: "bg-brand-50",
      },
      {
        label: "At Store",
        value: deliveries.filter((d) => d.status === "Picked Up").length,
        icon: HiOutlineMapPin,
        color: "text-amber-600",
        bg: "bg-amber-50",
      },
      {
        label: "Completed Today",
        value: deliveries.filter((d) => d.status === "Delivered").length,
        icon: HiOutlineCheckCircle,
        color: "text-brand-600",
        bg: "bg-brand-50",
      },
    ],
    [deliveries],
  );

  const getStatusVariant = (status) => {
    switch (status) {
      case "On the Way":
        return "info";
      case "Picked Up":
        return "warning";
      case "Delivered":
        return "success";
      default:
        return "primary";
    }
  };

  return (
    <div className="space-y-6 pb-16">
      <BlurFade delay={0.1}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
              Delivery Tracking
              <Badge
                variant="primary"
                className="text-[9px] px-1.5 py-0 font-bold tracking-wider uppercase bg-brand-100 text-brand-700">
                Live Fleet
              </Badge>
            </h1>
            <p className="text-slate-600 text-sm mt-0.5 font-medium">
              Monitor active deliveries and assigned partners.
            </p>
          </div>
        </div>
      </BlurFade>

      {/* Stats Grid */}
      {loading ? (
        <div className="min-h-[400px] flex flex-col items-center justify-center bg-white rounded-3xl border border-slate-100 shadow-sm">
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
          <p className="text-slate-600 font-bold mt-4 uppercase tracking-widest text-xs">Tracking Fleet...</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {stats.map((stat, i) => (
              <BlurFade key={i} delay={0.1 + i * 0.05}>
                <MagicCard
                  className="border-none shadow-sm ring-1 ring-slate-100 p-0 overflow-hidden group bg-white"
                  gradientColor={
                    stat.color === "text-brand-600"
                      ? "#e0f2fe"
                      : stat.color === "text-amber-600"
                        ? "#fef3c7"
                        : "#cffafe"
                  }>
                  <div className="flex items-center gap-4 p-5 relative z-10">
                    <div
                      className={cn(
                        "h-10 w-10 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110 duration-500 shadow-sm",
                        stat.bg,
                        stat.color,
                      )}>
                      <stat.icon className="h-5 w-5" />
                    </div>
                    <div className="flex flex-col">
                      <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">
                        {stat.label}
                      </p>
                      <h4 className="text-xl font-black text-slate-900 tracking-tight leading-none mt-0.5">
                        {stat.value}
                      </h4>
                    </div>
                  </div>
                </MagicCard>
              </BlurFade>
            ))}
          </div>

          <BlurFade delay={0.3}>
            <Card className="border-none shadow-xl ring-1 ring-slate-100 overflow-hidden rounded-lg bg-white">
              {/* Tabs & Search */}
              <div className="border-b border-slate-100 bg-slate-50/30">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between px-4">
                  <div className="flex items-center">
                    {tabs.map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={cn(
                          "relative py-3.5 px-5 text-[9px] font-black uppercase tracking-widest transition-all duration-300",
                          activeTab === tab
                            ? "text-primary bg-white/50"
                            : "text-slate-600 hover:text-slate-700",
                        )}>
                        {tab}
                        {activeTab === tab && (
                          <motion.div
                            layoutId="tab-underline-tracking"
                            className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full mx-4"
                          />
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="py-2 lg:py-0 w-full lg:w-64">
                    <div className="relative group">
                      <HiOutlineMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 group-focus-within:text-primary transition-all" />
                      <input
                        type="text"
                        placeholder="Search ID or Partner..."
                        className="w-full pl-9 pr-3 py-1.5 bg-slate-100/50 border-none rounded-lg text-xs font-bold text-slate-700 placeholder:text-slate-400 focus:ring-1 focus:ring-primary/10 transition-all outline-none"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Delivery List */}
              <div className="p-4 sm:p-6 space-y-4">
                <AnimatePresence mode="popLayout">
                  {paginatedDeliveries.map((dlv, idx) => (
                    <motion.div
                      key={dlv.id}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ delay: idx * 0.04 }}
                      className="group relative bg-white rounded-lg border border-slate-100 p-1.5 hover:shadow-xl hover:shadow-primary/5 hover:border-primary/20 transition-all duration-300 min-w-0">
                      <div className="flex flex-col lg:flex-row items-stretch gap-1">
                        {/* Partner Info Section */}
                        <div className="lg:w-48 p-2 bg-slate-50/50 rounded-lg border border-transparent group-hover:bg-primary/[0.02] group-hover:border-primary/5 transition-all min-w-0">
                          <div className="flex items-center gap-2.5">
                            <div className="relative shrink-0">
                              <div className="h-10 w-10 rounded-md overflow-hidden ring-2 ring-white shadow-sm">
                                <img
                                  src={dlv.deliveryBoy.image}
                                  alt={dlv.deliveryBoy.name}
                                  className="h-full w-full object-cover group-hover:scale-110 transition-transform duration-700"
                                />
                              </div>
                              <div className="absolute -bottom-1 -right-1 h-3.5 w-3.5 bg-brand-500 rounded-sm border-[1px] border-white flex items-center justify-center text-white text-[7px] font-black shadow-sm">
                                {dlv.deliveryBoy.rating}
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[8px] font-black text-primary uppercase tracking-[0.1em] mb-0.5">
                                Partner
                              </p>
                              <h3 className="text-xs font-black text-slate-900 leading-none truncate">
                                {dlv.deliveryBoy.name}
                              </h3>
                              <a
                                href={`tel:${dlv.deliveryBoy.phone}`}
                                className="inline-flex items-center gap-1 mt-1 text-[9px] font-bold text-slate-500 hover:text-primary transition-colors"
                              >
                                <HiOutlinePhone className="h-2.5 w-2.5 shrink-0" />
                                <span className="truncate">{dlv.deliveryBoy.phone}</span>
                              </a>
                            </div>
                          </div>
                        </div>

                        {/* Order Info Section */}
                        <div className="flex-1 p-2 flex flex-col justify-between min-w-0">
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 mb-2">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2 mb-0.5">
                                <span className="text-[10px] font-black text-slate-900 tracking-tight">
                                  #{dlv.orderId}
                                </span>
                                <Badge
                                  variant={getStatusVariant(dlv.status)}
                                  className="text-[7px] font-black px-1.5 py-0 rounded-full uppercase tracking-widest shrink-0"
                                >
                                  {dlv.status}
                                </Badge>
                              </div>
                              <h4 className="text-[10px] font-bold text-slate-500 flex items-center gap-1 flex-wrap">
                                <HiOutlineUser className="h-3 w-3 text-slate-400 shrink-0" />
                                <span className="text-slate-900 capitalize font-black">{dlv.customerName}</span>
                              </h4>
                            </div>
                            <div className="sm:text-right shrink-0">
                              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">
                                Timing
                              </p>
                              <p className="text-[10px] font-black text-primary tracking-tight mt-0.5">
                                {dlv.startTime || "—"}
                              </p>
                            </div>
                          </div>

                          <div className="bg-slate-50/30 px-3 py-1.5 rounded-md border border-slate-100/30 min-w-0">
                            <p className="text-[10px] font-bold text-slate-600 leading-tight truncate">
                              <HiOutlineMapPin className="inline h-2.5 w-2.5 text-primary mr-1 -mt-0.5" />
                              {dlv.address}
                            </p>
                          </div>
                        </div>

                        {/* Action Button Section */}
                        <div className="lg:w-16 flex items-center justify-center p-2 sm:p-3 shrink-0">
                          <button className="h-10 w-10 lg:h-full lg:w-full bg-slate-900 group-hover:bg-primary rounded-lg lg:rounded-r-lg lg:rounded-l-none flex items-center justify-center text-white transition-all duration-500 shadow-xl shadow-slate-900/10 hover:shadow-primary/30">
                            <HiOutlineTruck className="h-4 w-4 group-hover:scale-125 transition-transform" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {filteredDeliveries.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-20 bg-slate-50/50 rounded-lg border border-dashed border-slate-200">
                    <div className="h-20 w-20 bg-white rounded-lg flex items-center justify-center shadow-sm mb-4">
                      <HiOutlineTruck className="h-10 w-10 text-slate-200" />
                    </div>
                    <h3 className="text-base font-black text-slate-900">
                      No active tracking found
                    </h3>
                    <p className="text-sm text-slate-600 font-bold uppercase tracking-widest mt-2">
                      Adjust filters or search terms
                    </p>
                  </div>
                )}
              </div>

              {/* Pagination */}
              {filteredDeliveries.length > 0 && (
                <div className="px-4 sm:px-6 pb-4">
                  <Pagination
                    page={page}
                    totalPages={Math.max(1, Math.ceil(filteredDeliveries.length / pageSize))}
                    total={filteredDeliveries.length}
                    pageSize={pageSize}
                    onPageChange={(newPage) => setPage(newPage)}
                    onPageSizeChange={(newSize) => {
                      setPageSize(newSize);
                      setPage(1);
                    }}
                    loading={loading}
                  />
                </div>
              )}
            </Card>
          </BlurFade>
        </>
      )}
    </div>
  );
};

export default DeliveryTracking;

