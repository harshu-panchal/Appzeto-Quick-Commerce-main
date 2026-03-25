import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import {
    ChevronLeft,
    Building2,
    User,
    Mail,
    Phone,
    MapPin,
    Star,
    Calendar,
    Wallet,
    TrendingUp,
    ShoppingBag,
    History,
    Banknote,
    Clock,
    ArrowUpRight,
    Edit3,
    MoreVertical,
    CheckCircle2,
    XCircle,
    RotateCw,
    Search,
    Download
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@shared/components/ui/Toast';
import Modal from '@shared/components/ui/Modal';
import { motion } from 'framer-motion';

const SellerDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [activeTab, setActiveTab] = useState('orders');
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Mock Data for Seller
    const [seller, setSeller] = useState({
        id: id || 'SEL-001',
        shopName: 'Fresh Mart Superstore',
        ownerName: 'Rahul Sharma',
        email: 'rahul@freshmart.com',
        phone: '+91 98765 43210',
        category: 'Grocery',
        rating: 4.8,
        status: 'active',
        joinedDate: '12 Jan 2024',
        location: 'Mumbai, Maharashtra',
        image: 'https://images.unsplash.com/photo-1534723452862-4c874018d66d?auto=format&fit=crop&q=80&w=200',
        walletBalance: 24500,
        totalOrders: 1450,
        totalRevenue: 540000,
        commissionRate: '10%',
        coords: { lat: 19.0760, lng: 72.8777 },
        serviceRadius: 5,
        bankInfo: {
            bankName: 'HDFC Bank',
            accountNo: 'XXXX XXXX 1234',
            ifsc: 'HDFC0001234'
        }
    });

    const handleRefresh = () => {
        setIsRefreshing(true);
        setTimeout(() => {
            setIsRefreshing(false);
            showToast('Seller data synchronized', 'success');
        }, 800);
    };

    return (
        <div className="ds-section-spacing animate-in fade-in slide-in-from-bottom-4 duration-700 pb-12">
            {/* Header / Action Bar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate('/admin/sellers/active')}
                        className="p-2.5 bg-white ring-1 ring-slate-200 rounded-xl hover:bg-slate-50 transition-all shadow-sm group"
                    >
                        <ChevronLeft className="h-5 w-5 text-slate-500 group-hover:-translate-x-0.5 transition-transform" />
                    </button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="ds-h1">{seller.shopName}</h1>
                            <Badge variant="success" className="text-[10px] font-black uppercase tracking-widest">{seller.status}</Badge>
                        </div>
                        <p className="ds-description mt-1 text-slate-500 font-medium">Owned by {seller.ownerName} • {seller.category}</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={handleRefresh}
                        className="flex items-center gap-2 px-5 py-3 bg-white ring-1 ring-slate-200 text-slate-700 rounded-2xl text-xs font-bold hover:bg-slate-50 transition-all"
                    >
                        <RotateCw className={cn("h-4 w-4 text-primary", isRefreshing && "animate-spin")} />
                        SYNC DATA
                    </button>
                    <button className="flex items-center gap-2 px-5 py-3 bg-slate-900 text-white rounded-2xl text-xs font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-200">
                        <Edit3 className="h-4 w-4" />
                        EDIT SHOP
                    </button>
                </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    { label: 'Wallet Balance', value: `₹${seller.walletBalance.toLocaleString()}`, icon: Wallet, color: 'emerald', sub: 'Available for Payout' },
                    { label: 'Total Revenue', value: `₹${(seller.totalRevenue / 1000).toFixed(1)}k`, icon: TrendingUp, color: 'blue', sub: 'Gross Sales' },
                    { label: 'Orders Handled', value: seller.totalOrders, icon: ShoppingBag, color: 'indigo', sub: 'Lifetime Orders' },
                    { label: 'Store Rating', value: `${seller.rating} / 5.0`, icon: Star, color: 'amber', sub: 'Based on 450+ reviews' },
                ].map((stat, i) => (
                    <Card key={i} className="p-6 border-none shadow-xl ring-1 ring-slate-100 bg-white group hover:ring-primary/20 transition-all">
                        <div className="flex items-center justify-between mb-4">
                            <div className={cn("p-2.5 rounded-2xl",
                                stat.color === 'emerald' && "bg-emerald-50 text-emerald-600",
                                stat.color === 'blue' && "bg-blue-50 text-blue-600",
                                stat.color === 'indigo' && "bg-indigo-50 text-indigo-600",
                                stat.color === 'amber' && "bg-amber-50 text-amber-600",
                            )}>
                                <stat.icon className="h-5 w-5" />
                            </div>
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stat.sub}</span>
                        </div>
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">{stat.label}</h4>
                        <h3 className="text-2xl font-black text-slate-900">{stat.value}</h3>
                    </Card>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Main Content Area */}
                <div className="lg:col-span-2 space-y-8">
                    {/* Tabs Navigation */}
                    <div className="flex items-center gap-2 p-1 bg-slate-100/50 backdrop-blur-sm rounded-2xl w-fit">
                        {[
                            { id: 'orders', label: 'Order History', icon: History },
                            { id: 'transactions', label: 'Transactions', icon: Banknote },
                            { id: 'delivery', label: 'Delivery', icon: MapPin },
                            { id: 'payouts', label: 'Withdrawals', icon: Wallet },
                            { id: 'info', label: 'Store Info', icon: Building2 },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={cn(
                                    "px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2",
                                    activeTab === tab.id
                                        ? "bg-white text-primary shadow-sm ring-1 ring-slate-200"
                                        : "text-slate-400 hover:text-slate-600"
                                )}
                            >
                                <tab.icon className="h-4 w-4" />
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Tab Content */}
                    <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-xl overflow-hidden min-h-[500px]">
                        {activeTab === 'orders' && (
                            <div className="animate-in fade-in slide-in-from-right-2 duration-300">
                                <div className="p-4 pb-4 flex items-center justify-between border-b border-slate-50">
                                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest">Recent Orders</h4>
                                    <div className="flex items-center gap-4">
                                        <div className="relative group">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                            <input
                                                type="text"
                                                placeholder="Order ID..."
                                                className="pl-9 pr-4 py-2 bg-slate-50 border-none rounded-xl text-xs font-bold w-40 outline-none ring-1 ring-transparent focus:ring-primary/20"
                                            />
                                        </div>
                                        <button className="p-2 bg-slate-50 rounded-xl text-slate-400 hover:text-primary transition-colors">
                                            <Download className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="bg-slate-50/50 border-b border-slate-50">
                                                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Order ID</th>
                                                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Customer</th>
                                                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Status</th>
                                                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {[
                                                { id: '#ORD-9912', customer: 'Aarav Patel', status: 'delivered', amount: 850, date: 'Today, 11:30 AM' },
                                                { id: '#ORD-9884', customer: 'Ishani Roy', status: 'processing', amount: 1240, date: 'Today, 09:15 AM' },
                                                { id: '#ORD-9821', customer: 'Kabir Singh', status: 'delivered', amount: 450, date: 'Yesterday' },
                                                { id: '#ORD-9750', customer: 'Priya Verma', status: 'cancelled', amount: 2100, date: 'Yesterday' },
                                                { id: '#ORD-9690', customer: 'Rohan Mehra', status: 'delivered', amount: 150, date: '14 Feb' },
                                            ].map((order, i) => (
                                                <tr key={i} className="group hover:bg-slate-50/50 transition-colors cursor-pointer">
                                                    <td className="px-4 py-5">
                                                        <span className="text-xs font-black text-slate-900">{order.id}</span>
                                                        <p className="text-[10px] font-bold text-slate-400">{order.date}</p>
                                                    </td>
                                                    <td className="px-4 py-5">
                                                        <span className="text-xs font-bold text-slate-700">{order.customer}</span>
                                                    </td>
                                                    <td className="px-4 py-5 text-center">
                                                        <Badge
                                                            variant={order.status === 'delivered' ? 'success' : order.status === 'cancelled' ? 'danger' : 'warning'}
                                                            className="text-[9px] font-black"
                                                        >
                                                            {order.status.toUpperCase()}
                                                        </Badge>
                                                    </td>
                                                    <td className="px-4 py-5 text-right font-black text-slate-900">
                                                        ₹{order.amount.toLocaleString()}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {activeTab === 'transactions' && (
                            <div className="animate-in fade-in slide-in-from-right-2 duration-300 p-4">
                                <div className="flex items-center justify-between mb-8">
                                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">Financial ledger</h4>
                                    <Badge variant="blue" className="text-[9px] font-black">LAST 30 DAYS</Badge>
                                </div>
                                <div className="space-y-4">
                                    {[
                                        { id: 'TXN-8821', type: 'credit', desc: 'Order #ORD-9912 Settlement', amount: 765, date: 'Today, 14:20' },
                                        { id: 'TXN-8810', type: 'debit', desc: 'Withdrawal to Bank', amount: 15000, date: 'Yesterday' },
                                        { id: 'TXN-8792', type: 'credit', desc: 'Order #ORD-9821 Settlement', amount: 405, date: 'Yesterday' },
                                        { id: 'TXN-8750', type: 'credit', desc: 'Order #ORD-9690 Settlement', amount: 135, date: '14 Feb' },
                                    ].map((txn, i) => (
                                        <div key={i} className="flex items-center justify-between p-5 bg-slate-50 rounded-2xl border border-slate-100 group hover:bg-white hover:shadow-md transition-all">
                                            <div className="flex items-center gap-4">
                                                <div className={cn("p-2 rounded-xl flex items-center justify-center",
                                                    txn.type === 'credit' ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"
                                                )}>
                                                    {txn.type === 'credit' ? <TrendingUp className="h-4 w-4" /> : <Banknote className="h-4 w-4" />}
                                                </div>
                                                <div>
                                                    <p className="text-xs font-black text-slate-900">{txn.desc}</p>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{txn.id} • {txn.date}</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className={cn("text-sm font-black", txn.type === 'credit' ? "text-emerald-600" : "text-rose-600")}>
                                                    {txn.type === 'credit' ? '+' : '-'} ₹{txn.amount.toLocaleString()}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeTab === 'delivery' && (
                            <div className="animate-in fade-in slide-in-from-right-2 duration-300 h-[500px] relative overflow-hidden group">
                                {/* Map Background Overlay */}
                                <div className="absolute inset-0 grayscale-[0.3] contrast-[1.1] opacity-40 bg-[url('https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&q=80&w=2000')]" />
                                <div className="absolute inset-0 bg-gradient-to-tr from-slate-200/50 via-transparent to-primary/5" />

                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="relative">
                                        {/* Service Area Radar */}
                                        <motion.div
                                            initial={{ scale: 0, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            transition={{ duration: 1, ease: "easeOut" }}
                                            className="rounded-full bg-primary/20 border-2 border-primary/40 shadow-[0_0_50px_rgba(var(--primary),0.3)] animate-pulse"
                                            style={{
                                                width: `${seller.serviceRadius * 40}px`,
                                                height: `${seller.serviceRadius * 40}px`
                                            }}
                                        />
                                        {/* Store Marker */}
                                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                                            <div className="h-10 w-10 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-2xl ring-4 ring-white z-10 relative">
                                                <Building2 className="h-5 w-5" />
                                            </div>
                                            <div className="absolute inset-0 bg-primary rounded-2xl animate-ping opacity-20" />
                                        </div>
                                    </div>
                                </div>

                                {/* Floating Legend */}
                                <div className="absolute top-6 left-6 flex flex-col gap-2">
                                    <div className="bg-white/90 backdrop-blur px-4 py-2 rounded-xl shadow-lg border border-white/50">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Coverage View</p>
                                        <h5 className="text-sm font-black text-slate-900">{seller.serviceRadius}km Delivery Area</h5>
                                    </div>
                                </div>
                                <div className="absolute bottom-6 right-6 p-4 max-w-[200px] bg-slate-900/90 backdrop-blur rounded-2xl text-white shadow-2xl border border-white/10">
                                    <p className="text-[9px] font-black opacity-60 uppercase mb-1">Live Telemetry</p>
                                    <p className="text-[10px] font-bold leading-relaxed">System monitoring active traffic within the {seller.serviceRadius}km designated boundary.</p>
                                </div>
                            </div>
                        )}

                        {activeTab === 'payouts' && (
                            <div className="animate-in fade-in slide-in-from-right-2 duration-300 p-4 text-center py-20">
                                <div className="h-20 w-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
                                    <Clock className="h-10 w-10 text-slate-200" />
                                </div>
                                <h4 className="text-lg font-black text-slate-900 uppercase">Withdrawal tracking</h4>
                                <p className="text-sm font-bold text-slate-400 mt-2 max-w-xs mx-auto">View withdrawal history and pending requests here.</p>
                                <button className="mt-8 px-4 py-3 bg-slate-950 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:-translate-y-1 shadow-xl shadow-slate-200 transition-all">
                                    START MANUAL PAYOUT
                                </button>
                            </div>
                        )}

                        {activeTab === 'info' && (
                            <div className="animate-in fade-in slide-in-from-right-2 duration-300 p-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-left">
                                    <div className="ds-section-spacing">
                                        <div>
                                            <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Store Identity</h5>
                                            <div className="space-y-4">
                                                <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                                    <div className="h-12 w-12 rounded-xl bg-slate-900 text-white flex items-center justify-center">
                                                        <Building2 className="h-6 w-6" />
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-black text-slate-900">{seller.shopName}</p>
                                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{seller.id}</p>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Commission</p>
                                                        <p className="text-xs font-black text-slate-900">{seller.commissionRate}</p>
                                                    </div>
                                                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Joined</p>
                                                        <p className="text-xs font-black text-slate-900">{seller.joinedDate}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div>
                                            <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Bank Verification</h5>
                                            <div className="p-6 bg-emerald-50/50 rounded-xl border border-emerald-100 space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <p className="text-xs font-bold text-slate-600">Account Verified</p>
                                                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                                </div>
                                                <div>
                                                    <p className="text-[9px] font-black text-emerald-700/50 uppercase tracking-widest mb-1">Settlement Account</p>
                                                    <p className="text-sm font-black text-slate-900">{seller.bankInfo.bankName}</p>
                                                    <p className="text-xs font-bold text-slate-500 font-mono mt-0.5">{seller.bankInfo.accountNo}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="ds-section-spacing">
                                        <div>
                                            <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Operational Status</h5>
                                            <div className="p-6 bg-slate-900 rounded-xl text-white">
                                                <div className="flex items-center justify-between mb-6">
                                                    <div className="flex items-center gap-2">
                                                        <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                                        <span className="text-[10px] font-black uppercase tracking-widest">LIVE NOW</span>
                                                    </div>
                                                    <button className="text-[10px] font-black text-rose-400 uppercase hover:underline">Force Close</button>
                                                </div>
                                                <div className="space-y-4 opacity-70">
                                                    <div className="flex items-center justify-between py-2 border-b border-white/10">
                                                        <span className="text-xs font-bold">Visibility</span>
                                                        <span className="text-xs font-black uppercase tracking-widest">Global</span>
                                                    </div>
                                                    <div className="flex items-center justify-between py-2">
                                                        <span className="text-xs font-bold">Delivery Partner</span>
                                                        <span className="text-xs font-black uppercase tracking-widest text-emerald-400">Integrated</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="p-6 bg-rose-50 rounded-xl border border-rose-100">
                                            <h5 className="text-[10px] font-black text-rose-600 uppercase tracking-widest mb-2 flex items-center gap-2">
                                                <XCircle className="h-4 w-4" />
                                                Safety Controls
                                            </h5>
                                            <p className="text-[10px] font-bold text-slate-500 leading-relaxed">Suspend this store immediately from the consumer app in case of policy violations.</p>
                                            <button className="w-full mt-4 py-3 bg-rose-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-rose-200 hover:bg-rose-700 transition-all">
                                                SUSPEND STORE
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </Card>
                </div>

                {/* Sidebar Context */}
                <div className="space-y-6">
                    {/* Owner Card */}
                    <Card className="p-4 border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-xl text-left">
                        <div className="flex items-center gap-4 mb-8">
                            <div className="h-16 w-16 bg-slate-100 rounded-2xl flex items-center justify-center overflow-hidden">
                                <User className="h-8 w-8 text-slate-300" />
                            </div>
                            <div>
                                <h4 className="text-lg font-black text-slate-900">{seller.ownerName}</h4>
                                <Badge variant="primary" className="text-[8px] font-black tracking-[0.2em] px-2">PARTNER</Badge>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center gap-3 text-slate-500 hover:text-primary transition-colors cursor-pointer">
                                <div className="p-2 bg-slate-50 rounded-xl">
                                    <Mail className="h-4 w-4" />
                                </div>
                                <span className="text-xs font-bold">{seller.email}</span>
                            </div>
                            <div className="flex items-center gap-3 text-slate-500 hover:text-primary transition-colors cursor-pointer">
                                <div className="p-2 bg-slate-50 rounded-xl">
                                    <Phone className="h-4 w-4" />
                                </div>
                                <span className="text-xs font-bold">{seller.phone}</span>
                            </div>
                            <div className="flex items-center gap-3 text-slate-500">
                                <div className="p-2 bg-slate-50 rounded-xl">
                                    <MapPin className="h-4 w-4" />
                                </div>
                                <span className="text-xs font-bold leading-relaxed">{seller.location}</span>
                            </div>
                        </div>

                        <button className="w-full mt-8 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-900 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all">
                            MESSAGE OWNER
                        </button>
                    </Card>

                    {/* Quick Notifications */}
                    <Card className="p-4 border-none shadow-xl ring-1 ring-slate-900 bg-slate-900 rounded-xl text-white">
                        <h4 className="text-[10px] font-bold opacity-40 uppercase tracking-[0.2em] mb-6">Strategic Comms</h4>
                        <div className="space-y-4">
                            <p className="text-xs font-medium text-slate-400 italic leading-relaxed">Send a high-priority push to the shop manager app.</p>
                            <textarea
                                placeholder="Message to store..."
                                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-xs font-bold outline-none focus:ring-2 focus:ring-primary/20 transition-all min-h-[100px]"
                            />
                            <button className="w-full py-4 bg-primary text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all">
                                SEND ALERT
                            </button>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default SellerDetail;
