import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ArrowUpRight, ArrowDownLeft, ReceiptIndianRupee } from 'lucide-react';
import { customerApi } from '../services/customerApi';

const OrderTransactionsPage = () => {
    const navigate = useNavigate();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchOrders = async () => {
            try {
                const res = await customerApi.getMyOrders();
                setOrders(res.data.results || []);
            } catch (error) {
                console.error('Failed to fetch orders for transaction history:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchOrders();
    }, []);

    return (
        <div className="min-h-screen bg-slate-50 pb-24 font-sans">
            <div className="sticky top-0 z-30 bg-slate-50/95 backdrop-blur-sm px-4 pt-4 pb-3 border-b border-slate-200/60 mb-4 flex items-center gap-2">
                <button
                    onClick={() => navigate(-1)}
                    className="w-10 h-10 flex items-center justify-center hover:bg-slate-200/70 rounded-full transition-colors -ml-1"
                >
                    <ChevronLeft size={22} className="text-slate-800" />
                </button>
                <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Order Transactions</h1>
            </div>

            <div className="max-w-2xl mx-auto px-4 pt-1 relative z-20">
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                        <div>
                            <h3 className="text-base font-semibold text-slate-800">Transaction History</h3>
                            <p className="text-[11px] text-slate-500">
                                Based on your recent orders
                            </p>
                        </div>
                        <ReceiptIndianRupee className="h-5 w-5 text-slate-400" />
                    </div>

                    {loading ? (
                        <div className="py-10 flex items-center justify-center text-xs text-slate-400 font-semibold">
                            Loading transactions...
                        </div>
                    ) : orders.length === 0 ? (
                        <div className="py-10 flex flex-col items-center justify-center text-center px-6">
                            <p className="text-sm font-semibold text-slate-500 mb-1">
                                No transactions yet
                            </p>
                            <p className="text-[11px] text-slate-400">
                                Place an order to see your payment history here.
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {orders.map((order) => {
                                const isRefund = order.paymentStatus === 'refunded';
                                const amount = order.totalAmount || order.payableAmount || 0;
                                const createdAt = order.createdAt ? new Date(order.createdAt) : null;

                                return (
                                    <div
                                        key={order._id}
                                        className="px-4 py-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div
                                                className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                                                    isRefund
                                                        ? 'bg-amber-50 text-amber-600'
                                                        : 'bg-slate-100 text-slate-700'
                                                }`}
                                            >
                                                {isRefund ? (
                                                    <ArrowUpRight size={19} />
                                                ) : (
                                                    <ArrowDownLeft size={19} />
                                                )}
                                            </div>
                                            <div>
                                                <h4 className="font-semibold text-slate-800 text-sm">
                                                    {isRefund ? 'Refund' : 'Order Payment'}
                                                </h4>
                                                <p className="text-[11px] text-slate-500">
                                                    #{order.orderId || order._id?.slice(-8)} •{' '}
                                                    {order.paymentMethod || 'Online'}
                                                </p>
                                                {createdAt && (
                                                    <p className="text-[11px] text-slate-500 mt-0.5">
                                                        {createdAt.toLocaleDateString()},{' '}
                                                        {createdAt.toLocaleTimeString([], {
                                                            hour: '2-digit',
                                                            minute: '2-digit',
                                                        })}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <div
                                            className={`text-sm font-semibold ${
                                                isRefund ? 'text-amber-600' : 'text-slate-900'
                                            }`}
                                        >
                                            {isRefund ? '+' : '-'}₹{amount}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default OrderTransactionsPage;

