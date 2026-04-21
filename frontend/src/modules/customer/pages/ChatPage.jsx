import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Send, Phone, Paperclip, Smile } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useSettings } from "@core/context/SettingsContext";
import { useAuth } from "@core/context/AuthContext";
import { useToast } from "@shared/components/ui/Toast";
import axiosInstance from "@core/api/axios";
import { customerApi } from "../services/customerApi";
import { useSupportUnread } from "@core/context/SupportUnreadContext";
import {
  joinTicketRoom,
  leaveTicketRoom,
  onTicketMessage,
} from "@/core/services/orderSocket";

const emojis = [
  "😀",
  "😂",
  "😍",
  "🥺",
  "😎",
  "😭",
  "😡",
  "👍",
  "👎",
  "🎉",
  "❤️",
  "🔥",
  "✅",
  "❌",
  "👋",
  "🙏",
  "👀",
  "💯",
  "💩",
  "🤡",
];

function formatTime(value) {
  if (!value) return "";
  try {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function normalizeTicketMessages(rawMessages = []) {
  const list = Array.isArray(rawMessages) ? rawMessages : [];
  return list.map((m, idx) => {
    const createdAt = m?.createdAt || null;
    return {
      id: m?._id || m?.id || `${createdAt || Date.now()}-${idx}`,
      text: m?.text || "",
      mediaUrl: m?.mediaUrl || "",
      mediaType: m?.mediaType || "",
      sender: m?.isAdmin ? "support" : "user",
      createdAt,
      time: formatTime(createdAt),
    };
  });
}

function mergeIncomingMessage(prev, incoming) {
  const next = Array.isArray(prev) ? prev : [];
  if (!incoming) return next;

  const last = next[next.length - 1];
  if (
    last &&
    last.text === incoming.text &&
    String(last.mediaUrl || "") === String(incoming.mediaUrl || "") &&
    last.sender === incoming.sender &&
    (last.createdAt && incoming.createdAt ? last.createdAt === incoming.createdAt : true)
  ) {
    return next;
  }

  return [...next, incoming];
}

const ChatPage = () => {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { token } = useAuth();
  const { showToast } = useToast();
  const { setIsViewingSupportChat, setActiveTicketId, markTicketRead } = useSupportUnread();

  const appName = settings?.appName || "App";
  const [logoFailed, setLogoFailed] = useState(false);
  const brandLogoUrl = String(settings?.logoUrl || settings?.faviconUrl || "").trim();
  const supportPhone = String(settings?.supportPhone || "").trim();
  const supportPhoneSanitized = supportPhone
    ? supportPhone.replace(/(?!^\+)[^\d]/g, "")
    : "";
  const supportPhoneHref = supportPhoneSanitized ? `tel:${supportPhoneSanitized}` : "";

  const appInitials = useMemo(() => {
    const words = String(appName || "App")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const first = (words[0] || "A")[0] || "A";
    const second = (words[1] || words[0] || "S")[0] || "S";
    return `${String(first).toUpperCase()}${String(second).toUpperCase()}`;
  }, [appName]);

  const [ticketId, setTicketId] = useState(null);
  const ticketIdRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedImageFile, setSelectedImageFile] = useState(null);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const getToken = useMemo(() => () => token, [token]);

  useEffect(() => {
    setIsViewingSupportChat(true);
    return () => {
      setIsViewingSupportChat(false);
      setActiveTicketId("");
    };
  }, [setIsViewingSupportChat, setActiveTicketId]);

  useEffect(() => {
    ticketIdRef.current = ticketId;
  }, [ticketId]);

  useEffect(() => {
    const tid = ticketId ? String(ticketId).trim() : "";
    setActiveTicketId(tid);
    if (tid) markTicketRead(tid);
  }, [ticketId, setActiveTicketId, markTicketRead]);

  const notifySupportMessage = async ({ title, body, link }) => {
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;

    try {
      const reg = await navigator.serviceWorker?.ready;
      if (reg?.showNotification) {
        await reg.showNotification(String(title || "Notification"), {
          body: String(body || ""),
          tag: ticketIdRef.current ? `ticket-${ticketIdRef.current}` : "support-chat",
          data: { link: link || "/chat" },
        });
      }
    } catch {
      // Best-effort; ignore failures.
    }
  };

  useEffect(() => {
    if (ticketIdRef.current) return;
    setMessages([
      {
        id: "welcome-1",
        text: `Hi there! 👋 Welcome to ${appName} Support.`,
        sender: "support",
        time: "",
      },
      {
        id: "welcome-2",
        text: "Send a message and an admin will reply here.",
        sender: "support",
        time: "",
      },
    ]);
  }, [appName]);

  useEffect(() => {
    if (!token) return;

    let mounted = true;

    async function loadLatestTicket() {
      try {
        setIsLoading(true);
        const res = await customerApi.getMyTickets();
        const raw = res?.data?.result;
        const tickets = Array.isArray(raw)
          ? raw
          : Array.isArray(res?.data?.results)
            ? res.data.results
            : [];

        const active =
          tickets.find((t) => String(t?.status || "").toLowerCase() !== "closed") ||
          tickets[0] ||
          null;

        if (!mounted) return;

        if (active?._id) {
          setTicketId(active._id);
          joinTicketRoom(active._id, getToken);
          setMessages(normalizeTicketMessages(active.messages));
        } else {
          setTicketId(null);
          setMessages([
            {
              id: "welcome-1",
              text: `Hi there! 👋 Welcome to ${appName} Support.`,
              sender: "support",
              time: "",
            },
            {
              id: "welcome-2",
              text: "Send a message and an admin will reply here.",
              sender: "support",
              time: "",
            },
          ]);
        }
      } catch (error) {
        if (!mounted) return;
        showToast("Failed to load support chat", "error");
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    loadLatestTicket();

    return () => {
      mounted = false;
      const current = ticketIdRef.current;
      if (current) leaveTicketRoom(current, getToken);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const off = onTicketMessage(getToken, (payload) => {
      const current = ticketIdRef.current;
      if (!current) return;
      if (String(payload?.ticketId || "") !== String(current)) return;

      const incoming = {
        id:
          payload?.message?._id ||
          payload?.message?.id ||
          `${payload?.message?.createdAt || Date.now()}`,
        text: payload?.message?.text || "",
        mediaUrl: payload?.message?.mediaUrl || "",
        mediaType: payload?.message?.mediaType || "",
        sender: payload?.message?.isAdmin ? "support" : "user",
        createdAt: payload?.message?.createdAt || null,
        time: formatTime(payload?.message?.createdAt),
      };

      setMessages((prev) => mergeIncomingMessage(prev, incoming));

      // Best-effort system notification (in addition to FCM push) for incoming admin replies.
      if (incoming.sender === "support" && document.hidden) {
        notifySupportMessage({
          title: "Support reply",
          body: incoming.text || "New message",
          link: ticketIdRef.current
            ? `/chat?ticketId=${encodeURIComponent(String(ticketIdRef.current))}`
            : "/chat",
        });
      }
    });
    return () => off();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, selectedImage]);

  const handleEmojiClick = (emoji) => {
    setInputText((prev) => `${prev}${emoji}`);
  };

  const handleFileSelect = (e) => {
    setShowAttachmentMenu(false);
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      setSelectedImageFile(file);
      setSelectedImage(evt?.target?.result || null);
    };
    reader.readAsDataURL(file);
    // Reset input so the same file can be re-selected.
    if (e.target) e.target.value = "";
  };

  const handleSend = async () => {
    const text = String(inputText || "").trim();
    if (!text && !selectedImageFile) return;
    if (isSending) return;

    try {
      setIsSending(true);
      setShowEmojiPicker(false);

      let mediaUrl = "";
      if (selectedImageFile) {
        const uploadForm = new FormData();
        uploadForm.append("file", selectedImageFile);
        const uploadRes = await axiosInstance.post("/media/upload", uploadForm, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        mediaUrl =
          uploadRes.data?.result?.url ||
          uploadRes.data?.data?.url ||
          uploadRes.data?.url ||
          "";
        if (!mediaUrl) {
          throw new Error("Failed to upload image");
        }
      }

      if (!ticketIdRef.current) {
        const res = await customerApi.createTicket({
          subject: "Support Chat",
          description: text || (mediaUrl ? "Sent an image" : ""),
          priority: "medium",
          userType: "Customer",
          mediaUrl,
          mediaType: mediaUrl ? "image" : "",
          mimeType: selectedImageFile?.type || "",
        });
        const ticket = res?.data?.result;
        if (ticket?._id) {
          setTicketId(ticket._id);
          ticketIdRef.current = ticket._id;
          joinTicketRoom(ticket._id, getToken);
          setMessages(normalizeTicketMessages(ticket.messages));
        }
      } else {
        const res = await customerApi.replyTicket(ticketIdRef.current, text, {
          mediaUrl,
          mediaType: mediaUrl ? "image" : "",
          mimeType: selectedImageFile?.type || "",
        });
        const ticket = res?.data?.result;
        if (ticket?.messages) {
          setMessages(normalizeTicketMessages(ticket.messages));
        }
      }

      setInputText("");
      setSelectedImage(null);
      setSelectedImageFile(null);
    } catch (error) {
      showToast("Failed to send message", "error");
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") handleSend();
  };

  return (
    <div className="fixed inset-0 bg-white flex flex-col z-[999] overflow-hidden">
      <div className="bg-white px-4 py-4 flex items-center justify-between border-b border-slate-100 z-30 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 rounded-full hover:bg-slate-50 transition-colors text-slate-600"
          >
            <ChevronLeft size={24} />
          </button>
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="h-10 w-10 bg-primary rounded-full flex items-center justify-center text-white font-black text-sm shadow-sm ring-2 ring-white overflow-hidden">
                {brandLogoUrl && !logoFailed ? (
                  <img
                    src={brandLogoUrl}
                    alt={`${appName} logo`}
                    className="h-full w-full object-contain bg-white"
                    onError={() => setLogoFailed(true)}
                  />
                ) : (
                  appInitials
                )}
              </div>
              <div className="absolute bottom-0 right-0 h-3 w-3 bg-brand-500 rounded-full border-2 border-white animate-pulse"></div>
            </div>
            <div>
              <h1 className="text-base font-black text-slate-800 leading-none">
                Support Chat
              </h1>
              <p className="text-[10px] text-brand-600 font-bold mt-1 uppercase tracking-wider flex items-center gap-1">
                <span className="h-1 w-1 bg-brand-500 rounded-full"></span>
                Online
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {supportPhoneHref ? (
            <a
              href={supportPhoneHref}
              className="p-2 rounded-full hover:bg-slate-100 text-slate-500 transition-colors"
              aria-label={`Call support at ${supportPhone}`}
              title={`Call support: ${supportPhone}`}
            >
              <Phone size={20} />
            </a>
          ) : (
            <button
              type="button"
              onClick={() => showToast("Support number not configured", "info")}
              className="p-2 rounded-full text-slate-300 cursor-not-allowed"
              aria-label="Support number not configured"
              title="Support number not configured"
            >
              <Phone size={20} />
            </button>
          )}
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto px-4 py-6 pb-24 space-y-6 min-h-0 overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch]"
        tabIndex={0}
        aria-label="Support chat messages"
        data-lenis-prevent
        data-lenis-prevent-touch
        data-lenis-prevent-wheel
      >
        {isLoading && (
          <div className="text-center text-xs font-bold text-slate-400">
            Loading chat…
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] relative group ${msg.sender === "user" ? "items-end" : "items-start"} flex flex-col`}
            >
              <div
                className={`px-4 py-3 rounded-2xl shadow-sm border text-sm leading-relaxed ${
                  msg.sender === "user"
                    ? "bg-primary text-primary-foreground border-black/25 rounded-tr-none"
                    : "bg-white text-slate-700 border-slate-800/40 rounded-tl-none"
                }`}
              >
                {msg.mediaUrl ? (
                  <img
                    src={msg.mediaUrl}
                    alt="Attachment"
                    loading="lazy"
                    className="max-w-[220px] w-full rounded-xl border border-black/10"
                  />
                ) : null}
                {msg.text ? <div className={msg.mediaUrl ? "mt-2" : ""}>{msg.text}</div> : null}
              </div>
              {msg.time ? (
                <span
                  className={`text-[10px] text-slate-400 mt-1 px-1 font-medium ${
                    msg.sender === "user" ? "text-right" : "text-left"
                  }`}
                >
                  {msg.time}
                </span>
              ) : null}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="bg-white p-3 border-t border-slate-100 shrink-0 z-30 safe-area-bottom relative mb-4">
        <AnimatePresence>
          {showEmojiPicker && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="absolute bottom-full left-4 mb-2 bg-white rounded-2xl shadow-xl border border-slate-100 p-3 grid grid-cols-5 gap-2 w-64 z-50"
            >
              {emojis.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => handleEmojiClick(emoji)}
                  className="text-2xl hover:bg-slate-50 p-2 rounded-lg transition-colors"
                >
                  {emoji}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {selectedImage && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute bottom-full right-4 mb-2 bg-white rounded-xl shadow-lg border border-slate-100 p-2 z-50"
            >
              <div className="relative">
                <img
                  src={selectedImage}
                  alt="Preview"
                  loading="lazy"
                  className="h-20 w-20 object-cover rounded-lg"
                />
                <button
                  onClick={() => {
                    setSelectedImage(null);
                    setSelectedImageFile(null);
                  }}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors"
                >
                  <div
                    className="h-3 w-3 bg-white rotate-45 transform origin-center absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                    style={{
                      clipPath:
                        "polygon(20% 0%, 0% 20%, 30% 50%, 0% 80%, 20% 100%, 50% 70%, 80% 100%, 100% 80%, 70% 50%, 100% 20%, 80% 0%, 50% 30%)",
                      backgroundColor: "white",
                      width: "8px",
                      height: "8px",
                    }}
                  ></div>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showAttachmentMenu && (
            <>
              <motion.button
                type="button"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-40 cursor-default"
                aria-label="Close attachments menu"
                onClick={() => setShowAttachmentMenu(false)}
              />
              <motion.div
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.98 }}
                className="absolute bottom-full left-4 mb-3 w-48 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-xl border border-slate-100 z-50 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => {
                    setShowAttachmentMenu(false);
                    cameraInputRef.current?.click();
                  }}
                  className="w-full text-left px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Open camera
                </button>
                <div className="h-px bg-slate-100" />
                <button
                  type="button"
                  onClick={() => {
                    setShowAttachmentMenu(false);
                    fileInputRef.current?.click();
                  }}
                  className="w-full text-left px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Upload from gallery
                </button>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        <div className="flex items-end gap-2 bg-slate-50 p-2 rounded-[1.5rem] border-2 border-slate-800/70 focus-within:border-slate-900 focus-within:shadow-[0_0_0_4px_rgba(15,23,42,0.08)] transition-all">
          <button
            onClick={() => {
              setShowAttachmentMenu(false);
              setShowEmojiPicker(!showEmojiPicker);
            }}
            className={`p-2.5 rounded-full hover:text-slate-600 hover:bg-slate-200 transition-colors flex-shrink-0 ${
              showEmojiPicker ? "text-primary bg-brand-50" : "text-slate-400"
            }`}
          >
            <Smile size={22} />
          </button>

          <input
            type="file"
            ref={cameraInputRef}
            className="hidden"
            accept="image/*"
            capture="environment"
            onChange={handleFileSelect}
          />
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/*"
            onChange={handleFileSelect}
          />
          <button
            type="button"
            onClick={() => {
              setShowEmojiPicker(false);
              setShowAttachmentMenu((v) => !v);
            }}
            className="p-2.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors flex-shrink-0"
          >
            <Paperclip size={22} />
          </button>

          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Type a message..."
            className="bg-transparent text-sm w-full py-2.5 outline-none text-slate-700 placeholder:text-slate-400 font-medium"
          />
          <button
            onClick={handleSend}
            disabled={!String(inputText || "").trim() || isSending}
            className="p-2.5 rounded-full bg-primary text-primary-foreground hover:bg-[var(--brand-400)] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-brand-200 flex-shrink-0"
          >
            <Send size={20} className="ml-0.5" />
          </button>
        </div>
      </div>

      <style>
        {`
          .safe-area-bottom {
            padding-bottom: env(safe-area-inset-bottom);
          }
        `}
      </style>
    </div>
  );
};

export default ChatPage;
