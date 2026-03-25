import React, { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  IndianRupee,
  TrendingUp,
  Wallet,
  ArrowUpRight,
  Filter,
  Download,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import Button from "@/shared/components/ui/Button";
import Card from "@/shared/components/ui/Card";
import { deliveryApi } from "../services/deliveryApi";

const Earnings = () => {
  const [activeTab, setActiveTab] = useState("weekly");
  const [loading, setLoading] = useState(true);
  const [earningsData, setEarningsData] = useState({
    totalEarnings: 0,
    incentives: 0,
    bonuses: 0,
    onlinePay: 0,
    cashCollected: 0,
    chartData: [],
    recentTransactions: []
  });

  const fetchEarnings = async () => {
    try {
      setLoading(true);
      const response = await deliveryApi.getEarnings();
      if (response.data.success && response.data.result) {
        const result = response.data.result;
        setEarningsData({
          totalEarnings: result.totalEarnings || 0,
          incentives: result.incentives || 0,
          bonuses: result.bonuses || 0,
          onlinePay: result.onlinePay || 0,
          cashCollected: result.cashCollected || 0,
          chartData: result.chartData || [],
          recentTransactions: result.transactions || result.recentTransactions || []
        });
      }
    } catch (error) {
      toast.error("Failed to fetch earnings data");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchEarnings();
  }, []);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50/50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50/50 min-h-screen pb-24">
      {/* Header */}
      <div className="bg-white shadow-sm p-6 sticky top-0 z-30">
        <div className="flex justify-between items-center mb-4">
          <h1 className="ds-h2 text-gray-900">My Earnings</h1>
          <Button variant="ghost" size="icon">
            <Download size={20} className="text-gray-600" />
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex bg-gray-100 p-1 rounded-xl">
          {["today", "weekly", "monthly"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all capitalize ${activeTab === tab
                ? "bg-white text-primary shadow-sm"
                : "text-gray-500 hover:text-gray-700"
                }`}>
              {tab}
            </button>
          ))}
        </div>
      </div>

      <motion.div
        className="p-6 space-y-6 max-w-lg mx-auto"
        variants={containerVariants}
        initial="hidden"
        animate="visible">
        {/* Total Earnings Card */}
        <motion.div variants={itemVariants}>
          <div className="bg-gradient-to-br from-primary to-blue-600 rounded-2xl p-6 text-white shadow-lg shadow-primary/30 relative overflow-hidden">
            {/* Background pattern */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl"></div>
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full -ml-10 -mb-10 blur-xl"></div>

            <p className="text-blue-100 font-medium text-sm uppercase tracking-wide mb-1 relative z-10">
              Total Earnings
            </p>
            <div className="flex items-baseline mb-6 relative z-10">
              <span className="text-3xl font-bold mr-1">₹</span>
              <span className="text-5xl font-extrabold tracking-tight">
                {earningsData.totalEarnings.toLocaleString()}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/20 relative z-10">
              <div>
                <p className="text-blue-100 text-xs mb-1">Incentives</p>
                <p className="font-bold text-lg">+₹{earningsData.incentives}</p>
              </div>
              <div>
                <p className="text-blue-100 text-xs mb-1">Bonuses</p>
                <p className="font-bold text-lg">+₹{earningsData.bonuses}</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Chart */}
        <motion.div variants={itemVariants}>
          <Card className="p-6 h-80">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-gray-800 flex items-center">
                <TrendingUp size={20} className="mr-2 text-green-500" />
                Earnings Trend
              </h3>
              <Button variant="ghost" size="sm" className="h-8 text-xs">
                Last 7 Days
              </Button>
            </div>
            <ResponsiveContainer width="100%" height="85%">
              <BarChart data={earningsData.chartData} barSize={20}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#f3f4f6"
                />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: "#9ca3af" }}
                  dy={10}
                />
                <Tooltip
                  cursor={{ fill: "#f9fafb" }}
                  contentStyle={{
                    borderRadius: "12px",
                    border: "none",
                    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                  }}
                />
                <Bar
                  dataKey="earnings"
                  fill="var(--primary)"
                  radius={[4, 4, 0, 0]}
                  stackId="a"
                />
                <Bar
                  dataKey="incentives"
                  fill="#93c5fd"
                  radius={[4, 4, 0, 0]}
                  stackId="a"
                />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </motion.div>

        {/* Breakdown */}
        <motion.div variants={itemVariants} className="grid grid-cols-2 gap-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 bg-green-50 text-green-600 rounded-lg">
                <Wallet size={20} />
              </div>
              <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded">
                +8%
              </span>
            </div>
            <p className="text-gray-500 text-xs font-medium uppercase">
              Online Pay
            </p>
            <p className="text-xl font-bold text-gray-900">₹{earningsData.onlinePay.toLocaleString()}</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 bg-orange-50 text-orange-600 rounded-lg">
                <IndianRupee size={20} />
              </div>
              <span className="text-xs font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded">
                0%
              </span>
            </div>
            <p className="text-gray-500 text-xs font-medium uppercase">
              Cash (COD)
            </p>
            <p className="text-xl font-bold text-gray-900">₹{earningsData.cashCollected.toLocaleString()}</p>
          </Card>
        </motion.div>

        {/* Recent Transactions */}
        <motion.div variants={itemVariants}>
          <Card className="overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="font-bold text-gray-800">Recent Withdrawals</h3>
              <Button
                variant="link"
                className="text-primary text-xs font-bold h-auto p-0">
                View All
              </Button>
            </div>
            <div className="divide-y divide-gray-100">
              {earningsData.recentTransactions.length > 0 ? earningsData.recentTransactions.map((txn, idx) => (
                <div
                  key={txn._id || txn.id || `txn-${idx}`}
                  className="p-4 flex justify-between items-center hover:bg-gray-50 transition-colors cursor-pointer">
                  <div className="flex items-center">
                    <div
                      className={`p-2 rounded-full mr-3 ${txn.status === "Settled" || txn.status === "Completed" ? "bg-green-100 text-green-600" : "bg-yellow-100 text-yellow-600"}`}>
                      <ArrowUpRight size={16} />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900">{txn.type}</p>
                      <p className="text-xs text-gray-500">
                        {txn.date || new Date(txn.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} • {txn.id || (txn._id ? txn._id.toString().slice(-6).toUpperCase() : 'N/A')}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-900">{txn.type.includes('Withdrawal') ? '-' : '+'}₹{txn.amount}</p>
                    <p
                      className={`text-xs font-bold ${txn.status === "Settled" || txn.status === "Completed" ? "text-green-500" : "text-yellow-500"}`}>
                      {txn.status}
                    </p>
                  </div>
                </div>
              )) : (
                <div className="p-12 text-center text-gray-400 text-sm italic">
                  No recent earnings or withdrawals.
                </div>
              )}
            </div>
          </Card>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default Earnings;
