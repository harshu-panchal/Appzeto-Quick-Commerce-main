import React from "react";
import { motion } from "framer-motion";
import { IndianRupee, RotateCw } from "lucide-react";
import { toast } from "sonner";
import Card from "@/shared/components/ui/Card";
import Button from "@/shared/components/ui/Button";
import { deliveryApi } from "../services/deliveryApi";

const RUPEE = "\u20B9";

function safeMoney(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

const CodCash = () => {
  const [loading, setLoading] = React.useState(true);
  const [paying, setPaying] = React.useState(false);
  const [payAmount, setPayAmount] = React.useState("");
  const [data, setData] = React.useState({
    systemFloatCOD: 0,
    cashInHand: 0,
    toCollect: [],
    toRemit: [],
  });

  const fetchSummary = async () => {
    try {
      setLoading(true);
      const res = await deliveryApi.getCodCashSummary();
      if (res.data.success && res.data.result) {
        const result = res.data.result;
        const nextToRemit = Array.isArray(result.toRemit) ? result.toRemit : [];
        const nextPayable = nextToRemit.reduce(
          (sum, row) => sum + safeMoney(row.amountNetPending),
          0,
        );
        setData({
          systemFloatCOD: safeMoney(result.systemFloatCOD),
          cashInHand: safeMoney(result.cashInHand),
          toCollect: Array.isArray(result.toCollect) ? result.toCollect : [],
          toRemit: nextToRemit,
        });
        setPayAmount(nextPayable > 0 ? String(nextPayable) : "");
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load COD cash");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0 },
  };

  const pendingOrdersCount =
    (Array.isArray(data.toCollect) ? data.toCollect.length : 0) +
    (Array.isArray(data.toRemit) ? data.toRemit.length : 0);
  const payableNowAmount = (Array.isArray(data.toRemit) ? data.toRemit : []).reduce(
    (sum, row) => sum + safeMoney(row.amountNetPending),
    0,
  );
  const enteredPayAmount = safeMoney(payAmount);

  const handlePayNow = async () => {
    if (paying) return;
    if (enteredPayAmount <= 0) {
      toast.error("Enter an amount to pay");
      return;
    }
    if (enteredPayAmount > payableNowAmount) {
      toast.error(`You can pay up to ${RUPEE}${safeMoney(payableNowAmount).toLocaleString()}`);
      return;
    }

    try {
      setPaying(true);
      const res = await deliveryApi.payCodCashToAdmin({
        amount: enteredPayAmount,
      });
      const result = res.data?.result || {};
      toast.success(
        `Submitted ${RUPEE}${safeMoney(result.totalSubmitted).toLocaleString()} to admin`,
      );
      await fetchSummary();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to submit COD cash");
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="bg-gray-50/50 min-h-screen pb-24">
      <div className="bg-white shadow-sm p-6 sticky top-0 z-30">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="ds-h2 text-gray-900">COD Cash</h1>
            <p className="text-xs text-gray-500 mt-1">
              Simple view of what you should collect and what you should submit.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            disabled={loading}
            onClick={fetchSummary}
            aria-label="Refresh"
          >
            <RotateCw size={18} className={loading ? "animate-spin text-gray-400" : "text-gray-600"} />
          </Button>
        </div>
      </div>

      <motion.div
        className="p-6 space-y-6 max-w-lg mx-auto"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={itemVariants}>
          <Card className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
                  Cash To Submit
                </p>
                <p className="text-3xl font-extrabold text-gray-900">
                  {RUPEE}
                  {safeMoney(data.systemFloatCOD).toLocaleString()}
                </p>
                <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                  This is the platform money you are holding for COD orders.
                  It is calculated after your delivery commission.
                </p>
              </div>
              <div className="p-3 rounded-xl bg-orange-50 text-orange-600">
                <IndianRupee size={22} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
                <p className="text-[11px] font-bold text-gray-500 uppercase">
                  Cash In Hand
                </p>
                <p className="text-lg font-bold text-gray-900">
                  {RUPEE}
                  {safeMoney(data.cashInHand).toLocaleString()}
                </p>
              </div>
              <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
                <p className="text-[11px] font-bold text-gray-500 uppercase">
                  Pending Orders
                </p>
                <p className="text-lg font-bold text-gray-900">{pendingOrdersCount}</p>
              </div>
            </div>

            <div className="mt-4 rounded-xl bg-orange-50 border border-orange-100 p-4">
              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-bold text-orange-700 uppercase">
                      Ready To Pay Now
                    </p>
                    <p className="text-xl font-extrabold text-gray-900 mt-1">
                      {RUPEE}
                      {safeMoney(payableNowAmount).toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-600 mt-1">
                      Only cash from collected orders can be paid now.
                    </p>
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-bold text-orange-700 uppercase">
                    Enter Amount
                  </p>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="flex-1 rounded-xl border border-orange-200 bg-white px-4 py-3">
                      <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">
                        Amount To Pay
                      </label>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-gray-900">{RUPEE}</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={payAmount}
                          onChange={(e) => setPayAmount(e.target.value)}
                          placeholder="Enter amount"
                          disabled={paying}
                          className="w-full bg-transparent outline-none text-lg font-bold text-gray-900"
                        />
                      </div>
                    </div>
                    <Button
                      onClick={handlePayNow}
                      disabled={paying || enteredPayAmount <= 0}
                      className="shrink-0"
                    >
                      {paying ? "Paying..." : "Pay Admin"}
                    </Button>
                  </div>
                  <p className="text-xs text-gray-600 mt-2">
                    Max you can pay right now: {RUPEE}
                    {safeMoney(payableNowAmount).toLocaleString()}
                  </p>
                  {payableNowAmount <= 0 && (
                    <p className="text-xs text-orange-700 mt-1">
                      You can pay after COD cash is marked as collected.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="p-6">
            <h3 className="font-bold text-gray-900 mb-1">To Collect From Customer</h3>
            <p className="text-xs text-gray-500 mb-4">
              These COD orders are not marked as collected yet.
            </p>

            <div className="space-y-2">
              {(Array.isArray(data.toCollect) ? data.toCollect : []).slice(0, 20).map((row) => (
                <div
                  key={`collect-${row.orderId}`}
                  className="flex items-center justify-between rounded-xl border border-orange-100 bg-orange-50/40 p-3"
                >
                  <div>
                    <p className="text-sm font-bold text-gray-900">Order #{row.orderId}</p>
                    <p className="text-xs text-gray-600">
                      Collect {RUPEE}
                      {safeMoney(row.amountGross).toLocaleString()} (gross)
                    </p>
                  </div>
                  <p className="text-sm font-extrabold text-orange-700">
                    {RUPEE}
                    {safeMoney(row.amountNetExpected).toLocaleString()}
                  </p>
                </div>
              ))}

              {(!Array.isArray(data.toCollect) || data.toCollect.length === 0) && (
                <div className="rounded-xl border border-dashed border-gray-200 p-4 text-center text-sm text-gray-400">
                  Nothing to collect right now.
                </div>
              )}
            </div>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="p-6">
            <h3 className="font-bold text-gray-900 mb-1">To Submit To Platform</h3>
            <p className="text-xs text-gray-500 mb-4">
              These orders are marked collected. Submit the net cash shown here.
            </p>

            <div className="space-y-2">
              {(Array.isArray(data.toRemit) ? data.toRemit : []).slice(0, 20).map((row) => (
                <div
                  key={`remit-${row.orderId}`}
                  className="flex items-center justify-between rounded-xl border border-gray-100 bg-white p-3"
                >
                  <div>
                    <p className="text-sm font-bold text-gray-900">Order #{row.orderId}</p>
                    <p className="text-xs text-gray-500">Submit to platform (net)</p>
                  </div>
                  <p className="text-sm font-extrabold text-gray-900">
                    {RUPEE}
                    {safeMoney(row.amountNetPending).toLocaleString()}
                  </p>
                </div>
              ))}

              {(!Array.isArray(data.toRemit) || data.toRemit.length === 0) && (
                <div className="rounded-xl border border-dashed border-gray-200 p-4 text-center text-sm text-gray-400">
                  Nothing to submit right now.
                </div>
              )}
            </div>
          </Card>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default CodCash;
