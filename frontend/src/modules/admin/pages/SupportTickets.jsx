import React, { useState, useEffect } from 'react';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import Pagination from '@shared/components/ui/Pagination';
import { adminApi } from '../services/adminApi';
import {
    HiOutlineChatBubbleLeftRight,
    HiOutlineMagnifyingGlass,
    HiOutlineFunnel,
    HiOutlineUser,
    HiOutlineBuildingStorefront,
    HiOutlineTruck,
    HiOutlinePaperAirplane,
    HiOutlineEllipsisVertical,
    HiOutlineClock,
    HiOutlineCheckCircle,
    HiOutlineExclamationTriangle,
    HiOutlineChevronRight
} from 'react-icons/hi2';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '@shared/components/ui/Toast';
import { Loader2 } from 'lucide-react';

const SupportTickets = () => {
    const { showToast } = useToast();
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [reply, setReply] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [tickets, setTickets] = useState([]);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [total, setTotal] = useState(0);

    useEffect(() => {
        fetchTickets(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pageSize]);

    const fetchTickets = async (requestedPage = 1) => {
        try {
            setLoading(true);
            const res = await adminApi.getTickets({ page: requestedPage, limit: pageSize });
            if (res.data.success) {
                const payload = res.data.result || {};
                const data = Array.isArray(payload.items) ? payload.items : (res.data.results || []);
                setTickets(data.map(t => ({
                    ...t,
                    id: t._id,
                    ticketCode: t._id.slice(-6).toUpperCase(),
                    user: t.userId?.name || "Unknown",
                    date: new Date(t.createdAt).toLocaleString(),
                    messages: (t.messages || []).map((m, i) => ({
                        ...m,
                        id: m._id || m.id || `msg-${t._id}-${i}`,
                        time: new Date(m.createdAt || Date.now()).toLocaleTimeString()
                    }))
                })));
                setTotal(typeof payload.total === 'number' ? payload.total : data.length);
                setPage(typeof payload.page === 'number' ? payload.page : requestedPage);
            }
        } catch (error) {
            console.error("Fetch Tickets Error:", error);
            showToast("Failed to load tickets", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleSendReply = async () => {
        if (!reply.trim() || !selectedTicket) return;

        try {
            const res = await adminApi.replyTicket(selectedTicket.id, reply);
            if (res.data.success) {
                const updatedTicketData = res.data.result;
                const newMessage = {
                    ...updatedTicketData.messages[updatedTicketData.messages.length - 1],
                    time: "Just now"
                };

                const updatedTickets = tickets.map(t => {
                    if (t.id === selectedTicket.id) {
                        return {
                            ...t,
                            messages: [...t.messages, newMessage],
                            status: 'processing'
                        };
                    }
                    return t;
                });

                setTickets(updatedTickets);
                setSelectedTicket({
                    ...selectedTicket,
                    messages: [...selectedTicket.messages, newMessage],
                    status: 'processing'
                });
                setReply('');
                showToast('Reply sent successfully', 'success');
            }
        } catch (error) {
            showToast("Failed to send reply", "error");
        }
    };

    const handleResolve = async (id) => {
        try {
            const res = await adminApi.updateTicketStatus(id, 'closed');
            if (res.data.success) {
                setTickets(tickets.map(t => t.id === id ? { ...t, status: 'closed' } : t));
                if (selectedTicket?.id === id) {
                    setSelectedTicket({ ...selectedTicket, status: 'closed' });
                }
                showToast(`Ticket marked as resolved`, 'success');
            }
        } catch (error) {
            showToast("Failed to update status", "error");
        }
    };

    const filteredTickets = tickets.filter(t =>
        t.id.toString().toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.user.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.subject.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="h-[calc(100vh-140px)] flex flex-col lg:flex-row gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Sidebar: Ticket List */}
            <div className="lg:w-[400px] flex flex-col gap-4 h-full">
                <Card className="flex-1 flex flex-col border-none shadow-xl ring-1 ring-slate-100 rounded-xl overflow-hidden bg-white">
                    <div className="p-6 border-b border-slate-50 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-black text-slate-900 tracking-tight">Support Desk</h2>
                            <Badge variant="blue" className="text-[10px] font-black">{tickets.length} ACTIVE</Badge>
                        </div>
                        <div className="relative group">
                            <HiOutlineMagnifyingGlass className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search by ID or Name..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border-none rounded-2xl text-xs font-bold outline-none ring-1 ring-transparent focus:ring-primary/10 transition-all"
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                        {filteredTickets.map((t) => (
                            <button
                                key={t.id}
                                onClick={() => setSelectedTicket(t)}
                                className={cn(
                                    "w-full text-left p-4 rounded-2xl transition-all group relative overflow-hidden",
                                    selectedTicket?.id === t.id
                                        ? "bg-slate-900 text-white shadow-xl translate-x-1"
                                        : "hover:bg-slate-50 text-slate-700"
                                )}
                            >
                                <div className="flex items-start justify-between mb-2">
                                    <Badge
                                        variant={t.priority === 'high' ? 'danger' : t.priority === 'medium' ? 'warning' : 'secondary'}
                                        className={cn("text-[8px] font-black uppercase tracking-widest", selectedTicket?.id === t.id && "bg-white/20 text-white border-none")}
                                    >
                                        {t.priority}
                                    </Badge>
                                    <span className={cn("text-[9px] font-bold opacity-60", selectedTicket?.id === t.id ? "text-white" : "text-slate-400")}>{t.date}</span>
                                </div>
                                <h4 className="text-xs font-black truncate mb-1">{t.subject}</h4>
                                <div className="flex items-center gap-2">
                                    <div className={cn("p-1 rounded-md", selectedTicket?.id === t.id ? "bg-white/10" : "bg-slate-100")}>
                                        {t.userType === 'Customer' && <HiOutlineUser className="h-3 w-3" />}
                                        {t.userType === 'Seller' && <HiOutlineBuildingStorefront className="h-3 w-3" />}
                                        {t.userType === 'Rider' && <HiOutlineTruck className="h-3 w-3" />}
                                    </div>
                                    <span className={cn("text-[10px] font-bold", selectedTicket?.id === t.id ? "text-white/80" : "text-slate-500")}>
                                        {t.user} • {t.userType}
                                    </span>
                                </div>
                            </button>
                        ))}
                    </div>
                    <div className="p-4 border-t border-slate-100">
                        <Pagination
                            page={page}
                            totalPages={Math.ceil(total / pageSize) || 1}
                            total={total}
                            pageSize={pageSize}
                            onPageChange={(p) => fetchTickets(p)}
                            onPageSizeChange={(newSize) => {
                                setPageSize(newSize);
                                setPage(1);
                            }}
                            loading={loading}
                            compact
                        />
                    </div>
                </Card>
            </div>

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col h-full min-h-0">
                {selectedTicket ? (
                    <Card className="flex-1 flex flex-col border-none shadow-xl ring-1 ring-slate-100 rounded-xl overflow-hidden bg-white">
                        {/* Chat Header */}
                        <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-2xl bg-white ring-1 ring-slate-100 flex items-center justify-center text-slate-400 shadow-sm">
                                    <HiOutlineChatBubbleLeftRight className="h-6 w-6" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-black text-slate-900 leading-none mb-1">{selectedTicket.subject}</h3>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                                        Ticket ID: {selectedTicket.id} • STATUS: {selectedTicket.status}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleResolve(selectedTicket.id)}
                                    className={cn(
                                        "p-2.5 ring-1 ring-slate-200 rounded-xl transition-all",
                                        selectedTicket.status === 'closed' ? "bg-emerald-50 text-emerald-500 ring-emerald-100" : "bg-white text-slate-400 hover:text-emerald-500"
                                    )}
                                    title="Mark as Resolved"
                                >
                                    <HiOutlineCheckCircle className="h-5 w-5" />
                                </button>
                                <button className="p-2.5 bg-white text-slate-400 hover:text-slate-600 ring-1 ring-slate-200 rounded-xl transition-all">
                                    <HiOutlineEllipsisVertical className="h-5 w-5" />
                                </button>
                            </div>
                        </div>

                        {/* Messages Thread */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-slate-50/20">
                            {selectedTicket.messages.map((m) => (
                                <div key={m.id} className={cn("flex flex-col", m.isAdmin ? "items-end" : "items-start")}>
                                    <div className={cn(
                                        "max-w-[80%] p-4 rounded-xl text-sm font-medium leading-relaxed shadow-sm",
                                        m.isAdmin ? "bg-slate-900 text-white rounded-tr-sm" : "bg-white text-slate-700 ring-1 ring-slate-100 rounded-tl-sm"
                                    )}>
                                        {m.text}
                                    </div>
                                    <span className="text-[9px] font-bold text-slate-400 mt-2 px-1 uppercase tracking-widest">{m.time}</span>
                                </div>
                            ))}
                        </div>

                        {/* Reply Input */}
                        <div className="p-6 bg-white border-t border-slate-50">
                            <div className="flex items-center gap-4 bg-slate-50 p-2 rounded-2xl ring-1 ring-slate-100 focus-within:ring-primary/20 focus-within:bg-white transition-all">
                                <textarea
                                    value={reply}
                                    onChange={(e) => setReply(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSendReply();
                                        }
                                    }}
                                    placeholder="Type your response here..."
                                    className="flex-1 bg-transparent border-none outline-none p-3 text-sm font-bold resize-none min-h-[44px] max-h-[120px]"
                                />
                                <button
                                    onClick={handleSendReply}
                                    disabled={!reply.trim()}
                                    className="h-10 w-10 bg-primary text-white rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100"
                                >
                                    <HiOutlinePaperAirplane className="h-5 w-5 -rotate-45 -mt-0.5 ml-0.5" />
                                </button>
                            </div>
                        </div>
                    </Card>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-5 text-center bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-200">
                        <div className="h-24 w-24 bg-white rounded-xl shadow-sm flex items-center justify-center mb-6 ring-1 ring-slate-100">
                            <HiOutlineChatBubbleLeftRight className="h-10 w-10 text-slate-200" />
                        </div>
                        <h4 className="text-xl font-black text-slate-900 uppercase">Universal Support Hub</h4>
                        <p className="text-sm font-bold text-slate-400 mt-2 max-w-sm mx-auto leading-relaxed">
                            Select a transaction or dispute ticket from the sidebar to begin resolution protocol.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SupportTickets;
