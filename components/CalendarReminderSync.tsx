import * as Notifications from "expo-notifications";
import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";

import { useAuth } from "@/lib/auth";
import { syncLocalReminders } from "@/lib/calendar";

const MIN_GAP_MS = 2 * 60_000;

/**
 * Keeps on-phone calendar reminders current. There is no server reminder
 * job, so this covers events created or changed while the app was closed:
 * it re-syncs when the app opens, comes back to the foreground, or receives
 * a calendar invite/change notification. Renders nothing.
 */
export function CalendarReminderSync() {
  const { user } = useAuth();
  const lastRun = useRef(0);

  useEffect(() => {
    if (!user || Platform.OS === "web") return;

    const run = (force = false) => {
      const now = Date.now();
      if (!force && now - lastRun.current < MIN_GAP_MS) return;
      lastRun.current = now;
      syncLocalReminders(user.id);
    };

    run(true);

    const appSub = AppState.addEventListener("change", (state) => {
      if (state === "active") run();
    });

    let notifSub: Notifications.Subscription | null = null;
    try {
      notifSub = Notifications.addNotificationReceivedListener((n) => {
        const type = (n.request.content.data as { type?: string } | undefined)
          ?.type;
        // Our own local reminders don't change the schedule; invites and edits do.
        if (type === "CALENDAR_INVITE" || type === "CALENDAR_UPDATED")
          run(true);
      });
    } catch {
      // Notifications unavailable (e.g. Expo Go); app-open syncing still works.
    }

    return () => {
      appSub.remove();
      notifSub?.remove();
    };
  }, [user]);

  return null;
}
