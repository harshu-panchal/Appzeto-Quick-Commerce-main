import React from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle2, Clock3, ShieldAlert, Store } from "lucide-react";
import { useAuth } from "@core/context/AuthContext";
import { useSettings } from "@core/context/SettingsContext";

const ApplicationPending = () => {
  const location = useLocation();
  const { isAuthenticated, role, user, isLoading } = useAuth();
  const { settings } = useSettings();

  const appName = settings?.appName || "App";
  const logoUrl = settings?.logoUrl || "";

  const applicationStatus =
    location.state?.applicationStatus ||
    user?.applicationStatus ||
    (user?.isVerified ? "approved" : "pending");
  const rejectionReason = location.state?.rejectionReason || user?.rejectionReason || "";

  if (!isLoading && isAuthenticated && role === "seller") {
    const isApproved =
      user?.isVerified === true &&
      user?.isActive === true &&
      applicationStatus === "approved";

    if (isApproved) {
      return <Navigate to="/seller" replace />;
    }
  }

  const isRejected = applicationStatus === "rejected";

  return (
    <div className="min-h-screen bg-slate-950 relative overflow-hidden font-['Outfit']">
      <div className="absolute inset-0">
        <div className="absolute top-[-20%] right-[-10%] h-[420px] w-[420px] rounded-full bg-amber-400/10 blur-3xl" />
        <div className="absolute bottom-[-20%] left-[-10%] h-[420px] w-[420px] rounded-full bg-brand-400/10 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-4xl items-center justify-center px-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="w-full rounded-3xl border border-white/10 bg-white/[0.04] p-6 md:p-10 shadow-2xl backdrop-blur-xl"
        >
          <div className="mb-8 flex items-center justify-between gap-4">
            <div className="inline-flex items-center gap-3 rounded-xl border border-white/15 bg-white/5 px-4 py-2">
              {logoUrl ? (
                <img src={logoUrl} alt={`${appName} logo`} className="h-8 w-8 object-contain" />
              ) : (
                <Store className="h-5 w-5 text-white/80" />
              )}
              <span className="text-sm font-bold text-white/90">{appName} Seller</span>
            </div>
            <div
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-widest ${
                isRejected
                  ? "bg-rose-500/20 text-rose-200"
                  : "bg-amber-400/20 text-amber-100"
              }`}
            >
              {isRejected ? <ShieldAlert className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
              {isRejected ? "Application Rejected" : "Application Pending"}
            </div>
          </div>

          <h1 className="text-3xl md:text-4xl font-black text-white leading-tight">
            {isRejected
              ? "Your seller application needs action."
              : "Your seller application is under review."}
          </h1>
          <p className="mt-4 text-base md:text-lg text-slate-200/90 font-medium max-w-2xl">
            {isRejected
              ? "You cannot access the seller dashboard yet. Please contact admin support and re-submit with the required details."
              : "Dashboard access unlocks automatically once admin approves your account."}
          </p>

          {rejectionReason ? (
            <div className="mt-6 rounded-2xl border border-rose-300/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
              <span className="font-black uppercase tracking-widest text-[11px]">Reason</span>
              <p className="mt-1 font-medium">{rejectionReason}</p>
            </div>
          ) : null}

          {!isRejected ? (
            <div className="mt-6 rounded-2xl border border-brand-400/30 bg-brand-500/10 px-4 py-3 text-sm text-brand-200 flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0 text-brand-400" />
              <p className="font-semibold">
                Approval usually takes less than 24 hours. You can return to login and try again later.
              </p>
            </div>
          ) : null}

          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <Link
              to="/seller/auth"
              className="inline-flex items-center justify-center rounded-xl bg-white text-slate-900 px-5 py-3 text-sm font-black tracking-wide hover:bg-slate-100 transition-colors"
            >
              Back To Seller Login
            </Link>
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/5 text-white px-5 py-3 text-sm font-bold hover:bg-white/10 transition-colors"
            >
              Go To Home
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default ApplicationPending;
