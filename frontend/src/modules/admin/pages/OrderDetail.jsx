// Ultimate Order Intelligence Dossier
import React, { useState, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { useSettings } from '@core/context/SettingsContext';
import { useParams, useNavigate } from 'react-router-dom';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import { adminApi } from '../services/adminApi';
import {
    ChevronLeft,
    Box,
    Truck,
    User,
    Building2,
    Calendar,
    Clock,
    ShoppingBag,
    Printer,
    Download,
    Mail,
    Phone,
    Copy,
    CreditCard,
    AlertCircle,
    Package,
    Navigation,
    Store,
    Info,
    MapPin
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@shared/components/ui/Toast';

const OrderDetail = () => {
    const { orderId } = useParams();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const { settings } = useSettings();
    const [order, setOrder] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const invoiceRef = useRef(null);

    const fetchDetail = async () => {
        setIsLoading(true);
        try {
            const response = await adminApi.getOrderDetails(orderId);
            if (response.data.success) {
                setOrder(response.data.result);
            }
        } catch (error) {
            showToast("Failed to load order details", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handleStatusUpdate = async (newStatus) => {
        try {
            await adminApi.updateOrderStatus(orderId, { status: newStatus });
            showToast(`Order status updated to ${newStatus}`, "success");
            fetchDetail(); // Refresh data
        } catch (error) {
            console.error("Failed to update status:", error);
            showToast("Failed to update status", "error");
        }
    };

    useEffect(() => {
        if (orderId) {
            fetchDetail();
        }
    }, [orderId]);

    const getStatusStyles = (status) => {
        switch (status.toLowerCase()) {
            case 'pending': return 'bg-amber-100 text-amber-600 border-amber-200';
            case 'confirmed': return 'bg-brand-100 text-brand-600 border-brand-200';
            case 'packed': return 'bg-brand-100 text-brand-600 border-brand-200';
            case 'out_for_delivery': return 'bg-purple-100 text-purple-600 border-purple-200';
            case 'delivered': return 'bg-brand-100 text-brand-600 border-brand-200';
            case 'cancelled': return 'bg-rose-100 text-rose-600 border-rose-200';
            default: return 'bg-slate-100 text-slate-600 border-slate-200';
        }
    };

    const copyToClipboard = (text, label) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        showToast(`${label} copied to internal clipboard`, 'success');
    };

    const handlePrintInvoice = async () => {
        const element = invoiceRef.current;
        if (!element) return;
        
        showToast("Generating PDF Invoice...", "info");
        
        try {
            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                logging: false,
                allowTaint: true,
                backgroundColor: "#ffffff",
                onclone: (clonedDoc) => {
                    // Forcefully remove any elements or styles that might use oklch
                    // html2canvas crashes when it encounters oklch color functions in stylesheets
                    const styleSheets = clonedDoc.styleSheets;
                    for (let i = 0; i < styleSheets.length; i++) {
                        try {
                            const rules = styleSheets[i].cssRules || styleSheets[i].rules;
                            for (let j = rules.length - 1; j >= 0; j--) {
                                if (rules[j].cssText && rules[j].cssText.includes('oklch')) {
                                    styleSheets[i].deleteRule(j);
                                }
                            }
                        } catch (e) {
                            // Skip cross-origin stylesheets that we can't access
                        }
                    }
                    
                    // Also explicitly reset root variables just in case
                    const style = clonedDoc.createElement('style');
                    style.innerHTML = `
                        :root {
                            --primary: var(--primary) !important;
                            --secondary: #64748b !important;
                            --background: #ffffff !important;
                            --foreground: #0f172a !important;
                        }
                    `;
                    clonedDoc.head.appendChild(style);
                }
            });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            
            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`Invoice_${order.orderId}.pdf`);
            showToast("Invoice downloaded successfully", "success");
        } catch (error) {
            console.error("PDF generation failed:", error);
            showToast("Failed to generate PDF", "error");
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-[400px] flex flex-col items-center justify-center gap-4">
                <div className="h-12 w-12 border-4 border-fuchsia-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-xs font-black text-slate-400 uppercase tracking-[4px]">Accessing Intelligence...</p>
            </div>
        );
    }

    if (!order) {
        return (
            <div className="min-h-[400px] flex flex-col items-center justify-center gap-4 text-center p-8">
                <AlertCircle className="h-16 w-16 text-rose-200" />
                <h2 className="text-xl font-black text-slate-900 uppercase">Order Node Not Found</h2>
                <button onClick={() => navigate(-1)} className="ds-btn ds-btn-md bg-slate-900 text-white mt-4">Return to List</button>
            </div>
        );
    }

    return (
        <div className="ds-section-spacing animate-in fade-in slide-in-from-bottom-4 duration-700 pb-12">
            {/* Control Bar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 px-1">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-3 bg-white ring-1 ring-slate-200 rounded-2xl hover:bg-slate-50 transition-all text-slate-400 group"
                    >
                        <ChevronLeft className="h-5 w-5 group-hover:-translate-x-1 transition-transform" />
                    </button>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Order #{order.orderId}</h1>
                            <div className="relative inline-block w-44">
                                <select
                                    value={order.status}
                                    onChange={(e) => handleStatusUpdate(e.target.value)}
                                    className={cn(
                                        "w-full text-[10px] pl-3 pr-8 py-1.5 rounded-xl font-black uppercase tracking-widest border appearance-none cursor-pointer focus:ring-2 focus:ring-offset-1 transition-all outline-none shadow-sm",
                                        getStatusStyles(order.status)
                                    )}
                                >
                                    <option value="pending">Pending</option>
                                    <option value="confirmed">Confirmed</option>
                                    <option value="packed">Packed</option>
                                    <option value="out_for_delivery">Out for Delivery</option>
                                    <option value="delivered">Delivered</option>
                                    <option value="cancelled">Cancelled</option>
                                </select>
                                <Info className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none opacity-60" />
                            </div>
                        </div>
                        <p className="text-[11px] font-bold text-slate-400 mt-1 uppercase tracking-widest flex items-center gap-2">
                            <Calendar className="h-3.5 w-3.5" />
                            {new Date(order.createdAt).toLocaleDateString()} • <Clock className="h-3.5 w-3.5 ml-1" /> {new Date(order.createdAt).toLocaleTimeString()}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button 
                        onClick={handlePrintInvoice}
                        className="flex items-center gap-2 px-5 py-3 bg-white ring-1 ring-slate-200 text-slate-700 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm"
                    >
                        <Printer className="h-4 w-4 text-slate-400" />
                        Print Invoice
                    </button>
                </div>

            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Items Section */}
                    <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-xl overflow-hidden">
                        <div className="p-6 border-b border-slate-50 bg-slate-50/30 flex items-center justify-between">
                            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-3">
                                <Box className="h-4 w-4 text-brand-500" />
                                Items in Order
                            </h3>
                            <Badge className="bg-brand-50 text-brand-700 border-none text-[9px] font-black">{order.items.length} ITEMS</Badge>
                        </div>
                        <div className="p-0 overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50/50">
                                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Product Node</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Unit Price</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Qty</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Aggregate</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {order.items.map((item) => (
                                        <tr key={item._id} className="group hover:bg-slate-50/30 transition-all">
                                            <td className="px-6 py-5">
                                                <div className="flex items-center gap-4">
                                                    <div className="h-14 w-14 bg-slate-50 rounded-2xl flex items-center justify-center ds-h1 shadow-inner border border-slate-100 group-hover:scale-110 transition-transform overflow-hidden">
                                                        {item.image ? (
                                                            <img src={item.image} alt="" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <Package className="h-6 w-6 text-slate-200" />
                                                        )}
                                                    </div>
                                                    <div>
                                                        <h4 className="text-sm font-black text-slate-900">{item.name}</h4>
                                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">ID: {item.product?._id || item.product}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5 text-center text-sm font-bold text-slate-600">₹{item.price}</td>
                                            <td className="px-6 py-5 text-center">
                                                <span className="bg-slate-100 px-3 py-1 rounded-lg text-xs font-black text-slate-700">x{item.quantity}</span>
                                            </td>
                                            <td className="px-6 py-5 text-right text-sm font-black text-slate-900">₹{item.price * item.quantity}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="p-4 bg-slate-50/50 flex flex-col items-end gap-3 text-right">
                            <div className="flex items-center justify-between w-full max-w-[240px]">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Subtotal</span>
                                <span className="text-sm font-black text-slate-700">₹{order.pricing?.subtotal || 0}</span>
                            </div>
                            <div className="flex items-center justify-between w-full max-w-[240px]">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Delivery Fee</span>
                                <span className="text-sm font-bold text-brand-600">₹{order.pricing?.deliveryFee || 0}</span>
                            </div>
                            <div className="h-px w-full max-w-[240px] bg-slate-200 my-2" />
                            <div className="flex items-center justify-between w-full max-w-[240px]">
                                <span className="text-xs font-black text-slate-900 uppercase tracking-tight">Total Payable</span>
                                <span className="text-2xl font-black text-fuchsia-600">₹{order.pricing?.total || 0}</span>
                            </div>
                        </div>
                    </Card>

                    {/* Shop Details */}
                    <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-2xl p-6">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                            <Store className="h-4 w-4" />
                            Shop Node Information
                        </h4>
                        <div className="flex items-center gap-4">
                            <div className="h-16 w-16 bg-orange-50 rounded-2xl flex items-center justify-center ds-h2 font-black text-orange-600 uppercase">
                                {order.seller?.shopName?.[0] || 'S'}
                            </div>
                            <div className="text-left">
                                <h3 className="text-lg font-black text-slate-900 leading-tight">{order.seller?.shopName || 'Unknown Shop'}</h3>
                                <p className="text-xs font-bold text-brand-600 uppercase tracking-tighter">Verified Anchor Partner</p>
                                <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">OWNER: {order.seller?.name}</p>
                            </div>
                        </div>
                    </Card>

                    {/* Logistical Nodes */}
                    <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-xl p-6">
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-8 flex items-center gap-3">
                            <Navigation className="h-4 w-4 text-brand-500" />
                            Logistical Real-time State
                        </h3>
                        <div className="space-y-6 relative ml-4">
                            <div className="absolute top-0 bottom-0 left-[7.5px] w-0.5 bg-slate-100" />
                            <div className="flex gap-6 relative">
                                <div className="h-4 w-4 rounded-full ring-4 ring-white z-10 mt-1 bg-brand-500 shadow-lg shadow-brand-200" />
                                <div className="flex-1 pb-4">
                                    <div className="flex items-center justify-between mb-1">
                                        <h4 className="text-xs font-black uppercase tracking-tight text-slate-900">
                                            Status: {order.status.replace(/_/g, ' ')}
                                        </h4>
                                        <span className="text-[10px] font-bold text-slate-400 uppercase">{new Date(order.updatedAt).toLocaleTimeString()}</span>
                                    </div>
                                    <p className="text-[11px] font-bold text-slate-400 leading-relaxed italic">"System verified current logistical state as {order.status}."</p>
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>

                {/* Right Column */}
                <div className="space-y-6">
                    {/* Customer Node */}
                    <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-2xl p-6">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                            <User className="h-4 w-4" />
                            Customer Node Information
                        </h4>
                        <div className="flex items-center gap-4">
                            <img 
                                src="https://cdn-icons-png.flaticon.com/512/149/149071.png" 
                                alt="" 
                                className="h-16 w-16 rounded-2xl bg-slate-50 ring-2 ring-white shadow-sm object-cover" 
                            />
                            <div className="text-left">
                                <h3 className="text-lg font-black text-slate-900 leading-tight">
                                    {order.customer?.name}
                                </h3>
                                <p className="text-xs font-bold text-slate-400">
                                    Node ID: {order.customer?._id}
                                </p>
                            </div>
                        </div>
                        <div className="space-y-6 text-left mt-6">
                            <div className="flex flex-col gap-2">
                                <span className="text-[10px] font-bold text-slate-400 flex items-center gap-3">
                                    <Mail className="h-3.5 w-3.5" /> {order.customer?.email}
                                </span>
                                <span className="text-[10px] font-bold text-slate-400 flex items-center gap-3">
                                    <Phone className="h-3.5 w-3.5" /> {order.customer?.phone}
                                </span>
                            </div>
                            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                <div className="flex items-center justify-between gap-2 mb-1">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        Destination Protocol
                                    </span>
                                    {order?.address?.location &&
                                        typeof order.address.location.lat === "number" &&
                                        typeof order.address.location.lng === "number" && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const { lat, lng } = order.address.location;
                                                    window.open(
                                                        `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
                                                        "_blank",
                                                    );
                                                }}
                                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-primary hover:bg-primary/5 transition-colors"
                                            >
                                                <MapPin className="h-3 w-3" />
                                                Open in Maps
                                            </button>
                                        )}
                                </div>
                                <p className="text-xs font-bold text-slate-600 leading-relaxed italic">
                                    "{order.address?.address}, {order.address?.landmark}, {order.address?.city}"
                                </p>
                            </div>
                            {order.address?.type === "Other" &&
                                (order.address?.name || order.address?.phone) && (
                                    <div className="p-4 bg-brand-50 rounded-2xl border border-brand-100 space-y-2">
                                        <div className="flex items-center justify-between gap-2 mb-1">
                                            <span className="text-[10px] font-black text-brand-700 uppercase tracking-widest">
                                                Recipient (Order For Someone Else)
                                            </span>
                                        </div>
                                        <p className="text-xs font-black text-slate-800">
                                            {order.address?.name}
                                        </p>
                                        {order.address?.phone && (
                                            <p className="text-[11px] font-bold text-brand-700 flex items-center gap-2">
                                                <Phone className="h-3.5 w-3.5" />
                                                {order.address.phone}
                                            </p>
                                        )}
                                    </div>
                                )}
                        </div>
                    </Card>

                    {/* Rider Section */}
                    <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-xl p-6 text-left">
                        <div className="flex flex-col gap-4">
                            <div className="flex items-center justify-between">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                    <Truck className="h-3.5 w-3.5" /> Logistical Agent
                                </h4>
                                <Badge variant={order.deliveryBoy ? "success" : "secondary"} className="text-[8px] font-black uppercase tracking-widest">
                                    {order.deliveryBoy ? "ASSIGNED" : "UNASSIGNED"}
                                </Badge>
                            </div>
                            <div className="flex items-center gap-3 mt-2">
                                <div className="h-10 w-10 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center text-slate-300 overflow-hidden">
                                    {order.deliveryBoy ? (
                                        <div className="h-full w-full flex items-center justify-center font-black text-slate-400 bg-brand-50 ds-h3">{order.deliveryBoy.name.charAt(0)}</div>
                                    ) : (
                                        <User className="h-5 w-5" />
                                    )}
                                </div>
                                <div>
                                    <h5 className="text-sm font-black text-slate-900">{order.deliveryBoy?.name || "Pending Rider Assignment"}</h5>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">CONTACT: {order.deliveryBoy?.phone || "N/A"}</p>
                                </div>
                            </div>
                        </div>
                    </Card>

                    {/* Payment Vector */}
                    <Card className="border-none shadow-xl ring-1 ring-slate-100 bg-white rounded-2xl overflow-hidden text-left">
                        <div className="p-6 bg-slate-900 text-white">
                            <h4 className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2 text-white">
                                <CreditCard className="h-4 w-4 text-brand-400" />
                                Payment Vector
                            </h4>
                        </div>
                        <div className="p-4 space-y-6">
                            <div className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Protocol Summary</span>
                                <Badge className={cn("border-none text-[8px] font-black uppercase", order.payment?.status === 'completed' ? 'bg-brand-100 text-brand-700' : 'bg-amber-100 text-amber-700')}>
                                    {order.payment?.status || 'PENDING'}
                                </Badge>
                            </div>
                            <div className="flex items-center justify-between px-2">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">TXN Hash</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-black text-slate-700 truncate max-w-[100px]">{order.payment?.transactionId || 'N/A'}</span>
                                    <button onClick={() => copyToClipboard(order.payment?.transactionId, 'Transaction ID')} className="p-1.5 hover:bg-slate-50 rounded-md text-slate-300"><Copy className="h-3 w-3" /></button>
                                </div>
                            </div>
                            <div className="flex items-center justify-between px-2">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Gateway Method</span>
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-900">{order.payment?.method || 'CASH'}</span>
                            </div>
                        </div>
                    </Card>

                    {/* Intelligence Notes */}
                    <Card className="border-none shadow-xl ring-1 ring-amber-100 bg-amber-50/30 rounded-xl p-6 text-left">
                        <h4 className="text-[10px] font-black text-amber-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Info className="h-4 w-4" />
                            Intelligence Notes
                        </h4>
                        <p className="text-xs font-bold text-amber-800 leading-relaxed italic">
                            "{order.cancelReason ? `Cancellation Payload: ${order.cancelReason}` : `Delivery window scheduled for ${order.timeSlot}. Instructions: Follow local logistical protocols.`}"
                        </p>
                    </Card>
                </div>
            </div>

            {/* Hidden Printable Invoice Template */}
            <div className="fixed -left-[9999px] top-0">
                <div 
                    ref={invoiceRef}
                    className="w-[800px] bg-white p-1"
                    style={{ backgroundColor: "#f8fafc" }}
                >
                    {/* Inner Paper with Border */}
                    <div style={{ 
                        backgroundColor: "#ffffff", 
                        margin: "40px",
                        padding: "65px",
                        border: "1px solid #e2e8f0",
                        borderRadius: "2px",
                        boxShadow: "0 0 10px rgba(0,0,0,0.02)",
                        fontFamily: "'Inter', system-ui, sans-serif",
                        color: "#1e293b",
                        minHeight: "1050px"
                    }}>
                        {/* Header: Centered Brand */}
                        <div style={{ textAlign: "center", marginBottom: "50px" }}>
                            {settings?.logoUrl ? (
                                <img src={settings.logoUrl} alt="Logo" width="130" style={{ display: "inline-block", marginBottom: "16px" }} crossOrigin="anonymous" />
                            ) : (
                                <div style={{ fontSize: "26px", fontWeight: "900", color: "#0f172a", marginBottom: "4px" }}>{settings?.appName || 'NOYO KART'}</div>
                            )}
                            <div style={{ fontSize: "10px", color: "#64748b", fontWeight: "800", textTransform: "uppercase", letterSpacing: "3px" }}>Official Tax Invoice</div>
                        </div>

                        {/* Top Meta Details */}
                        <table width="100%" cellPadding="0" cellSpacing="0" style={{ marginBottom: "50px", borderBottom: "1px solid #f1f5f9", paddingBottom: "25px" }}>
                            <tr>
                                <td width="50%" style={{ verticalAlign: "bottom" }}>
                                    <div style={{ fontSize: "28px", fontWeight: "900", color: "#0f172a" }}>INVOICE</div>
                                </td>
                                <td width="50%" align="right" style={{ verticalAlign: "bottom" }}>
                                    <div style={{ fontSize: "12px", fontWeight: "700", marginBottom: "4px" }}>Reference: <span style={{ color: "#2563eb" }}>#{order.orderId}</span></div>
                                    <div style={{ fontSize: "10px", color: "#64748b", fontWeight: "700" }}>Issued: {new Date(order.createdAt).toLocaleDateString()}</div>
                                </td>
                            </tr>
                        </table>

                        {/* Address Grid */}
                        <table width="100%" cellPadding="0" cellSpacing="0" style={{ marginBottom: "55px" }}>
                            <tr>
                                <td width="48%" style={{ verticalAlign: "top", paddingRight: "25px" }}>
                                    <div style={{ fontSize: "9px", fontWeight: "900", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "12px" }}>Billed To</div>
                                    <div style={{ fontSize: "16px", fontWeight: "800", color: "#0f172a", marginBottom: "8px" }}>{order.customer?.name}</div>
                                    <div style={{ fontSize: "12px", color: "#475569", lineHeight: "1.7" }}>
                                        {order.address?.address},<br />
                                        {order.address?.landmark && `${order.address.landmark}, `}{order.address?.city}
                                    </div>
                                    <div style={{ fontSize: "11px", fontWeight: "700", color: "#64748b", marginTop: "15px" }}>Contact: {order.customer?.phone}</div>
                                </td>
                                <td width="4%" style={{ borderLeft: "1px solid #f1f5f9" }}></td>
                                <td width="48%" style={{ verticalAlign: "top", paddingLeft: "25px" }}>
                                    <div style={{ fontSize: "9px", fontWeight: "900", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "12px" }}>Shipped From</div>
                                    <div style={{ fontSize: "16px", fontWeight: "800", color: "#0f172a", marginBottom: "8px" }}>{order.seller?.shopName || 'Partner Merchant'}</div>
                                    <div style={{ fontSize: "12px", color: "#475569", lineHeight: "1.7" }}>
                                        {settings?.address || 'Verified Business Location'}<br />
                                        Inventory Fulfillment Center
                                    </div>
                                    <div style={{ fontSize: "11px", fontWeight: "800", color: "#2563eb", marginTop: "15px" }}>{settings?.taxId ? `GSTIN: ${settings.taxId}` : 'Tax Verified Partner'}</div>
                                </td>
                            </tr>
                        </table>

                        {/* Manifest Table */}
                        <div style={{ marginBottom: "50px" }}>
                            <table width="100%" cellPadding="0" cellSpacing="0" style={{ borderCollapse: "collapse" }}>
                                <thead>
                                    <tr style={{ backgroundColor: "#f8fafc", borderTop: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0" }}>
                                        <th align="left" style={{ padding: "16px 20px", fontSize: "11px", fontWeight: "900", color: "#475569", textTransform: "uppercase" }}>Description</th>
                                        <th align="center" style={{ padding: "16px 20px", fontSize: "11px", fontWeight: "900", color: "#475569", textTransform: "uppercase" }}>Unit Rate</th>
                                        <th align="center" style={{ padding: "16px 20px", fontSize: "11px", fontWeight: "900", color: "#475569", textTransform: "uppercase" }}>Qty</th>
                                        <th align="right" style={{ padding: "16px 20px", fontSize: "11px", fontWeight: "900", color: "#475569", textTransform: "uppercase" }}>Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {order.items.map((item, idx) => (
                                        <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                            <td style={{ padding: "18px 20px" }}>
                                                <div style={{ fontSize: "13px", fontWeight: "700", color: "#0f172a" }}>{item.name}</div>
                                                <div style={{ fontSize: "10px", color: "#94a3b8", marginTop: "4px" }}>Item Ref: {item.product?._id?.slice(-8).toUpperCase() || item._id?.slice(-8).toUpperCase()}</div>
                                            </td>
                                            <td align="center" style={{ padding: "18px 20px", fontSize: "13px", color: "#475569", fontWeight: "700" }}>₹{item.price}</td>
                                            <td align="center" style={{ padding: "18px 20px", fontSize: "13px", color: "#475569", fontWeight: "800" }}>{item.quantity}</td>
                                            <td align="right" style={{ padding: "18px 20px", fontSize: "14px", fontWeight: "900", color: "#0f172a" }}>₹{item.price * item.quantity}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Totals Summary */}
                        <table width="100%" cellPadding="0" cellSpacing="0" style={{ marginBottom: "60px" }}>
                            <tr>
                                <td width="50%" style={{ verticalAlign: "top" }}>
                                    <div style={{ backgroundColor: "#f8fafc", padding: "25px", borderRadius: "8px", border: "1px solid #f1f5f9" }}>
                                        <div style={{ fontSize: "10px", color: "#94a3b8", fontWeight: "900", textTransform: "uppercase", marginBottom: "12px", letterSpacing: "1.5px" }}>Transaction Detail</div>
                                        <div style={{ fontSize: "12px", color: "#475569", marginBottom: "8px" }}>Method: <b style={{ color: "#0f172a" }}>{order.paymentMode || order.payment?.method || 'CASH'}</b></div>
                                        <div style={{ fontSize: "12px", color: "#475569" }}>Status: <b style={{ color: "#0f172a", textTransform: "uppercase" }}>{order.paymentStatus || order.payment?.status || 'PENDING'}</b></div>
                                    </div>
                                </td>
                                <td width="10%"></td>
                                <td width="40%" style={{ verticalAlign: "top" }}>
                                    <table width="100%" cellPadding="8" cellSpacing="0">
                                        <tr>
                                            <td align="left" style={{ fontSize: "12px", color: "#64748b", fontWeight: "700" }}>Subtotal Aggregate</td>
                                            <td align="right" style={{ fontSize: "13px", fontWeight: "800", color: "#0f172a" }}>₹{order.pricing?.subtotal || 0}</td>
                                        </tr>
                                        <tr>
                                            <td align="left" style={{ fontSize: "12px", color: "#64748b", fontWeight: "700" }}>Logistics Cost</td>
                                            <td align="right" style={{ fontSize: "13px", fontWeight: "800", color: "#2563eb" }}>+ ₹{order.pricing?.deliveryFee || 0}</td>
                                        </tr>
                                        <tr>
                                            <td colSpan="2" style={{ padding: "12px 0" }}><div style={{ height: "1px", backgroundColor: "#e2e8f0" }}></div></td>
                                        </tr>
                                        <tr>
                                            <td align="left" style={{ fontSize: "15px", fontWeight: "900", color: "#0f172a" }}>Grand Total</td>
                                            <td align="right" style={{ fontSize: "24px", fontWeight: "900", color: "#2563eb" }}>₹{order.pricing?.total || 0}</td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                        </table>

                        {/* Footer: Centered Verification */}
                        <div style={{ marginTop: "auto", paddingTop: "40px", borderTop: "1px solid #f1f5f9", textAlign: "center" }}>
                            <div style={{ fontSize: "12px", color: "#64748b", fontWeight: "800", textTransform: "uppercase", letterSpacing: "3px" }}>
                                Thank you for your business
                            </div>
                            <div style={{ fontSize: "10px", color: "#94a3b8", marginTop: "10px", fontWeight: "600" }}>
                                This is a system-generated commercial invoice. No physical signature required.
                            </div>
                            <div style={{ fontSize: "10px", color: "#94a3b8", marginTop: "5px" }}>
                                {settings?.appName || 'Noyo Kart'} • Customer Support: support@appzeto.com
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OrderDetail;
