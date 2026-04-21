import React, { useEffect, useRef, useState } from 'react';
import Card from '@shared/components/ui/Card';
import Badge from '@shared/components/ui/Badge';
import PageHeader from '@shared/components/ui/PageHeader';
import { useToast } from '@shared/components/ui/Toast';
import {
    HiOutlinePaperAirplane,
    HiOutlineBars3BottomLeft,
    HiOutlineLink,
    HiOutlineUsers,
    HiOutlineBuildingStorefront,
    HiOutlineMapPin,
    HiOutlineClock,
    HiOutlinePhoto,
    HiOutlineDevicePhoneMobile,
    HiOutlineSparkles,
    HiOutlineTruck,
    HiOutlineBolt,
    HiOutlineExclamationCircle,
    HiOutlineCheckCircle,
    HiOutlineChartBar
} from 'react-icons/hi2';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { useSettings } from '@core/context/SettingsContext';
import { Smile } from 'lucide-react';
import axiosInstance from '@core/api/axios';
import { adminApi } from '../services/adminApi';

const EMOJIS = [
    '🔥', '🎉', '✅', '⚡', '💥', '💸', '🛍️', '🎁', '🚚', '📦',
    '⏰', '📣', '📌', '🆕', '🛒', '🏷️', '💳', '💰', '📉', '📈',
    '❤️', '💙', '💚', '🧡', '✨', '⭐', '🌟', '🚀', '🎯', '💯',
    '😀', '😄', '😁', '😂', '😉', '😊', '😍', '🤩', '😎', '🤔',
    '🙏', '🤝', '👍', '👎', '👀', '💪', '🎊', '🥳', '🎈', '🎂',
    '🍕', '🍔', '🍟', '🍦', '🍩', '🍫', '🥤', '☕', '🍎', '🥗',
    '🌧️', '☀️', '❄️', '🌙', '🌈', '⚠️', '❗', '❓', '🔔', '🔒',
];

