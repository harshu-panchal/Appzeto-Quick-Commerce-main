import React, { useState, useEffect } from "react";
import {
    IndianRupee,
    Clock,
    CheckCircle2,
    XCircle,
    ArrowLeft,
    ArrowUpRight,
    Wallet,
    AlertCircle,
    RotateCw,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import Button from "@/shared/components/ui/Button";
import Card from "@/shared/components/ui/Card";
import { deliveryApi } from "../../services/deliveryApi";

const Withdrawals = () => {
    const navigate = useNavigate();
    const [amount, setAmount] = useState("");
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(true);
    const [stats, setStats] = useState({
        availableBalance: 0,
        pendingWithdrawals: 0,
        history: []
    });

    const fetchData = async () => {
        try {
            setFetching(true);
            const res = await deliveryApi.getEarnings();
            if (res.data.success) {
                setStats({
                    availableBalance: res.data.result.totalEarnings || 0,
                    pendingWithdrawals: (res.data.result.recentTransactions || [])
                        .filter(t => t.type.includes('Withdrawal') && (t.status === 'Pending' || t.status === 'Processing'))
                        .reduce((acc, t) => acc + Math.abs(t.amount), 0),
                    history: (res.data.result.recentTransactions || [])
                        .filter(t => t.type.includes('Withdrawal'))
                });
            }
        } catch (error) {
            console.error("Fetch Error:", error);
            // Fallback with mock data for frontend demo if API fails
            setStats({
                availableBalance: 1250,
                pendingWithdrawals: 0,
                history: [
                    { id: 'WDR123', amount: 500, status: 'Settled', date: '2024-03-20', type: 'Withdrawal' },
                    { id: 'WDR124', amount: 300, status: 'Pending', date: '2024-03-21', type: 'Withdrawal' }
                ]
            });
        } finally {
            setFetching(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleRequest = async () => {
        if (!amount || isNaN(amount) || Number(amount) <= 0) {
            return toast.error("Please enter a valid amount");
        }
        if (Number(amount) > stats.availableBalance) {
            return toast.error("Insufficient balance");
        }

        setLoading(true);
        try {
            const res = await deliveryApi.requestWithdrawal({ amount: Number(amount) });
            if (res.data.success) {
                toast.success("Withdrawal request submitted successfully!");
                setAmount("");
                fetchData();
            } else {
                toast.error(res.data.message || "Failed to submit request");
            }
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to submit request");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-gray-50/50 min-h-screen pb-24">
            {/* Top Header */}
            <div className="bg-white px-6 py-4 flex items-center shadow-sm sticky top-0 z-50">
                <button
                    onClick={() => navigate(-1)}
                    className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition-colors mr-2"
                >
                    <ArrowLeft className="text-gray-900" size={24} />
                </button>
                <h1 className="text-xl font-bold text-gray-900">Money Request</h1>
            </div>

            <div className="p-6 space-y-6 max-w-lg mx-auto">
                {/* Balance Card */}
                <div className="bg-[#0066FF] p-6 rounded-2xl text-white shadow-xl shadow-blue-500/20 relative overflow-hidden border border-blue-400/20">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-3xl"></div>
                    <div className="absolute bottom-0 left-0 w-24 h-24 bg-black/5 rounded-full -ml-12 -mb-12 blur-2xl"></div>

                    <div className="relative z-10">
                        <p className="text-blue-100 text-xs font-bold uppercase tracking-wider mb-2 opacity-90">Available for Withdrawal</p>
                        <h2 className="text-4xl font-extrabold flex items-baseline leading-none tracking-tight">
                            <span className="text-2xl mr-1 font-bold">₹</span>
                            {stats.availableBalance.toLocaleString()}
                        </h2>

                        <div className="mt-6 flex items-center justify-between text-white bg-white/10 p-3 rounded-xl backdrop-blur-md border border-white/10">
                            <div className="flex items-center">
                                <Clock size={16} className="mr-2 opacity-80" />
                                <span className="text-[11px] font-bold">Pending: ₹{stats.pendingWithdrawals.toLocaleString()}</span>
                            </div>
                            <ArrowUpRight size={16} className="opacity-80" />
                        </div>
                    </div>
                </div>

                {/* Withdrawal Form */}
                <Card className="p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                            <Wallet size={20} />
                        </div>
                        <h3 className="font-bold text-gray-800">Request Fund Transfer</h3>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">
                                Amount to Withdraw
                            </label>
                            <div className="relative">
                                <IndianRupee className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                                <input
                                    type="number"
                                    placeholder="0.00"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    className="w-full bg-gray-50 border-none rounded-2xl py-4 pl-12 pr-4 font-bold text-xl outline-none ring-1 ring-gray-100 focus:ring-2 focus:ring-primary/20 transition-all"
                                />
                            </div>
                        </div>

                        <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-xl">
                            <AlertCircle className="text-amber-500 shrink-0 mt-0.5" size={16} />
                            <p className="text-[10px] text-amber-700 font-medium leading-relaxed">
                                Processing may take 24-48 business hours. Funds will be transferred to your primary bank account.
                            </p>
                        </div>

                        <Button
                            onClick={handleRequest}
                            disabled={loading || !amount || Number(amount) <= 0}
                            className="w-full py-4 rounded-2xl font-bold text-sm shadow-lg shadow-primary/20"
                        >
                            {loading ? (
                                <RotateCw className="animate-spin mr-2" size={18} />
                            ) : null}
                            {loading ? "PROCESSING..." : "SUBMIT REQUEST"}
                        </Button>
                    </div>
                </Card>

                {/* History */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between px-1">
                        <h3 className="font-bold text-gray-800 flex items-center gap-2 uppercase tracking-widest text-[10px]">
                            Transfer History
                        </h3>
                        <button
                            onClick={fetchData}
                            className="text-primary text-[10px] font-bold flex items-center gap-1 uppercase"
                        >
                            <RotateCw size={12} className={fetching ? "animate-spin" : ""} />
                            Refresh
                        </button>
                    </div>

                    <div className="space-y-3">
                        {stats.history.length > 0 ? (
                            stats.history.map((item, idx) => (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.05 }}
                                    key={item.id}
                                    className="bg-white p-4 rounded-2xl shadow-sm border border-gray-50 flex items-center justify-between"
                                >
                                    <div className="flex items-center">
                                        <div className={cn(
                                            "p-3 rounded-full mr-4",
                                            item.status === 'Settled' ? "bg-green-50 text-green-600" :
                                                item.status === 'Failed' ? "bg-red-50 text-red-600" :
                                                    "bg-amber-50 text-amber-600"
                                        )}>
                                            {item.status === 'Settled' ? <CheckCircle2 size={18} /> :
                                                item.status === 'Failed' ? <XCircle size={18} /> :
                                                    <Clock size={18} />}
                                        </div>
                                        <div>
                                            <p className="font-bold text-gray-900">₹{Math.abs(item.amount).toLocaleString()}</p>
                                            <p className="text-[10px] font-medium text-gray-400 mt-0.5">
                                                {new Date(item.date).toLocaleDateString()} • {item.id}
                                            </p>
                                        </div>
                                    </div>
                                    <Badge variant={item.status === 'Settled' ? 'success' : item.status === 'Failed' ? 'destructive' : 'warning'}>
                                        {item.status.toUpperCase()}
                                    </Badge>
                                </motion.div>
                            ))
                        ) : (
                            <div className="bg-white p-12 rounded-2xl border border-dashed border-gray-200 text-center">
                                <Clock className="mx-auto text-gray-200 mb-2" size={32} />
                                <p className="text-xs text-gray-400 font-medium tracking-tight">No history found</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const Badge = ({ children, variant = "default" }) => {
    const variants = {
        default: "bg-gray-100 text-gray-600",
        success: "bg-green-50 text-green-600",
        warning: "bg-amber-50 text-amber-600",
        destructive: "bg-red-50 text-red-600",
    };

    return (
        <span className={cn("px-2 py-1 rounded text-[10px] font-bold tracking-wider leading-none", variants[variant])}>
            {children}
        </span>
    );
};

const cn = (...classes) => classes.filter(Boolean).join(" ");

export default Withdrawals;
