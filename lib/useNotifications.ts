import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { apiFetch } from "./api";

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  siteId: string | null;
  linkUrl: string | null;
}

export function useNotifications(pollIntervalMs = 30 * 60_000) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch = useCallback(async () => {
    try {
      const data = await apiFetch("/api/app/notifications", { auth: true });
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      // network offline — keep stale state
    }
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      await apiFetch("/api/app/notifications", {
        method: "POST",
        auth: true,
        body: JSON.stringify({ all: true }),
        headers: { "Content-Type": "application/json" },
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
      // ignore
    }
  }, []);

  const markRead = useCallback(async (ids: string[]) => {
    try {
      await apiFetch("/api/app/notifications", {
        method: "POST",
        auth: true,
        body: JSON.stringify({ ids }),
        headers: { "Content-Type": "application/json" },
      });
      setNotifications((prev) =>
        prev.map((n) => (ids.includes(n.id) ? { ...n, isRead: true } : n)),
      );
      setUnreadCount((prev) => Math.max(0, prev - ids.length));
    } catch {
      // ignore
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    await fetch();
    setLoading(false);
  }, [fetch]);

  // Poll while app is active
  useEffect(() => {
    refresh();

    intervalRef.current = setInterval(fetch, pollIntervalMs);

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") fetch();
    });

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      sub.remove();
    };
  }, [fetch, pollIntervalMs, refresh]);

  return {
    notifications,
    unreadCount,
    loading,
    refresh,
    markAllRead,
    markRead,
  };
}
