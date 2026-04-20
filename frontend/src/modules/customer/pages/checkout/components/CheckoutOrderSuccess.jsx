import React from "react";
import { Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * CheckoutOrderSuccess
 *
 * Props:
 *   orderId – string order ID (last 6 chars shown)
 *   show    – boolean — controls visibility via AnimatePresence
 */
const CheckoutOrderSuccess = React.memo(function CheckoutOrderSuccess({ orderId, show }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center p-6 text-center">
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", damping: 12 }}
            className="w-24 h-24 bg-brand-100 rounded-full flex items-center justify-center text-primary mb-6">
            <Check size={48} strokeWidth={4} />
          </motion.div>
          <motion.h2
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-3xl font-black text-slate-800 mb-2">
            Order placed
          </motion.h2>
          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-slate-500 font-medium mb-8">
            #{orderId?.slice(-6)} — waiting for the seller to accept (60s). If
            they don&apos;t, the order will cancel automatically.
            <br />
            Redirecting to order details…
          </motion.p>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: "100%" }}
            transition={{ duration: 2.5, ease: "linear" }}
            className="w-48 h-1.5 bg-brand-100 rounded-full overflow-hidden">
            <div className="h-full bg-primary" />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

export default CheckoutOrderSuccess;
