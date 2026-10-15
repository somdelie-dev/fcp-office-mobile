import type { MessageAudience } from "@/lib/apiClient";

export const AUDIENCE_LABEL: Record<MessageAudience, string> = {
  ALL_FOREMEN: "All foremen",
  ALL_SUPERVISORS: "All supervisors",
  ALL_FOREMEN_AND_SUPERVISORS: "All foremen and supervisors",
  SELECTED: "Selected people",
};

export const MESSAGE_ACCENT = "#22c55e";

/** Shared by the admin Messages screens so they look like one feature. */
export const messageThemes = {
  dark: {
    textPrimary: "#e5e7eb",
    textSecondary: "#94a3b8",
    cardBg: "rgba(15,23,42,0.85)",
    emptyText: "#64748b",
    rowBorder: "rgba(148,163,184,0.15)",
    inputBg: "rgba(255,255,255,0.08)",
    border: "rgba(148,163,184,0.2)",
    sheetBg: "#0f172a",
    barBg: "rgba(11,24,38,0.97)",
  },
  light: {
    textPrimary: "#111",
    textSecondary: "#666",
    cardBg: "rgba(255,255,255,0.9)",
    emptyText: "#94a3b8",
    rowBorder: "rgba(0,0,0,0.08)",
    inputBg: "rgba(0,0,0,0.04)",
    border: "rgba(0,0,0,0.1)",
    sheetBg: "#ffffff",
    barBg: "rgba(255,255,255,0.97)",
  },
};

export type MessageColors = (typeof messageThemes)["light"];

export function relativeTime(iso: string) {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

export function dateTimeLabel(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function peopleLabel(n: number) {
  return `${n} ${n === 1 ? "person" : "people"}`;
}
