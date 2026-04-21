import React, { useRef, useState, useEffect } from 'react';
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
import { useAuth } from '@core/context/AuthContext';
import { joinTicketRoom, leaveTicketRoom, onTicketCreated, onTicketMessage } from '@/core/services/orderSocket';
import { useSupportUnread } from '@core/context/SupportUnreadContext';

const SupportTickets = () => {
    const { showToast } = useToast();
    const { token } = useAuth();
    const { unreadByTicket, setIsViewingSupportChat, setActiveTicketId, markTicketRead } = useSupportUnread();
    const getToken = () => token;
    const fetchTicketsRef = useRef(null);
    const ticketsRef = useRef([]);
    const selectedTicketRoomRef = useRef(null);
    const messagesContainerRef = useRef(null);
    const stickToBottomRef = useRef(true);
    const prevTicketIdRef = useRef(null);
    const menuRef = useRef(null);
    const menuButtonRef = useRef(null);
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [reply, setReply] = useState('');
    const [menuOpen, setMenuOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [tickets, setTickets] = useState([]);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [total, setTotal] = useState(0);

    useEffect(() => {
        setIsViewingSupportChat(true);
        return () => {
            setIsViewingSupportChat(false);
            setActiveTicketId('');
        };
    }, [setIsViewingSupportChat, setActiveTicketId]);

    useEffect(() => {
        const tid = selectedTicket?.id ? String(selectedTicket.id) : "";
        setActiveTicketId(tid);
        if (tid) markTicketRead(tid);
    }, [selectedTicket?.id, setActiveTicketId, markTicketRead]);

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchTickets(1);
        }, 500);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pageSize, searchTerm]);

    const fetchTickets = async (requestedPage = 1) => {
        try {
            setLoading(true);
            const params = { page: requestedPage, limit: pageSize };
            if (searchTerm.trim()) params.search = searchTerm.trim();

            const res = await adminApi.getTickets(params);
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

    useEffect(() => {
        fetchTicketsRef.current = fetchTickets;
    });

    useEffect(() => {
        ticketsRef.current = tickets;
    }, [tickets]);

    useEffect(() => {
        const el = messagesContainerRef.current;
        if (!el || !selectedTicket) return;

        const ticketChanged = prevTicketIdRef.current !== selectedTicket.id;
        const shouldScroll = ticketChanged || stickToBottomRef.current;
        prevTicketIdRef.current = selectedTicket.id;
        if (!shouldScroll) return;

        requestAnimationFrame(() => {
            el.scrollTo({
                top: el.scrollHeight,
                behavior: ticketChanged ? 'auto' : 'smooth',
            });
        });
    }, [selectedTicket?.id, selectedTicket?.messages?.length]);

    useEffect(() => {
        setMenuOpen(false);
    }, [selectedTicket?.id]);

    useEffect(() => {
        if (!menuOpen) return;

        const onKeyDown = (e) => {
            if (e.key === 'Escape') setMenuOpen(false);
        };

        const onPointerDown = (e) => {
            const target = e.target;
            if (!target) return;
            if (menuRef.current?.contains(target)) return;
            if (menuButtonRef.current?.contains(target)) return;
            setMenuOpen(false);
        };

        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('pointerdown', onPointerDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('pointerdown', onPointerDown);
        };
    }, [menuOpen]);

    useEffect(() => {
        if (!token) return;

        const offCreated = onTicketCreated(getToken, () => {
            showToast('New support ticket received', 'info');
            fetchTicketsRef.current?.(1);
        });

        const offMessage = onTicketMessage(getToken, (payload) => {
            const tid = String(payload?.ticketId || '').trim();
            if (!tid) return;

            const message = payload?.message || {};
            const time = new Date(message.createdAt || Date.now()).toLocaleTimeString();
            const normalized = {
                ...message,
                id: message._id || message.id || `msg-${tid}-${Date.now()}`,
                time,
            };

            // Best-effort system notification (in addition to FCM push) for incoming customer messages.
            // Helps when browser push tokens are not registered or when testing in the same browser session.
            const shouldNotify =
                normalized?.isAdmin === false &&
                (document.hidden || String(selectedTicketRoomRef.current || '') !== tid);

            if (shouldNotify && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                const ticket = (ticketsRef.current || []).find((t) => String(t.id) === tid);
                const userLabel = ticket?.user ? String(ticket.user) : 'Customer';
                const body = String(normalized.text || 'New message').trim() || 'New message';
                const link = `/admin/support-tickets?ticketId=${encodeURIComponent(tid)}`;

                navigator.serviceWorker?.ready
                    .then((reg) => reg?.showNotification?.(`Support message from ${userLabel}`, {
                        body,
                        tag: `ticket-${tid}`,
                        data: { link },
                    }))
                    .catch(() => {
                        // Ignore; fallback to normal in-app UI.
                    });
            }

            setTickets((prev) => prev.map((t) => {
                if (String(t.id) !== tid) return t;
                const existing = Array.isArray(t.messages) ? t.messages : [];
                const last = existing[existing.length - 1];
                if (last && last.text === normalized.text && last.senderType === normalized.senderType && last.createdAt === normalized.createdAt) {
                    return t;
                }
                return { ...t, messages: [...existing, normalized] };
            }));

            setSelectedTicket((prev) => {
                if (!prev || String(prev.id) !== tid) return prev;
                const existing = Array.isArray(prev.messages) ? prev.messages : [];
                const last = existing[existing.length - 1];
                if (last && last.text === normalized.text && last.senderType === normalized.senderType && last.createdAt === normalized.createdAt) {
                    return prev;
                }
                return { ...prev, messages: [...existing, normalized] };
            });
        });

        return () => {
            offCreated?.();
            offMessage?.();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    useEffect(() => {
        if (!token) return;
        const nextId = selectedTicket?.id ? String(selectedTicket.id) : null;
        const prevId = selectedTicketRoomRef.current;

        if (prevId && prevId !== nextId) {
            leaveTicketRoom(prevId, getToken);
        }
        if (nextId && prevId !== nextId) {
            joinTicketRoom(nextId, getToken);
        }
        selectedTicketRoomRef.current = nextId;

        return () => {
            const current = selectedTicketRoomRef.current;
            if (current) leaveTicketRoom(current, getToken);
            selectedTicketRoomRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, selectedTicket?.id]);

    const copyToClipboard = async (text) => {
        const value = String(text || '').trim();
        if (!value) return;

        try {
            if (navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(value);
                showToast('Copied to clipboard', 'success');
                return;
            }
        } catch {
            // Fall back below.
        }

        try {
            const textarea = document.createElement('textarea');
            textarea.value = value;
            textarea.setAttribute('readonly', '');
            textarea.style.position = 'fixed';
            textarea.style.left = '-9999px';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showToast('Copied to clipboard', 'success');
        } catch {
            showToast('Copy failed', 'error');
        }
    };

    const handleSetStatus = async (id, status) => {
        try {
            const res = await adminApi.updateTicketStatus(id, status);
            if (res.data.success) {
                setTickets((prev) => prev.map(t => t.id === id ? { ...t, status } : t));
                setSelectedTicket((prev) => prev?.id === id ? { ...prev, status } : prev);
                showToast(`Ticket status updated: ${status}`, 'success');
            }
        } catch (error) {
            showToast("Failed to update status", "error");
        } finally {
            setMenuOpen(false);
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
        return handleSetStatus(id, 'closed');
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
                <Card
                    className="flex-1 flex flex-col border-none shadow-xl ring-1 ring-slate-700/50 rounded-xl overflow-hidden bg-white"
                    contentClassName="p-0 flex flex-col flex-1 min-h-0"
                >
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
                                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border-2 border-slate-800/40 focus:border-slate-900 rounded-2xl text-xs font-bold outline-none transition-all"
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                        {filteredTickets.map((t) => (
                            <button
                                key={t.id}
                                onClick={() => setSelectedTicket(t)}
                                className={cn(
                                    "w-full text-left p-4 pr-10 rounded-2xl transition-all group relative overflow-hidden border border-slate-800/20 bg-white",
                                    selectedTicket?.id === t.id
                                        ? "bg-slate-900 text-white shadow-xl translate-x-1 border-black/30"
                                        : "hover:bg-slate-50 hover:border-slate-800/30 text-slate-700"
                                )}
                            >
                                {Number(unreadByTicket?.[t.id] || 0) > 0 && (
                                    <span
                                        className={cn(
                                            "absolute top-3 right-3 min-w-5 h-5 px-1.5 rounded-full text-[10px] font-black flex items-center justify-center shadow-lg ring-2",
                                            selectedTicket?.id === t.id
                                                ? "bg-rose-500 text-white ring-slate-900 shadow-rose-500/30"
                                                : "bg-rose-500 text-white ring-white shadow-rose-500/30",
                                        )}
                                        aria-label={`Unread messages: ${unreadByTicket?.[t.id]}`}
                                    >
                                        {Number(unreadByTicket?.[t.id] || 0) > 99 ? "99+" : String(unreadByTicket?.[t.id])}
                                    </span>
                                )}
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
                    <Card
                        className="flex-1 min-h-0 flex flex-col border-none shadow-xl ring-1 ring-slate-400 rounded-xl overflow-hidden bg-white"
                        contentClassName="p-0 flex flex-col flex-1 min-h-0"
                    >
                        {/* Chat Header */}
                        <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/30 shrink-0">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-2xl bg-white ring-1 ring-slate-100 flex items-center justify-center text-slate-400 shadow-sm">
                                    <HiOutlineChatBubbleLeftRight className="h-6 w-6" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-black text-slate-900 leading-none mb-1">{selectedTicket.subject}</h3>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                                        Ticket ID: {selectedTicket.id} • USER: {selectedTicket.user} • STATUS: {selectedTicket.status}
                                    </p>
                                </div>
                            </div>
                            <div className="relative flex items-center gap-2">
                                <button
                                    onClick={() => handleResolve(selectedTicket.id)}
                                    className={cn(
                                        "p-2.5 ring-1 ring-slate-200 rounded-xl transition-all",
                                        selectedTicket.status === 'closed' ? "bg-brand-50 text-brand-500 ring-brand-100" : "bg-white text-slate-400 hover:text-brand-500"
                                    )}
                                    title="Mark as Resolved"
                                >
                                    <HiOutlineCheckCircle className="h-5 w-5" />
                                </button>
                                <button
                                    ref={menuButtonRef}
                                    onClick={() => setMenuOpen(v => !v)}
                                    className="p-2.5 bg-white text-slate-400 hover:text-slate-600 ring-1 ring-slate-200 rounded-xl transition-all"
                                    aria-haspopup="menu"
                                    aria-expanded={menuOpen ? "true" : "false"}
                                    title="More actions"
                                >
                                    <HiOutlineEllipsisVertical className="h-5 w-5" />
                                </button>

                                <AnimatePresence>
                                    {menuOpen ? (
                                        <motion.div
                                            ref={menuRef}
                                            initial={{ opacity: 0, y: 8, scale: 0.98 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: 8, scale: 0.98 }}
                                            transition={{ duration: 0.12 }}
                                            className="absolute right-0 top-[52px] w-56 bg-white border-2 border-slate-800/40 rounded-2xl shadow-xl overflow-hidden z-50"
                                            role="menu"
                                        >
                                            <button
                                                onClick={() => copyToClipboard(selectedTicket.id)}
                                                className="w-full text-left px-4 py-3 text-xs font-black text-slate-700 hover:bg-slate-50 transition-colors"
                                                role="menuitem"
                                            >
                                                Copy ticket ID
                                            </button>
                                            <button
                                                onClick={() => copyToClipboard(selectedTicket.user)}
                                                className="w-full text-left px-4 py-3 text-xs font-black text-slate-700 hover:bg-slate-50 transition-colors"
                                                role="menuitem"
                                            >
                                                Copy user name
                                            </button>
                                            <div className="h-px bg-slate-100" />
                                            <button
                                                onClick={() => handleSetStatus(selectedTicket.id, 'open')}
                                                className="w-full text-left px-4 py-3 text-xs font-black text-slate-700 hover:bg-slate-50 transition-colors"
                                                role="menuitem"
                                            >
                                                Mark as open
                                            </button>
                                            <button
                                                onClick={() => handleSetStatus(selectedTicket.id, 'processing')}
                                                className="w-full text-left px-4 py-3 text-xs font-black text-slate-700 hover:bg-slate-50 transition-colors"
                                                role="menuitem"
                                            >
                                                Mark as processing
                                            </button>
                                            <button
                                                onClick={() => handleSetStatus(selectedTicket.id, 'closed')}
                                                className="w-full text-left px-4 py-3 text-xs font-black text-slate-700 hover:bg-slate-50 transition-colors"
                                                role="menuitem"
                                            >
                                                Mark as closed
                                            </button>
                                        </motion.div>
                                    ) : null}
                                </AnimatePresence>
                            </div>
                        </div>

                        {/* Messages Thread + Fixed Reply */}
                            <div className="flex-1 min-h-0 relative overflow-hidden bg-slate-50/20">
                            <div
                                ref={messagesContainerRef}
                                onScroll={(e) => {
                                    const el = e.currentTarget;
                                    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
                                    stickToBottomRef.current = distanceFromBottom < 80;
                                }}
                                className="h-full overflow-y-auto p-4 space-y-6 overscroll-contain touch-pan-y custom-scrollbar pb-40"
                                tabIndex={0}
                                aria-label="Support chat messages"
                                data-lenis-prevent
                            >
                                {selectedTicket.messages.map((m) => (
                                    <div key={m.id} className={cn("flex flex-col", m.isAdmin ? "items-end" : "items-start")}>
                                        <div className={cn(
                                            "max-w-[80%] p-4 rounded-xl text-sm font-medium leading-relaxed shadow-sm",
                                            m.isAdmin ? "bg-slate-900 text-white rounded-tr-sm" : "bg-white text-slate-700 border border-slate-800/40 rounded-tl-sm"
                                        )}>
                                            {m.mediaUrl ? (
                                                <img
                                                    src={m.mediaUrl}
                                                    alt="Attachment"
                                                    loading="lazy"
                                                    className="max-w-[260px] w-full rounded-xl border border-black/10"
                                                />
                                            ) : null}
                                            {m.text ? <div className={m.mediaUrl ? "mt-2" : ""}>{m.text}</div> : null}
                                        </div>
                                        <span className="text-[9px] font-bold text-slate-400 mt-2 px-1 uppercase tracking-widest">{m.time}</span>
                                    </div>
                                ))}
                            </div>

                            <div className="absolute inset-x-0 bottom-0 p-6 bg-white border-t border-slate-50 shadow-[0_-10px_30px_rgba(15,23,42,0.05)]">
                                <div className="flex items-center gap-4 bg-slate-50 p-2 rounded-2xl border-2 border-slate-800/70 focus-within:border-slate-900 focus-within:bg-white transition-all">
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
                                        className="h-10 w-10 bg-primary text-primary-foreground rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100"
                                    >
                                        <HiOutlinePaperAirplane className="h-5 w-5 -rotate-45 -mt-0.5 ml-0.5" />
                                    </button>
                                </div>
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
