import React, { useEffect, useMemo, useState } from "react";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import Button from "@shared/components/ui/Button";
import { sellerApi } from "../services/sellerApi";
import { useToast } from "@shared/components/ui/Toast";
import {
    HiOutlineArrowPath,
    HiOutlineInboxStack,
    HiOutlineEye,
    HiOutlineCalendarDays,
    HiOutlineTruck,
} from "react-icons/hi2";
import { BlurFade } from "@/components/ui/blur-fade";
import { MagicCard } from "@/components/ui/magic-card";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Loader2, X } from "lucide-react";
import { onReturnDropOtp } from "@core/services/orderSocket";

const Returns = () => {
    const { showToast } = useToast();
    const [returns, setReturns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("All");
    const [selectedReturn, setSelectedReturn] = useState(null);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
    const [rejectReason, setRejectReason] = useState("");
    const [submittingReject, setSubmittingReject] = useState(false);
    const [assigningPickup, setAssigningPickup] = useState(false);
    const [activeOtps, setActiveOtps] = useState({}); // { orderId: { otp, expiresAt } }
    const canManageReturns = true;

    const tabs = [
        "All",
        "Requested",
        "Approved",
        "Rejected",
        "Pickup Assigned",
        "In Transit",
        "QC Passed",
        "QC Failed",
        "Completed",
    ];

    const mapReturnStatusLabel = (status) => {
        switch (status) {
            case "return_requested":
                return "Requested";
            case "return_approved":
                return "Approved";
            case "return_rejected":
                return "Rejected";
            case "return_pickup_assigned":
                return "Pickup Assigned";
            case "return_in_transit":
            case "return_drop_pending":
                return "In Transit";
            case "qc_passed":
                return "QC Passed";
            case "qc_failed":
                return "QC Failed";
            case "returned":
            case "refund_completed":
                return "Completed";
            default:
                return status || "Unknown";
        }
    };

    const getStatusVariant = (status) => {
        switch (status) {
            case "return_requested":
                return "warning";
            case "return_approved":
                return "info";
            case "return_rejected":
                return "error";
            case "return_pickup_assigned":
            case "return_in_transit":
            case "return_drop_pending":
                return "secondary";
            case "qc_passed":
                return "success";
            case "qc_failed":
                return "error";
            case "refund_completed":
            case "returned":
                return "success";
            default:
                return "secondary";
        }
    };

    const fetchReturns = async () => {
        try {
            setLoading(true);
            const res = await sellerApi.getReturns();
            const payload = res.data.result || {};
            const items = Array.isArray(payload.items)
                ? payload.items
                : res.data.results || [];
            setReturns(items || []);
        } catch (error) {
            console.error("Failed to fetch returns", error);
            showToast("Failed to fetch return requests", "error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReturns();

        // Listen for return drop OTPs (when rider arrives at seller)
        const getToken = () => localStorage.getItem("auth_seller");
        const unsubscribe = onReturnDropOtp(getToken, (payload) => {
            const { orderId, otp, expiresAt } = payload;
            setActiveOtps(prev => ({
                ...prev,
                [orderId]: { otp, expiresAt }
            }));
            showToast(`Rider arrived for Return #${orderId}. OTP: ${otp}`, "info");
        });

        return () => {
            if (typeof unsubscribe === "function") unsubscribe();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (isDetailsOpen || isRejectModalOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "unset";
        }
        return () => {
            document.body.style.overflow = "unset";
        };
    }, [isDetailsOpen, isRejectModalOpen]);

    const filteredReturns = useMemo(() => {
        if (activeTab === "All") return returns;
        return returns.filter((r) => {
            const label = mapReturnStatusLabel(r.returnStatus);
            return label === activeTab;
        });
    }, [returns, activeTab]);

    const openDetails = (ret) => {
        setSelectedReturn(ret);
        setIsDetailsOpen(true);
    };

    const handleApprove = async (orderId) => {
        try {
            await sellerApi.approveReturn(orderId, {});
            showToast("Return approved", "success");
            await fetchReturns();
        } catch (error) {
            console.error("Failed to approve return", error);
            showToast(
                error.response?.data?.message || "Failed to approve return",
                "error"
            );
        }
    };

    const handleReject = async () => {
        if (!rejectReason.trim() || !selectedReturn) return;
        try {
            setSubmittingReject(true);
            await sellerApi.rejectReturn(selectedReturn.orderId, { reason: rejectReason });
            showToast("Return rejected", "success");
            setIsRejectModalOpen(false);
            setRejectReason("");
            setIsDetailsOpen(false);
            await fetchReturns();
        } catch (error) {
            console.error("Failed to reject return", error);
            showToast(
                error.response?.data?.message || "Failed to reject return",
                "error"
            );
        } finally {
            setSubmittingReject(false);
        }
    };

    const handleAssignPickup = async (orderId) => {
        try {
            setAssigningPickup(true);
            await sellerApi.assignReturnDelivery(orderId, {});
            showToast("Riders notified for return pickup", "success");
            setIsDetailsOpen(false);
            await fetchReturns();
        } catch (error) {
            console.error("Failed to assign pickup", error);
            showToast(
                error.response?.data?.message || "No nearby riders found or assignment failed",
                "error"
            );
        } finally {
            setAssigningPickup(false);
        }
    };

    return (
        <div className="space-y-4 sm:space-y-6 pb-20 sm:pb-16">
            <BlurFade delay={0.1}>
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
                    <div className="min-w-0">
                        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 flex flex-wrap items-center gap-2">
                            Return Requests
                            <Badge
                                variant="secondary"
                                className="text-[10px] px-1.5 py-0 font-bold tracking-widest uppercase"
                            >
                                New
                            </Badge>
                        </h1>
                        <p className="text-slate-600 text-sm sm:text-base mt-0.5 font-medium">
                            Review and manage customer return requests.
                        </p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                        <Button
                            onClick={fetchReturns}
                            variant="outline"
                            className="flex items-center space-x-1.5 sm:space-x-2 px-3 py-2 sm:px-5 sm:py-2.5 rounded-lg text-xs sm:text-sm font-bold text-slate-600 bg-white hover:bg-slate-50 border-slate-200"
                        >
                            <HiOutlineArrowPath className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            <span className="hidden sm:inline">REFRESH</span>
                        </Button>
                    </div>
                </div>
            </BlurFade>

            {loading ? (
                <div className="min-h-[320px] flex flex-col items-center justify-center bg-white rounded-3xl border border-slate-100 shadow-sm">
                    <Loader2 className="h-10 w-10 text-primary animate-spin" />
                    <p className="text-slate-600 font-bold mt-4 uppercase tracking-widest text-xs">
                        Loading Return Requests...
                    </p>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                        {["Requested", "Approved", "Rejected", "Completed"].map(
                            (label, i) => {
                                const count = returns.filter(
                                    (r) => mapReturnStatusLabel(r.returnStatus) === label
                                ).length;
                                return (
                                    <BlurFade key={label} delay={0.1 + i * 0.05}>
                                        <MagicCard
                                            className="border-none shadow-sm ring-1 ring-slate-100 p-0 overflow-hidden group bg-white"
                                            gradientColor="#eef2ff"
                                        >
                                            <div className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4 relative z-10">
                                                <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg flex items-center justify-center bg-slate-900 text-white shadow-sm shrink-0">
                                                    <HiOutlineInboxStack className="h-5 w-5 sm:h-6 sm:w-6" />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-widest truncate">
                                                        {label}
                                                    </p>
                                                    <h4 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight">
                                                        {count}
                                                    </h4>
                                                </div>
                                            </div>
                                        </MagicCard>
                                    </BlurFade>
                                );
                            }
                        )}
                    </div>

                    <BlurFade delay={0.2}>
                        <Card className="border-none shadow-xl ring-1 ring-slate-100 rounded-lg bg-white overflow-hidden">
                            <div className="border-b border-slate-100 bg-slate-50/30 overflow-x-auto scrollbar-hide">
                                <div className="flex px-3 sm:px-6 items-center min-w-max">
                                    {tabs.map((tab) => (
                                        <button
                                            key={tab}
                                            onClick={() => setActiveTab(tab)}
                                            className={cn(
                                                "relative py-3 sm:py-4 px-2.5 sm:px-4 text-xs sm:text-sm font-bold whitespace-nowrap transition-all duration-300",
                                                activeTab === tab
                                                    ? "text-primary scale-105"
                                                    : "text-slate-600 hover:text-slate-700"
                                            )}
                                        >
                                            {tab}
                                            {activeTab === tab && (
                                                <motion.div
                                                    layoutId="returns-tab-underline"
                                                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full mx-2 sm:mx-4"
                                                />
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="p-3 sm:p-4">
                                {filteredReturns.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-16 px-4">
                                        <div className="h-14 w-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 mb-3">
                                            <HiOutlineInboxStack className="h-7 w-7" />
                                        </div>
                                        <h3 className="text-sm font-bold text-slate-900">
                                            No return requests found
                                        </h3>
                                        <p className="text-xs text-slate-600 font-medium text-center mt-1">
                                            You will see customer return requests here.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {filteredReturns.map((ret) => (
                                            <div
                                                key={ret._id}
                                                className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm hover:bg-slate-50/40 transition-colors flex items-start justify-between gap-3"
                                            >
                                                <div
                                                    className="min-w-0 flex-1 cursor-pointer"
                                                    onClick={() => openDetails(ret)}
                                                >
                                                    <p className="text-xs font-black text-slate-900 truncate">
                                                        #{ret.orderId}
                                                    </p>
                                                    <p className="text-xs font-semibold text-slate-600 mt-0.5 flex items-center gap-1">
                                                        <HiOutlineCalendarDays className="h-3 w-3 shrink-0" />
                                                        {ret.returnRequestedAt
                                                            ? new Date(
                                                                ret.returnRequestedAt
                                                            ).toLocaleString("en-IN", {
                                                                day: "2-digit",
                                                                month: "short",
                                                                hour: "2-digit",
                                                                minute: "2-digit",
                                                            })
                                                            : "N/A"}
                                                    </p>
                                                    <p className="text-xs font-bold text-slate-800 mt-1">
                                                        {ret.customer?.name || "Customer"}
                                                    </p>
                                                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                                                        {ret.returnReason ||
                                                            "No reason provided"}
                                                    </p>
                                                    {/* Proper Data: Rider tracking for in-transit */}
                                                    {(ret.returnStatus === "return_in_transit" || ret.returnStatus === "return_drop_pending" || ret.returnStatus === "return_pickup_assigned") && ret.returnDeliveryBoy && (
                                                        <div className="mt-2 flex items-center gap-1.5 px-2 py-1 bg-brand-50 rounded-lg border border-brand-100 w-fit">
                                                            <HiOutlineTruck className="h-3 w-3 text-brand-600" />
                                                            <span className="text-[10px] font-bold text-brand-700">Rider: {ret.returnDeliveryBoy.name}</span>
                                                        </div>
                                                    )}
                                                    {/* Proper Data: QC Note for passed/failed */}
                                                    {(ret.returnStatus === "qc_passed" || ret.returnStatus === "qc_failed") && ret.returnQcNote && (
                                                        <div className="mt-2 flex items-start gap-1.5 px-2 py-1 bg-slate-50 rounded-lg border border-slate-100 w-fit max-w-[200px]">
                                                            <HiOutlineInboxStack className="h-3 w-3 text-slate-500 mt-0.5" />
                                                            <span className="text-[10px] font-medium text-slate-600 italic line-clamp-2">QC: {ret.returnQcNote}</span>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex flex-col items-end gap-2 shrink-0">
                                                    <Badge
                                                        variant={getStatusVariant(
                                                            ret.returnStatus
                                                        )}
                                                        className="text-[10px] font-black uppercase px-2 py-0"
                                                    >
                                                        {mapReturnStatusLabel(ret.returnStatus)}
                                                    </Badge>
                                                    <p className="text-xs font-black text-slate-900">
                                                        {"\u20B9"}
                                                        {ret.returnRefundAmount ||
                                                            ret.pricing?.subtotal ||
                                                            0}
                                                    </p>
                                                    <button
                                                        onClick={() => openDetails(ret)}
                                                        className="p-2 hover:bg-slate-100 rounded-lg text-slate-600"
                                                    >
                                                        <HiOutlineEye className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </Card>
                    </BlurFade>
                </>
            )}

            <AnimatePresence>
                {isDetailsOpen && selectedReturn && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 lg:p-8">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
                            onClick={() => setIsDetailsOpen(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="w-full max-w-2xl relative z-10 bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col"
                            style={{ maxHeight: 'calc(100vh - 2rem)' }}
                        >
                            <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-100 shrink-0">
                                <div>
                                    <h3 className="text-base font-black text-slate-900">
                                        Return for Order #{selectedReturn.orderId}
                                    </h3>
                                    <div className="flex items-center space-x-2 mt-0.5">
                                        <Badge
                                            variant={getStatusVariant(
                                                selectedReturn.returnStatus
                                            )}
                                            className="text-[10px] font-black uppercase tracking-widest px-1.5 py-0"
                                        >
                                            {mapReturnStatusLabel(
                                                selectedReturn.returnStatus
                                            )}
                                        </Badge>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setIsDetailsOpen(false)}
                                    className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-600"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>

                            <div className="px-4 py-4 sm:px-6 sm:py-5 overflow-y-auto overscroll-contain flex-1 space-y-4">
                                <div className="space-y-2">
                                    <p className="text-xs font-bold text-slate-600 uppercase tracking-widest">
                                        Customer
                                    </p>
                                    <p className="text-sm font-bold text-slate-900">
                                        {selectedReturn.customer?.name || "Customer"}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                        {selectedReturn.customer?.phone || ""}
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <p className="text-xs font-bold text-slate-600 uppercase tracking-widest">
                                        Return Details
                                    </p>
                                    <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 space-y-2">
                                        <p className="text-sm font-bold text-slate-800">
                                            Reason: <span className="font-medium text-slate-600">{selectedReturn.returnReason || "N/A"}</span>
                                        </p>
                                        {selectedReturn.returnReasonDetail && (
                                            <p className="text-sm text-slate-700 italic border-l-2 border-slate-300 pl-2">
                                                {selectedReturn.returnReasonDetail}
                                            </p>
                                        )}
                                        {selectedReturn.returnConditionAssurance !== undefined && (
                                            <div className="flex items-start gap-1.5 pt-1">
                                                <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${selectedReturn.returnConditionAssurance ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                                <p className="text-xs font-semibold text-slate-600">
                                                    {selectedReturn.returnConditionAssurance ? "Customer confirmed proper accessories & good condition." : "Customer did NOT confirm condition."}
                                                </p>
                                            </div>
                                        )}
                                    </div>

                                    {selectedReturn.returnImages?.length > 0 && (
                                        <div className="pt-2 space-y-2">
                                            <p className="text-xs font-bold text-slate-600 uppercase tracking-widest">
                                                Customer Photos ({selectedReturn.returnImages.length})
                                            </p>
                                            <div className="flex gap-2 overflow-x-auto pb-2">
                                                {selectedReturn.returnImages.map((img, idx) => (
                                                    <div key={idx} className="relative aspect-square w-20 rounded-xl overflow-hidden border border-slate-200 shrink-0 cursor-pointer hover:border-slate-400" onClick={() => window.open(img, '_blank')}>
                                                        <img src={img} alt={`Return ${idx}`} className="w-full h-full object-cover" />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {selectedReturn.returnRejectedReason && (
                                        <p className="text-xs text-rose-600 font-semibold">
                                            Rejection reason:{" "}
                                            {selectedReturn.returnRejectedReason}
                                        </p>
                                    )}
                                </div>

                                {/* Tracking Info Section */}
                                {(selectedReturn.returnStatus === "return_pickup_assigned" ||
                                    selectedReturn.returnStatus === "return_in_transit" ||
                                    selectedReturn.returnStatus === "return_drop_pending") && selectedReturn.returnDeliveryBoy && (
                                        <div className="bg-brand-50 rounded-2xl p-4 border border-brand-100 space-y-2">
                                            <div className="flex items-center gap-2">
                                                <div className="h-8 w-8 rounded-lg bg-black  flex items-center justify-center text-white">
                                                    <HiOutlineTruck className="h-5 w-5" />
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-black text-brand-600 uppercase tracking-widest leading-none mb-1">Rider Assigned</p>
                                                    <p className="text-sm font-bold text-slate-900 leading-none">{selectedReturn.returnDeliveryBoy.name}</p>
                                                </div>
                                            </div>
                                            {selectedReturn.returnDeliveryBoy.phone && (
                                                <a
                                                    href={`tel:${selectedReturn.returnDeliveryBoy.phone}`}
                                                    className="inline-flex items-center gap-1.5 text-[11px] font-bold text-brand-700 bg-white px-3 py-1.5 rounded-lg border border-brand-200 shadow-sm hover:bg-brand-100 transition-colors"
                                                >
                                                    📞 {selectedReturn.returnDeliveryBoy.phone}
                                                </a>
                                            )}
                                            {selectedReturn.returnStatus === "return_drop_pending" && (
                                                <p className="text-[10px] font-bold text-brand-800 italic mt-1 bg-white/50 p-2 rounded-lg">
                                                    Rider is at your location. Please check the OTP below to confirm the drop.
                                                </p>
                                            )}
                                        </div>
                                    )}

                                {/* QC Info Section */}
                                {(selectedReturn.returnStatus === "qc_passed" || selectedReturn.returnStatus === "qc_failed") && (
                                    <div className={`rounded-2xl p-4 border space-y-2 ${selectedReturn.returnStatus === "qc_passed" ? "bg-emerald-50 border-emerald-100" : "bg-rose-50 border-rose-100"
                                        }`}>
                                        <div className="flex items-center gap-2">
                                            <div className={`h-8 w-8 rounded-lg flex items-center justify-center text-white ${selectedReturn.returnStatus === "qc_passed" ? "bg-emerald-600" : "bg-rose-600"
                                                }`}>
                                                <HiOutlineInboxStack className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <p className={`text-[10px] font-black uppercase tracking-widest leading-none mb-1 ${selectedReturn.returnStatus === "qc_passed" ? "text-emerald-600" : "text-rose-600"
                                                    }`}>Quality Check Results</p>
                                                <p className="text-sm font-bold text-slate-900 leading-none">
                                                    {selectedReturn.returnStatus === "qc_passed" ? "QC Passed" : "QC Failed"}
                                                </p>
                                            </div>
                                        </div>
                                        {selectedReturn.returnQcNote && (
                                            <div className="bg-white/60 p-3 rounded-xl border border-black/5">
                                                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1">QC Decision Note:</p>
                                                <p className="text-sm text-slate-800 italic leading-relaxed">
                                                    "{selectedReturn.returnQcNote}"
                                                </p>
                                            </div>
                                        )}
                                        {selectedReturn.returnQcAt && (
                                            <p className="text-[10px] font-medium text-slate-500">
                                                Reviewed on: {new Date(selectedReturn.returnQcAt).toLocaleString()}
                                            </p>
                                        )}
                                    </div>
                                )}

                                {/* Quality Check Comparison (2-Way) */}
                                <div className="space-y-3 pt-2">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">
                                        Product Comparison (QC)
                                    </p>
                                    <div className="grid grid-cols-2 gap-3">
                                        {/* 1. Original Listing Image */}
                                        <div className="space-y-1.5 flex flex-col h-full group">
                                            <div className="relative aspect-square rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 shadow-inner group-hover:border-slate-300 transition-colors">
                                                <img
                                                    src={selectedReturn.items?.[0]?.image || "https://placehold.co/400x400/f8fafc/64748b?text=Original"}
                                                    alt="Original"
                                                    className="h-full w-full object-cover"
                                                />
                                                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-900/60 to-transparent p-2">
                                                    <p className="text-[9px] font-black text-white uppercase leading-none">Listing</p>
                                                </div>
                                            </div>
                                        </div>


                                        {/* 3. Return Pickup Proof */}
                                        <div className="space-y-1.5 flex flex-col h-full group">
                                            <div className="relative aspect-square rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 shadow-inner group-hover:border-slate-300 transition-colors flex items-center justify-center">
                                                {selectedReturn.returnPickupImages?.[0] ? (
                                                    <img
                                                        src={selectedReturn.returnPickupImages[0]}
                                                        alt="Return Pickup"
                                                        className="h-full w-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="flex flex-col items-center gap-1.5 text-slate-400 px-3 text-center">
                                                        <HiOutlineInboxStack className="h-5 w-5" />
                                                        <p className="text-[8px] font-bold leading-tight uppercase">Not Picked Yet</p>
                                                    </div>
                                                )}
                                                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-emerald-900/60 to-transparent p-2">
                                                    <p className="text-[9px] font-black text-white uppercase leading-none">Return</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    {selectedReturn.returnPickupCondition && (
                                        <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl">
                                            <div className={`h-2 w-2 rounded-full ${selectedReturn.returnPickupCondition === 'good' ? 'bg-emerald-500' :
                                                    selectedReturn.returnPickupCondition === 'damaged' ? 'bg-rose-500' : 'bg-amber-500'
                                                }`} />
                                            <p className="text-[11px] font-bold text-slate-600">
                                                Rider Condition Report: <span className="uppercase text-slate-900">{selectedReturn.returnPickupCondition}</span>
                                            </p>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <p className="text-xs font-bold text-slate-600 uppercase tracking-widest">
                                        Items
                                    </p>
                                    <div className="space-y-2">
                                        {(selectedReturn.returnItems || []).map(
                                            (item, idx) => (
                                                <div
                                                    key={idx}
                                                    className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100"
                                                >
                                                    <div>
                                                        <p className="text-xs font-bold text-slate-900">
                                                            {item.name}
                                                        </p>
                                                        <p className="text-xs text-slate-500">
                                                            Qty: {item.quantity}
                                                        </p>
                                                    </div>
                                                    <p className="text-xs font-black text-slate-900">
                                                        ₹{item.price * item.quantity}
                                                    </p>
                                                </div>
                                            )
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <p className="text-xs font-bold text-slate-600 uppercase tracking-widest">
                                        Payment Breakdown
                                    </p>
                                    <p className="text-xs text-slate-700">
                                        Product refund:{" "}
                                        <span className="font-black">
                                            {"\u20B9"}
                                            {selectedReturn.returnRefundAmount ||
                                                selectedReturn.pricing?.subtotal ||
                                                0}
                                        </span>
                                    </p>
                                    <p className="text-xs text-slate-700">
                                        Return delivery commission:{" "}
                                        <span className="font-black">
                                            {"\u20B9"}
                                            {selectedReturn.returnDeliveryCommission ||
                                                0}
                                        </span>
                                    </p>
                                </div>

                                {/* Active OTP Display */}
                                {activeOtps[selectedReturn.orderId] && (
                                    <div className="bg-brand-50 border-2 border-dashed border-brand-200 rounded-3xl p-6 text-center space-y-3 animate-in fade-in zoom-in duration-500">
                                        <p className="text-[10px] font-black text-brand-600 uppercase tracking-[0.2em]">
                                            Rider Arrived - Share OTP
                                        </p>
                                        <div className="flex items-center justify-center gap-3">
                                            {activeOtps[selectedReturn.orderId].otp.split('').map((char, i) => (
                                                <div key={i} className="h-14 w-12 bg-white rounded-xl shadow-sm border border-brand-100 flex items-center justify-center text-3xl font-black text-slate-900 border-b-4 border-b-brand-500">
                                                    {char}
                                                </div>
                                            ))}
                                        </div>
                                        <p className="text-[10px] font-bold text-slate-500 italic">
                                            Sharing this code confirms you have received the product.
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div className="px-4 py-3 sm:px-6 sm:py-4 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row gap-3 sm:gap-4 sm:items-center justify-end shrink-0">
                                <div className="flex gap-2 items-center">
                                    <button
                                        onClick={() => setIsDetailsOpen(false)}
                                        className="px-6 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition-all"
                                    >
                                        Close
                                    </button>

                                    {/* Action: Approve/Reject */}
                                    {canManageReturns && selectedReturn.returnStatus === "return_requested" && (
                                        <>
                                            <Button
                                                variant="outline"
                                                className="text-xs font-bold border-rose-200 text-rose-600 hover:bg-rose-50"
                                                onClick={() => setIsRejectModalOpen(true)}
                                            >
                                                Reject Request
                                            </Button>
                                            <Button
                                                className="text-xs font-bold bg-slate-900"
                                                onClick={() => handleApprove(selectedReturn.orderId)}
                                            >
                                                Approve Return
                                            </Button>
                                        </>
                                    )}

                                    {/* Action: Assign Pickup */}
                                    {canManageReturns && (selectedReturn.returnStatus === "return_approved") && (
                                        <Button
                                            className="text-xs font-bold bg-black  hover:bg-brand-700"
                                            disabled={assigningPickup}
                                            onClick={() => handleAssignPickup(selectedReturn.orderId)}
                                        >
                                            {assigningPickup ? (
                                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                            ) : (
                                                <HiOutlineInboxStack className="h-4 w-4 mr-2" />
                                            )}
                                            Assign Pickup
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
            <AnimatePresence>
                {canManageReturns && isRejectModalOpen && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                            onClick={() => !submittingReject && setIsRejectModalOpen(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="w-full max-w-md relative z-10 bg-white rounded-3xl shadow-2xl p-6 space-y-4"
                        >
                            <h3 className="text-xl font-black text-slate-900">Reject Return</h3>
                            <p className="text-sm text-slate-600 font-medium">Please provide a reason for rejecting this return request. This will be shared with the customer.</p>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Reason for Rejection</label>
                                <textarea
                                    className="w-full rounded-2xl border border-slate-200 p-4 text-sm font-medium focus:ring-2 focus:ring-slate-900/10 outline-none transition-all"
                                    rows={4}
                                    placeholder="e.g. Product returned in damaged condition..."
                                    value={rejectReason}
                                    onChange={(e) => setRejectReason(e.target.value)}
                                />
                            </div>

                            <div className="flex gap-2 pt-2">
                                <Button
                                    variant="outline"
                                    className="flex-1 font-bold"
                                    onClick={() => setIsRejectModalOpen(false)}
                                    disabled={submittingReject}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    className="flex-1 font-bold bg-rose-600 hover:bg-rose-700"
                                    onClick={handleReject}
                                    isLoading={submittingReject}
                                    disabled={!rejectReason.trim() || submittingReject}
                                >
                                    Reject Request
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default Returns;
