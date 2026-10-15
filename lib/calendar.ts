import type { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import type React from "react";

import {
  apiCalendarEvents,
  type CalendarCategory,
  type CalendarEventDto,
} from "@/lib/apiClient";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

export const CATEGORY_META: Record<
  CalendarCategory,
  { label: string; icon: IconName; face: [string, string]; edge: string }
> = {
  MEETING: {
    label: "Meeting",
    icon: "people",
    face: ["#60a5fa", "#2563eb"],
    edge: "#1e3a8a",
  },
  SITE_VISIT: {
    label: "Site visit",
    icon: "business",
    face: ["#4ade80", "#16a34a"],
    edge: "#14532d",
  },
  DEADLINE: {
    label: "Deadline",
    icon: "flag",
    face: ["#f87171", "#dc2626"],
    edge: "#7f1d1d",
  },
  REMINDER: {
    label: "Reminder",
    icon: "alarm",
    face: ["#fbbf24", "#d97706"],
    edge: "#78350f",
  },
  OTHER: {
    label: "Other",
    icon: "ellipse",
    face: ["#a78bfa", "#7c3aed"],
    edge: "#4c1d95",
  },
};

export const CATEGORIES = Object.keys(CATEGORY_META) as CalendarCategory[];

export const REMINDER_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "No reminder" },
  { value: 0, label: "At start time" },
  { value: 10, label: "10 minutes before" },
  { value: 30, label: "30 minutes before" },
  { value: 60, label: "1 hour before" },
  { value: 1440, label: "1 day before" },
];

export function reminderLabel(minutes: number | null) {
  return (
    REMINDER_OPTIONS.find((o) => o.value === minutes)?.label ?? "No reminder"
  );
}

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Six Monday-first weeks covering the month, as the grid shows them. */
export function monthGrid(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const start = addDays(first, -offset);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function monthLabel(d: Date) {
  return d.toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
}

export function dayLabel(d: Date) {
  return d.toLocaleDateString("en-ZA", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en-ZA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function eventTimeRange(e: CalendarEventDto) {
  if (e.allDay) return "All day";
  return e.endsAt
    ? `${timeLabel(e.startsAt)} - ${timeLabel(e.endsAt)}`
    : timeLabel(e.startsAt);
}

/** Days an event touches, so multi-day events show on each of them. */
export function eventDays(e: CalendarEventDto) {
  const start = startOfDay(new Date(e.startsAt));
  const end = e.endsAt ? startOfDay(new Date(e.endsAt)) : start;
  const days: Date[] = [];
  for (let d = start; d <= end && days.length < 62; d = addDays(d, 1))
    days.push(d);
  return days;
}

/** "HH:MM" every 15 minutes, for the time pickers. */
export const TIME_SLOTS = Array.from({ length: 96 }, (_, i) => {
  const h = String(Math.floor(i / 4)).padStart(2, "0");
  const m = String((i % 4) * 15).padStart(2, "0");
  return `${h}:${m}`;
});

export function withTime(day: Date, hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
}

export function hhmm(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const LOCAL_PREFIX = "calendar-";
const LOCAL_DAYS = 14;

/**
 * Schedules on-phone reminders for the next 14 days. This is the only
 * reminder channel (no server cron), so it runs on app open, on return to the
 * app and when a calendar notification arrives. Safe to call often: existing
 * calendar reminders are cancelled and rebuilt from the server's current list.
 */
export async function syncLocalReminders(userId?: string) {
  try {
    const now = new Date();
    const res = await apiCalendarEvents(
      now.toISOString(),
      addDays(now, LOCAL_DAYS).toISOString(),
    );

    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((n) => n.identifier.startsWith(LOCAL_PREFIX))
        .map((n) =>
          Notifications.cancelScheduledNotificationAsync(n.identifier),
        ),
    );

    for (const e of res.events) {
      if (e.reminderMinutes == null || e.myResponse === "DECLINED") continue;
      const remindAt = new Date(
        new Date(e.startsAt).getTime() - e.reminderMinutes * 60_000,
      );
      if (remindAt.getTime() <= now.getTime() + 30_000) continue;
      await Notifications.scheduleNotificationAsync({
        identifier: `${LOCAL_PREFIX}${e.id}`,
        content: {
          title: `Reminder: ${e.title}`,
          body: `${e.allDay ? "All day" : timeLabel(e.startsAt)}${e.location ? ` at ${e.location}` : ""}`,
          data: { type: "CALENDAR_REMINDER", calendarEventId: e.id, userId },
          sound: "default",
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: remindAt,
        },
      });
    }
  } catch (e) {
    // Leaves the previous schedule cancelled only if the fetch succeeded;
    // a failed fetch throws before anything is cancelled.
    console.warn("Calendar reminder sync failed:", e);
  }
}