const NotificationComposer = () => {
    const { showToast } = useToast();
    const { settings } = useSettings();
    const appName = (settings?.appName || 'App').toUpperCase();
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [selectedSegment, setSelectedSegment] = useState('customers');
    const [deepLink, setDeepLink] = useState('');
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [location, setLocation] = useState('all');
    const [lastOrder, setLastOrder] = useState('any');
    const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
    const [emojiTarget, setEmojiTarget] = useState('title'); // 'title' | 'message'
    const [emojiPickerPos, setEmojiPickerPos] = useState({ top: 0, left: 0 });

    const titleInputRef = useRef(null);
    const messageInputRef = useRef(null);
    const titleEmojiBtnRef = useRef(null);
    const messageEmojiBtnRef = useRef(null);
    const emojiPopoverRef = useRef(null);
    const imageInputRef = useRef(null);

    const [audienceStats, setAudienceStats] = useState({
        all: 0,
        customers: 0,
        sellers: 0,
        delivery: 0,
    });

    const segments = [
        { id: 'all', label: 'All Users', count: audienceStats.all, description: 'Universal Reach', icon: HiOutlineUsers, color: 'slate' },
        { id: 'customers', label: 'Customers', count: audienceStats.customers, description: 'Customer Audience', icon: HiOutlineUsers, color: 'blue' },
        { id: 'sellers', label: 'Sellers', count: audienceStats.sellers, description: 'Seller Audience', icon: HiOutlineBuildingStorefront, color: 'purple' },
        { id: 'delivery', label: 'Delivery Partners', count: audienceStats.delivery, description: 'Delivery Audience', icon: HiOutlineTruck, color: 'emerald' },
    ];

    useEffect(() => {
        let isMounted = true;
        const loadAudienceStats = async () => {
            try {
                const res = await adminApi.getBroadcastAudienceStats();
                const result = res?.data?.result || {};
                if (!isMounted) return;
                setAudienceStats({
                    all: Number(result?.all || 0),
                    customers: Number(result?.customers || 0),
                    sellers: Number(result?.sellers || 0),
                    delivery: Number(result?.delivery || 0),
                });
            } catch {
                // keep defaults when stats endpoint fails
            }
        };
        loadAudienceStats();
        return () => {
            isMounted = false;
        };
    }, []);

    const handleSend = async () => {
        if (isSending) return;
        if (!title || !message) {
            showToast('Please complete the notification broadcast fields', 'warning');
            return;
        }

        try {
            setIsSending(true);
            const targetCount = Number(segments.find((s) => s.id === selectedSegment)?.count || 0);
            showToast(`Broadcasting to ${targetCount.toLocaleString('en-IN')} users...`, 'info');

            let uploadedImageUrl = '';
            if (imageFile) {
                const uploadForm = new FormData();
                uploadForm.append('file', imageFile);
                const uploadRes = await axiosInstance.post('/media/upload', uploadForm, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
                uploadedImageUrl =
                    uploadRes.data?.result?.url ||
                    uploadRes.data?.data?.url ||
                    uploadRes.data?.url ||
                    '';
                if (!uploadedImageUrl) {
                    throw new Error('Failed to upload image');
                }
            }

            const broadcastRes = await adminApi.broadcastNotification({
                audience: selectedSegment,
                title,
                message,
                deepLink: deepLink || '',
                imageUrl: uploadedImageUrl || '',
            });

            const result = broadcastRes?.data?.result || {};
            const targetedUsers = Number(result?.targetedUsers || 0);
            const delivered = Number(result?.delivered || 0);
            showToast(
                `Campaign launched: ${delivered} delivered to ${targetedUsers} targeted users`,
                'success'
            );
            setTitle('');
            setMessage('');
            setDeepLink('');
            setImageFile(null);
            setImagePreview('');
        } catch (error) {
            const errorMessage =
                error?.response?.data?.message ||
                error?.message ||
                'Failed to send notification';
            showToast(errorMessage, 'error');
        } finally {
            setIsSending(false);
        }
    };

    const handleImageSelect = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!String(file.type || '').startsWith('image/')) {
            showToast('Please select an image file', 'warning');
            if (e.target) e.target.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = (evt) => {
            setImageFile(file);
            setImagePreview(String(evt?.target?.result || ''));
        };
        reader.readAsDataURL(file);

        // Reset input so the same file can be re-selected.
        if (e.target) e.target.value = '';
    };

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

    const closeEmojiPicker = () => setEmojiPickerOpen(false);

    const openEmojiPicker = (target) => {
        const nextTarget = target === 'message' ? 'message' : 'title';
        if (emojiPickerOpen && emojiTarget === nextTarget) {
            closeEmojiPicker();
            return;
        }
        setEmojiTarget(nextTarget);
        setEmojiPickerOpen(true);

        const btn = nextTarget === 'message' ? messageEmojiBtnRef.current : titleEmojiBtnRef.current;
        if (!btn || typeof btn.getBoundingClientRect !== 'function' || typeof window === 'undefined') return;

        const rect = btn.getBoundingClientRect();
        const popoverWidth = 280;
        const padding = 12;
        const left = clamp(rect.right - popoverWidth, padding, window.innerWidth - popoverWidth - padding);
        const top = rect.bottom + 10;
        setEmojiPickerPos({ top, left });
    };

    useEffect(() => {
        if (!emojiPickerOpen) return;

        const onKeyDown = (e) => {
            if (e.key === 'Escape') closeEmojiPicker();
        };

        const onPointerDown = (e) => {
            const target = e.target;
            if (!target) return;
            if (emojiPopoverRef.current?.contains(target)) return;
            if (titleEmojiBtnRef.current?.contains(target)) return;
            if (messageEmojiBtnRef.current?.contains(target)) return;
            closeEmojiPicker();
        };

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('pointerdown', onPointerDown);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('pointerdown', onPointerDown);
        };
    }, [emojiPickerOpen]);

    const insertEmoji = (emoji) => {
        const nextEmoji = String(emoji || '');
        if (!nextEmoji) return;

        const isMessage = emojiTarget === 'message';
        const el = isMessage ? messageInputRef.current : titleInputRef.current;
        const value = isMessage ? message : title;
        const setValue = isMessage ? setMessage : setTitle;

        const start = typeof el?.selectionStart === 'number' ? el.selectionStart : value.length;
        const end = typeof el?.selectionEnd === 'number' ? el.selectionEnd : value.length;
        const next = `${value.slice(0, start)}${nextEmoji}${value.slice(end)}`;

        setValue(next);

        requestAnimationFrame(() => {
            try {
                el?.focus?.();
                const caret = start + nextEmoji.length;
                el?.setSelectionRange?.(caret, caret);
            } catch {
                // ignore
            }
        });
    };

    return (
        <div className="ds-section-spacing">
            {/* Header */}
            <PageHeader
                title="Growth Signal"
                description="Create and send targeted notifications to keep customers engaged."
                badge={
                    <Badge variant="warning" className="ds-badge ds-badge-warning">
                        Push Engine
                    </Badge>
                }
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Composer Section */}
                <div className="lg:col-span-2 space-y-6">
                    <Card className="ds-card-standard">
                        <div className="space-y-6">
                            {/* Card Header */}
                            <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                                <div className="ds-stat-card-icon bg-primary/10">
                                    <HiOutlinePaperAirplane className="ds-icon-lg text-primary -rotate-45" />
                                </div>
                                <div>
                                    <h3 className="ds-h3">Campaign Composer</h3>
                                    <p className="ds-caption text-slate-400">Design your notification</p>
                                </div>
                            </div>

                            {/* Form Fields */}
                            <div className="space-y-5">
                                {/* Title */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className="ds-label">Notification Title</label>
                                        <button
                                            ref={titleEmojiBtnRef}
                                            type="button"
                                            onClick={() => openEmojiPicker('title')}
                                            className={cn(
                                                "inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl transition-all ring-1",
                                                emojiPickerOpen && emojiTarget === 'title'
                                                    ? "bg-primary/10 text-primary ring-primary/20"
                                                    : "bg-slate-50 text-slate-500 ring-slate-200 hover:bg-slate-100 hover:text-slate-700"
                                            )}
                                            aria-label="Add emoji to title"
                                            title="Add emoji"
                                        >
                                            <Smile className="h-4 w-4" />
                                            Emoji
                                        </button>
                                    </div>
                                    <input
                                        ref={titleInputRef}
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        onFocus={() => setEmojiTarget('title')}
                                        placeholder="E.g. Hot Deals are back! 🔥"
                                        className="ds-input w-full pr-12"
                                        maxLength={50}
                                    />
                                    <p className="ds-caption text-slate-400 text-right">{title.length}/50</p>
                                </div>

                                {/* Message */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className="ds-label">Broadcast Message</label>
                                        <button
                                            ref={messageEmojiBtnRef}
                                            type="button"
                                            onClick={() => openEmojiPicker('message')}
                                            className={cn(
                                                "inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl transition-all ring-1",
                                                emojiPickerOpen && emojiTarget === 'message'
                                                    ? "bg-primary/10 text-primary ring-primary/20"
                                                    : "bg-slate-50 text-slate-500 ring-slate-200 hover:bg-slate-100 hover:text-slate-700"
                                            )}
                                            aria-label="Add emoji to message"
                                            title="Add emoji"
                                        >
                                            <Smile className="h-4 w-4" />
                                            Emoji
                                        </button>
                                    </div>
                                    <textarea
                                        ref={messageInputRef}
                                        rows={4}
                                        value={message}
                                        onChange={(e) => setMessage(e.target.value)}
                                        onFocus={() => setEmojiTarget('message')}
                                        placeholder="Enter your push notification body text..."
                                        className="ds-textarea w-full resize-none pr-12"
                                        maxLength={200}
                                    />
                                    <p className="ds-caption text-slate-400 text-right">{message.length}/200</p>
                                </div>

                                {/* Deep Link & Image */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="ds-label">Deep Link (Optional)</label>
                                        <div className="relative">
                                            <HiOutlineLink className="absolute left-3 top-1/2 -translate-y-1/2 ds-icon-sm text-slate-400" />
                                            <input
                                                value={deepLink}
                                                onChange={(e) => setDeepLink(e.target.value)}
                                                className="ds-input w-full pl-9"
                                                placeholder="/deals/category"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="ds-label">Image (Optional)</label>
                                        <input
                                            ref={imageInputRef}
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={handleImageSelect}
                                        />

                                        <button
                                            type="button"
                                            onClick={() => imageInputRef.current?.click?.()}
                                            className="ds-input w-full flex items-center gap-2 justify-start text-left hover:bg-slate-50 transition-colors"
                                        >
                                            <HiOutlinePhoto className="ds-icon-sm text-slate-400" />
                                            <span className="text-xs font-bold text-slate-600 truncate">
                                                {imageFile?.name || 'Choose an image file...'}
                                            </span>
                                        </button>

                                        {imagePreview ? (
                                            <div className="flex items-center gap-3 pt-1">
                                                <img
                                                    src={imagePreview}
                                                    alt="Selected notification"
                                                    className="h-10 w-10 rounded-xl object-cover ring-1 ring-slate-200"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setImageFile(null);
                                                        setImagePreview('');
                                                    }}
                                                    className="text-[10px] font-black uppercase tracking-widest text-rose-600 hover:text-rose-700"
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            </div>

                            {/* Send Button */}
                            <button
                                onClick={handleSend}
                                disabled={!title || !message || isSending}
                                className="ds-btn ds-btn-lg w-full bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                <HiOutlineBolt className="ds-icon-md text-amber-400" />
                                {isSending ? 'SENDING...' : 'BLAST SIGNAL'}
                            </button>
                        </div>
                    </Card>

                    {emojiPickerOpen && (
                        <div
                            ref={emojiPopoverRef}
                            className="fixed z-[999999] w-[280px] bg-white rounded-2xl shadow-2xl border border-slate-200 p-3"
                            style={{ top: emojiPickerPos.top, left: emojiPickerPos.left }}
                            role="dialog"
                            aria-label="Emoji picker"
                        >
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    Add Emoji
                                </p>
                                <button
                                    type="button"
                                    onClick={closeEmojiPicker}
                                    className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-900"
                                >
                                    Close
                                </button>
                            </div>
                            <div className="grid grid-cols-10 gap-1.5">
                                {EMOJIS.map((emoji) => (
                                    <button
                                        key={emoji}
                                        type="button"
                                        onClick={() => insertEmoji(emoji)}
                                        className="h-8 w-8 rounded-xl hover:bg-slate-50 transition-colors text-lg flex items-center justify-center"
                                        aria-label={`Insert ${emoji}`}
                                        title={`Insert ${emoji}`}
                                    >
                                        {emoji}
                                    </button>
                                ))}
                            </div>
                            <p className="mt-2 text-[10px] font-bold text-slate-400">
                                Tip: click inside the text field, then pick emojis.
                            </p>
                        </div>
                    )}

                    {/* Tips Card */}
                    <Card className="ds-card-compact bg-brand-50 border-brand-100">
                        <div className="flex gap-3">
                            <HiOutlineExclamationCircle className="ds-icon-lg text-brand-600 flex-shrink-0" />
                            <div>
                                <h4 className="ds-h4 text-brand-900 mb-1">Best Practices</h4>
                                <ul className="ds-body text-brand-700 space-y-1">
                                    <li>• Keep titles under 40 characters for better visibility</li>
                                    <li>• Use emojis sparingly to grab attention</li>
                                    <li>• Test with different audience segments</li>
                                    <li>• Schedule during peak engagement hours</li>
                                </ul>
                            </div>
                        </div>
                    </Card>
                </div>

                {/* Sidebar - Preview & Audience */}
                <div className="lg:col-span-1 space-y-6">
                    {/* Real-time Preview */}
                    <div className="space-y-3">
                        <h3 className="ds-h4 px-1">Protocol Preview</h3>
                        <Card className="ds-card-standard bg-gradient-to-br from-slate-900 to-slate-800 border-none">
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <span className="ds-caption text-slate-400">Live Preview</span>
                                    <Badge variant="success" className="ds-badge ds-badge-success text-[8px]">
                                        LOCKED
                                    </Badge>
                                </div>

                                {/* iOS Style Notification */}
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="bg-white/10 backdrop-blur-xl p-4 rounded-xl border border-white/10 space-y-3"
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="h-5 w-5 bg-primary rounded-lg flex items-center justify-center">
                                                <HiOutlineDevicePhoneMobile className="h-3 w-3 text-white" />
                                            </div>
                                            <span className="text-[10px] font-bold text-white uppercase tracking-wider">{appName}</span>
                                        </div>
                                        <span className="text-[10px] font-semibold text-white/90">Just Now</span>
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-bold text-white mb-1.5 truncate">
                                            {title || 'Hot Deals are back! 🔥'}
                                        </h4>
                                        {imagePreview ? (
                                            <img
                                                src={imagePreview}
                                                alt="Notification attachment"
                                                className="w-full h-32 object-cover rounded-xl border border-white/10 mb-2"
                                                loading="lazy"
                                            />
                                        ) : null}
                                        <p className="text-xs font-medium text-white/95 line-clamp-3 leading-relaxed">
                                            {message || 'Type your message to see it reflect here in real-time...'}
                                        </p>
                                    </div>
                                </motion.div>
                            </div>
                        </Card>
                    </div>

                    {/* Audience Segmentation */}
                    <div className="space-y-3">
                        <h3 className="ds-h4 px-1">Audience Segmentation</h3>
                        <div className="space-y-2">
                            {segments.map((seg) => (
                                <button
                                    key={seg.id}
                                    onClick={() => setSelectedSegment(seg.id)}
                                    className={cn(
                                        "w-full p-4 rounded-xl text-left transition-all",
                                        selectedSegment === seg.id
                                            ? "bg-slate-900 text-white shadow-lg ring-2 ring-slate-900"
                                            : "bg-white text-slate-700 ring-1 ring-slate-200 hover:ring-slate-300"
                                    )}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className={cn(
                                            "p-2 rounded-lg flex-shrink-0",
                                            selectedSegment === seg.id ? "bg-white/10" : `bg-${seg.color}-50`
                                        )}>
                                            <seg.icon className={cn(
                                                "ds-icon-md",
                                                selectedSegment === seg.id ? "text-white" : `text-${seg.color}-600`
                                            )} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1">
                                                <h4 className="ds-body font-bold truncate">{seg.label}</h4>
                                                <span className={cn(
                                                    "ds-body font-bold",
                                                    selectedSegment === seg.id ? "text-primary" : "text-slate-900"
                                                )}>
                                                    {Number(seg.count || 0).toLocaleString('en-IN')}
                                                </span>
                                            </div>
                                            <p className={cn(
                                                "ds-caption",
                                                selectedSegment === seg.id ? "text-white/60" : "text-slate-400"
                                            )}>
                                                {seg.description}
                                            </p>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default NotificationComposer;
