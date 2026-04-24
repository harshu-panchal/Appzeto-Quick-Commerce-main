import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@core/context/AuthContext";
import { disconnectOrderSocket, onTicketMessage } from "@core/services/orderSocket";

const SupportUnreadContext = createContext(undefined);

function safeParseJson(value, fallback) {
  try {
    if (!value) return fallback;
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function sumCounts(map) {
  if (!map || typeof map !== "object") return 0;
  return Object.values(map).reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0);
}

function getCurrentPathname() {
  return typeof window === "undefined" ? "" : window.location.pathname;
}

export const SupportUnreadProvider = ({ children }) => {
  const { token, role, user } = useAuth();
  const [pathname, setPathname] = useState(getCurrentPathname);

  const userId = useMemo(() => {
    return String(user?._id || user?.id || "").trim();
  }, [user?._id, user?.id]);

  const storageKey = useMemo(() => {
    const r = String(role || "").trim().toLowerCase();
    if (!r || !userId) return "";
    return `supportUnread:${r}:${userId}`;
  }, [role, userId]);

  const [unreadByTicket, setUnreadByTicket] = useState(() => {
    if (typeof window === "undefined") return {};
    const raw = storageKey ? window.localStorage.getItem(storageKey) : null;
    const parsed = safeParseJson(raw, {});
    return parsed && typeof parsed === "object" ? parsed : {};
  });

  const activeTicketIdRef = useRef("");
  const isViewingRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const updatePathname = () => setPathname(window.location.pathname);
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    window.history.pushState = function pushState(...args) {
      const result = originalPushState.apply(this, args);
      updatePathname();
      return result;
    };
    window.history.replaceState = function replaceState(...args) {
      const result = originalReplaceState.apply(this, args);
      updatePathname();
      return result;
    };

    window.addEventListener("popstate", updatePathname);
    return () => {
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
      window.removeEventListener("popstate", updatePathname);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!storageKey) return;
    window.localStorage.setItem(storageKey, JSON.stringify(unreadByTicket || {}));
  }, [storageKey, unreadByTicket]);

  useEffect(() => {
    if (!storageKey) return;
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(storageKey) : null;
    const parsed = safeParseJson(raw, {});
    setUnreadByTicket(parsed && typeof parsed === "object" ? parsed : {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const setIsViewingSupportChat = useCallback((value) => {
    isViewingRef.current = Boolean(value);
  }, []);

  const setActiveTicketId = useCallback((ticketId) => {
    activeTicketIdRef.current = String(ticketId || "").trim();
  }, []);

  const markTicketRead = useCallback((ticketId) => {
    const tid = String(ticketId || "").trim();
    if (!tid) return;
    setUnreadByTicket((prev) => {
      if (!prev || typeof prev !== "object") return prev;
      if (!prev[tid]) return prev;
      const next = { ...prev };
      delete next[tid];
      return next;
    });
  }, []);

  const markAllRead = useCallback(() => {
    setUnreadByTicket({});
  }, []);

  const totalUnread = useMemo(() => sumCounts(unreadByTicket), [unreadByTicket]);

  useEffect(() => {
    if (!token) return;
    const r = String(role || "").toLowerCase();
    if (r !== "admin" && r !== "customer" && r !== "user") return;
    if (r === "admin" && pathname.startsWith("/admin/settings")) {
      disconnectOrderSocket();
      return;
    }

    const getToken = () => token;
    const offMessage = onTicketMessage(getToken, (payload) => {
      const tid = String(payload?.ticketId || "").trim();
      const msg = payload?.message || {};
      if (!tid) return;

      const isAdminMsg = Boolean(msg?.isAdmin);
      const isRelevant =
        (r === "admin" && !isAdminMsg) ||
        ((r === "customer" || r === "user") && isAdminMsg);

      if (!isRelevant) return;

      const isCurrentlyViewing =
        isViewingRef.current && activeTicketIdRef.current && activeTicketIdRef.current === tid;

      if (isCurrentlyViewing) return;

      setUnreadByTicket((prev) => {
        const nextPrev = prev && typeof prev === "object" ? prev : {};
        const current = Number(nextPrev[tid] || 0);
        const nextCount = Number.isFinite(current) ? current + 1 : 1;
        return { ...nextPrev, [tid]: nextCount };
      });
    });

    return () => {
      offMessage?.();
    };
  }, [token, role, pathname]);

  const value = useMemo(
    () => ({
      unreadByTicket,
      totalUnread,
      setIsViewingSupportChat,
      setActiveTicketId,
      markTicketRead,
      markAllRead,
    }),
    [unreadByTicket, totalUnread, setIsViewingSupportChat, setActiveTicketId, markTicketRead, markAllRead],
  );

  return <SupportUnreadContext.Provider value={value}>{children}</SupportUnreadContext.Provider>;
};

export const useSupportUnread = () => {
  const ctx = useContext(SupportUnreadContext);
  if (!ctx) throw new Error("useSupportUnread must be used within SupportUnreadProvider");
  return ctx;
};
