import React from "react";
import { motion } from "framer-motion";
import { CheckCircle, Circle, Clock, Truck, Home } from "lucide-react";
import { getLegacyStatusFromOrder } from "@/shared/utils/orderStatus";

const STATUS_TO_STAGE = {
  pending: "confirmed",
  confirmed: "confirmed",
  packed: "confirmed",
  out_for_delivery: "out_for_delivery",
  delivered: "delivered",
};

const OrderProgressTracker = ({
  order,
  estimatedArrivalText = "12:45 PM",
  arrivingInText = "8 mins",
  totalDistanceText = "—",
}) => {
  const status = getLegacyStatusFromOrder(order);
  const currentStage = STATUS_TO_STAGE[status] || "confirmed";

  const steps = [
    {
      id: "confirmed",
      label: "Order Confirmed",
      icon: CheckCircle,
      statuses: ["confirmed"],
    },
    {
      id: "out_for_delivery",
      label: "Out for delivery",
      icon: Truck,
      statuses: ["out_for_delivery", "delivered"],
    },
    {
      id: "delivered",
      label: "Delivered",
      icon: Home,
      statuses: ["delivered"],
    },
  ];

  const getStepStatus = (step) => {
    if (status === "cancelled") return "cancelled";

    const stepIndex = steps.findIndex((s) => s.id === step.id);

    if (status === "pending") {
      return stepIndex === 0 ? "active" : "pending";
    }

    if (status === "confirmed" || status === "packed") {
      return stepIndex === 0 ? "completed" : "pending";
    }

    if (status === "out_for_delivery") {
      if (stepIndex === 0) return "completed";
      if (stepIndex === 1) return "active";
      return "pending";
    }

    if (status === "delivered") {
      return "completed";
    }

    return step.id === "confirmed" ? "active" : "pending";
  };

  if (status === "cancelled") {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-3xl p-5">
        <p className="text-center text-rose-700 font-semibold">Order Cancelled</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-4">
        {steps.map((step, index) => {
          const stepStatus = getStepStatus(step);
          const Icon = step.icon;
          const isCompleted = stepStatus === "completed";
          const isActive = stepStatus === "active";
          const isPending = stepStatus === "pending";

          return (
            <div
              key={step.id}
              className="relative transition-opacity duration-200">
              <div className="flex items-center gap-4">
                {/* Icon Circle */}
                <div
                  className={`relative z-10 h-12 w-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isCompleted
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                      : isActive
                      ? "bg-amber-100 text-amber-600 border-2 border-amber-400"
                      : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle size={24} className="fill-current" />
                  ) : isActive ? (
                    <div className="animate-spin">
                      <Icon size={22} />
                    </div>
                  ) : (
                    <Circle size={22} />
                  )}
                </div>

                {/* Label */}
                <div className="flex-1">
                  <p
                    className={`text-sm font-bold ${
                      isCompleted
                        ? "text-slate-900"
                        : isActive
                        ? "text-amber-700"
                        : "text-slate-400"
                    }`}
                  >
                    {step.label}
                  </p>
                  {isActive && (
                    <p className="text-xs text-amber-600 font-medium mt-0.5">
                      In progress...
                    </p>
                  )}
                </div>

                {/* Status Indicator */}
                {isCompleted && (
                  <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center transition-opacity duration-200">
                    <CheckCircle size={14} className="text-primary" />
                  </div>
                )}
              </div>

              {/* Connecting Line */}
              {index < steps.length - 1 && (
                <div className="absolute left-6 top-12 bottom-0 w-0.5 -mb-4">
                  <div
                    className={`h-full w-full ${
                      isCompleted ? "bg-primary" : "bg-slate-200"
                    }`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </motion.div>

      {/* ETA Display */}
      {status !== "delivered" && (
        <div className="mt-6 pt-5 border-t border-slate-100">
          <div className="flex items-center justify-between bg-amber-50 rounded-2xl p-4 gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-amber-100 rounded-xl flex items-center justify-center">
                <Clock size={20} className="text-amber-600" />
              </div>
              <div>
                <p className="text-xs font-bold text-amber-700 uppercase tracking-wider">
                  Estimated Time
                </p>
                <p className="text-lg font-black text-amber-900">{estimatedArrivalText}</p>
              </div>
            </div>
            <div className="text-right flex flex-col items-end gap-1">
              <div>
                <p className="text-xs text-amber-600 font-semibold">Arriving in</p>
                <p className="text-2xl font-black text-amber-900">{arrivingInText}</p>
              </div>
              <div className="inline-flex items-center rounded-full bg-white/80 px-3 py-1 text-[11px] font-bold text-amber-700 ring-1 ring-amber-200">
                Total distance: {totalDistanceText}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderProgressTracker;
