// SupervisorTimesheetDetail.tsx
import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import { GlassCard } from "@/components/GlassCard";
import LoadingOverlay from "@/components/LoadingOverlay";
import { useTheme } from "@/lib/themeContext";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Animated,
} from "react-native";

import { CustomAlert, type AlertButton } from "@/components/CustomAlert";
import type { DayAcceptance, TimesheetDetailDto } from "../../../lib/apiClient";
import {
  apiSupervisorAcceptDay,
  apiSupervisorApproveTimesheet,
  apiSupervisorGetDayAcceptances,
  apiSupervisorMarkPaid,
  apiSupervisorRejectTimesheet,
  apiSupervisorSites,
  apiSupervisorTimesheetDetailMobile,
} from "../../../lib/apiClient";

type Status =
  | "DRAFT"
  | "SUBMITTED"
  | "ACCEPTED"
  | "APPROVED"
  | "REJECTED"
  | "PAID";

const themes = {
  dark: {
    bg: "#0b1220",
    bgSecondary: "#0f172a",
    border: "#1f2a44",
    textPrimary: "white",
    textSecondary: "#94a3b8",
    textTertiary: "#cbd5e1",
    accent: "#38bdf8",
    accentLight: "rgba(56,189,248,0.18)",
    accentBorder: "rgba(56,189,248,0.45)",
    success: "#16a34a",
    error: "#dc2626",
    warning: "#f59e0b",
    cardBg: "rgba(15,23,42,0.8)",
    cardBgHover: "rgba(15,23,42,0.9)",
  },
  light: {
    bg: "#f8fafc",
    bgSecondary: "#ffffff",
    border: "#e2e8f0",
    textPrimary: "#0f172a",
    textSecondary: "#64748b",
    textTertiary: "#475569",
    accent: "#0ea5e9",
    accentLight: "rgba(14,165,233,0.08)",
    accentBorder: "rgba(14,165,233,0.3)",
    success: "#22c55e",
    error: "#ef4444",
    warning: "#fbbf24",
    cardBg: "rgba(255,255,255,0.65)",
    cardBgHover: "rgba(255,255,255,0.75)",
  },
};

/**
 * Accept both:
 * - { timesheet: {...} }
 * - {...}
 */
function pickTimesheet(res: any): any | null {
  if (!res) return null;
  if (res.timesheet) return res.timesheet;
  return res;
}

function safeString(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object") {
    if (typeof v.name === "string") return v.name;
    if (typeof v.fullName === "string") return v.fullName;
    if (typeof v.label === "string") return v.label;
  }
  return "";
}

function normName(s: any) {
  return safeString(s).trim().replace(/\s+/g, " ").toLowerCase();
}

function buildSitesLabel(ts: any): string {
  // Prefer building from sites array to ensure proper deduplication
  const sites = Array.isArray(ts?.sites) ? ts.sites : [];
  if (sites.length > 0) {
    const parts = sites
      .map((s: any) => {
        const code = safeString(s?.code).trim();
        const name = safeString(s?.name).trim();
        // Avoid duplicating code if name already starts with it
        if (code && name) {
          if (name.toLowerCase().startsWith(code.toLowerCase())) {
            return name;
          }
          return `${code} – ${name}`;
        }
        return name || code;
      })
      .filter(Boolean);

    if (parts.length > 0) {
      return parts.join(", ");
    }
  }

  // Fall back to existing sitesLabel if sites array is empty
  const existing = safeString(ts?.sitesLabel).trim();
  return existing || "—";
}

/**
 * Normalize server payload -> mobile TimesheetDetailDto
 * Prevents [object Object] + makes UI consistent.
 */
function normalizeTimesheetDetail(raw: any): TimesheetDetailDto {
  const status = (raw?.status ?? "DRAFT") as Status;

  const columns = Array.isArray(raw?.columns) ? raw.columns : [];
  const rows = Array.isArray(raw?.rows) ? raw.rows : [];

  return {
    id: safeString(raw?.id),
    startISO: safeString(raw?.startISO),
    endISO: safeString(raw?.endISO),

    sitesLabel: buildSitesLabel(raw),

    foremanName:
      safeString(raw?.foremanName) ||
      safeString(raw?.foreman?.name) ||
      safeString(raw?.foreman?.user?.name) ||
      undefined,

    foremanCode: safeString(raw?.foremanCode) || undefined,

    sites: Array.isArray(raw?.sites) ? raw.sites : undefined,

    status,
    submittedAt: raw?.submittedAt ?? null,

    columns,
    rows,
  };
}

function Cell({
  w,
  text,
  bold,
  center,
  style,
  textColor,
  borderColor,
}: {
  w: number;
  text: string;
  bold?: boolean;
  center?: boolean;
  style?: any;
  textColor?: string;
  borderColor?: string;
}) {
  return (
    <View
      style={[
        styles.td,
        { width: w, borderRightColor: borderColor },
        center && { alignItems: "center" },
      ]}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.tdTxt,
          textColor && { color: textColor },
          bold && { fontWeight: "900" },
          center && { textAlign: "center" },
          style,
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

function DaysCell({
  w,
  text,
  bold,
  center,
  isZero,
  inTotalRow,
  textColor,
  bgColor,
  borderColor,
  borderLeftColor,
}: {
  w: number;
  text: string;
  bold?: boolean;
  center?: boolean;
  isZero?: boolean;
  inTotalRow?: boolean;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  borderLeftColor?: string;
}) {
  return (
    <View
      style={[
        styles.td,
        inTotalRow ? styles.totalRowCell : styles.daysCell,
        { width: w, borderRightColor: borderColor },
        borderLeftColor && { borderLeftWidth: 1, borderLeftColor },
        bgColor && { backgroundColor: bgColor },
        center && { alignItems: "center" },
      ]}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.tdTxt,
          textColor && { color: textColor },
          inTotalRow && { color: textColor || "#333" },
          isZero ? { color: "#b00020" } : null,
          bold && { fontWeight: "900" },
          center && { textAlign: "center" },
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

function PayCell({
  w,
  text,
  bold,
  center,
  isZero,
  inTotalRow,
  textColor,
  bgColor,
  borderColor,
  borderLeftColor,
}: {
  w: number;
  text: string;
  bold?: boolean;
  center?: boolean;
  isZero?: boolean;
  inTotalRow?: boolean;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  borderLeftColor?: string;
}) {
  return (
    <View
      style={[
        styles.td,
        inTotalRow ? styles.totalRowCell : styles.payCell,
        { width: w, borderRightColor: borderColor },
        borderLeftColor && { borderLeftWidth: 1, borderLeftColor },
        bgColor && { backgroundColor: bgColor },
        center && { alignItems: "center" },
      ]}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.tdTxt,
          textColor && { color: textColor },
          inTotalRow && { color: textColor || "#333" },
          isZero ? { color: "#b00020" } : null,
          bold && { fontWeight: "900" },
          center && { textAlign: "center" },
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

const W_NAME = 200;
const W_DAY = 52;
const W_TOTAL_DAYS = 80;
const W_TOTAL_PAY = 110;

export default function SupervisorTimesheetDetail() {
  const router = useRouter();
  const { id, siteId } = useLocalSearchParams<{
    id: string;
    siteId?: string;
  }>();
  const { theme } = useTheme();
  const colors = themes[theme];
  const supervisorTimesheetId = String(id ?? "");
  const siteFilterId = siteId ? String(siteId) : undefined;

  // Theme-aware cell colors
  const cellColors = {
    borderColor:
      theme === "dark" ? "rgba(148,163,184,0.15)" : "rgba(0,0,0,0.08)",
    daysCellBg: theme === "dark" ? "rgba(245,158,11,0.12)" : "#fef3e2",
    payCellBg: theme === "dark" ? "rgba(34,197,94,0.12)" : "#e8f5e9",
    foremanRowBg: theme === "dark" ? "rgba(56,189,248,0.1)" : "#e3f2fd",
    headerBg:
      theme === "dark" ? "rgba(56,189,248,0.12)" : "rgba(38, 45, 104, 0.06)",
    presentCellBg:
      theme === "dark" ? "rgba(22,163,74,0.15)" : "rgba(26, 127, 55, 0.08)",
    absentCellBg:
      theme === "dark" ? "rgba(220,38,38,0.15)" : "rgba(176, 0, 32, 0.06)",
  };

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TimesheetDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyAction, setBusyAction] = useState<
    "acceptDay" | "rejectDay" | "approve" | "reject" | "paid" | null
  >(null);
  const [dayAcceptances, setDayAcceptances] = useState<DayAcceptance[]>([]);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");
  const [alertButtons, setAlertButtons] = useState<AlertButton[]>([]);

  // Zoom functionality state
  const [zoomScale, setZoomScale] = useState(1);
  const scrollRef = useRef<ScrollView>(null);
  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 2;
  const ZOOM_STEP = 0.1;

  const zoomIn = useCallback(() => {
    setZoomScale((prev) => Math.min(prev + ZOOM_STEP, MAX_ZOOM));
  }, []);

  const zoomOut = useCallback(() => {
    setZoomScale((prev) => Math.max(prev - ZOOM_STEP, MIN_ZOOM));
  }, []);

  const resetZoom = useCallback(() => {
    setZoomScale(1);
  }, []);

  const showAlert = useCallback(
    (title: string, message: string, buttons: AlertButton[]) => {
      setAlertTitle(title);
      setAlertMessage(message);
      setAlertButtons(buttons);
      setAlertVisible(true);
    },
    [],
  );

  const refresh = useCallback(async () => {
    if (!supervisorTimesheetId) return;

    setLoading(true);
    setError(null);

    try {
      // First try: per-site detail when siteFilterId is present
      const loadOnce = async (useSiteId?: string) => {
        const res = await apiSupervisorTimesheetDetailMobile(
          supervisorTimesheetId,
          useSiteId,
        );
        const raw = pickTimesheet(res);

        if (!raw) {
          setError("Timesheet not found.");
          setData(null);
          return;
        }

        const ts = normalizeTimesheetDetail(raw);

        if (!Array.isArray(ts.columns) || ts.columns.length === 0) {
          setError("Timesheet has no columns.");
          setData(null);
          return;
        }
        if (!Array.isArray(ts.rows)) {
          setError("Timesheet rows are invalid.");
          setData(null);
          return;
        }

        setData(ts);
      };

      try {
        await loadOnce(siteFilterId);
        // Also fetch day acceptances
        try {
          const acceptRes = await apiSupervisorGetDayAcceptances(
            supervisorTimesheetId,
            siteFilterId,
          );
          setDayAcceptances(acceptRes.dayAcceptances ?? []);
        } catch {
          // Day acceptances endpoint may not exist yet - ignore
          setDayAcceptances([]);
        }
      } catch (err: any) {
        // If per-site fails (e.g. auth/permission issues on that route),
        // fall back to the combined timesheet without site filter so the
        // supervisor still sees the fortnight data.
        if (siteFilterId) {
          await loadOnce(undefined);
        } else {
          throw err;
        }
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to load timesheet.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [supervisorTimesheetId, siteFilterId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const status = (data?.status ?? "DRAFT") as Status;

  // Date-based logic for daily acceptance vs final approval
  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const startISO = data?.startISO ?? "";
  const endISO = data?.endISO ?? "";

  // Is today on or after the last day of the fortnight?
  const isLastDayOrLater = todayISO >= endISO;
  // Is today within the fortnight period?
  const isWithinPeriod = todayISO >= startISO && todayISO <= endISO;

  // Get today's acceptance status
  const todayAcceptance = useMemo(() => {
    return dayAcceptances.find((da) => da.workDate.slice(0, 10) === todayISO);
  }, [dayAcceptances, todayISO]);

  // Calculate acceptance progress
  const acceptanceProgress = useMemo(() => {
    const accepted = dayAcceptances.filter(
      (da) => da.status === "ACCEPTED",
    ).length;
    const total = data?.columns?.length ?? 14;
    return { accepted, total };
  }, [dayAcceptances, data?.columns]);

  // Button visibility based on date and status
  const isPendingReview = status === "SUBMITTED" || status === "ACCEPTED";
  const canDailyAccept = isPendingReview && isWithinPeriod && !isLastDayOrLater;
  const canFinalApprove = isPendingReview && isLastDayOrLater;
  const canReject = isPendingReview;
  const canPaid = status === "APPROVED";

  // Helper booleans to avoid lint false positives
  const todayAlreadyAccepted = todayAcceptance?.status === "ACCEPTED";
  const isAcceptingDay = busyAction === "acceptDay";
  const isRejectingDay = busyAction === "rejectDay";
  const isApproving = busyAction === "approve";
  const isRejecting = busyAction === "reject";
  const isMarkingPaid = busyAction === "paid";

  const foremanKey = useMemo(
    () => normName(data?.foremanName),
    [data?.foremanName],
  );

  // Pre-compute day acceptance statuses to avoid lint false positives in JSX
  const dayAcceptanceMap = useMemo(() => {
    const map: Record<
      string,
      { isAccepted: boolean; isRejected: boolean; color: string }
    > = {};
    const acceptedStatus = "ACCEPTED";
    const rejectedStatus = "REJECTED";
    for (const da of dayAcceptances) {
      const iso = da.workDate.slice(0, 10);
      const isAccepted = da.status === acceptedStatus;
      const isRejected = da.status === rejectedStatus;
      map[iso] = {
        isAccepted,
        isRejected,
        color: isAccepted
          ? colors.success
          : isRejected
            ? colors.error
            : colors.textSecondary,
      };
    }
    return map;
  }, [dayAcceptances, colors.success, colors.error, colors.textSecondary]);

  const totals = useMemo(() => {
    const rows = data?.rows ?? [];

    let foremanDays = 0;
    let foremanPay = 0;
    let teamDays = 0;
    let teamPay = 0;

    for (const r of rows) {
      const isForeman = foremanKey && normName(r.fullName) === foremanKey;
      if (isForeman) {
        foremanDays += Number(r.daysWorked ?? 0) || 0;
        foremanPay += Number(r.pay ?? 0) || 0;
      } else {
        teamDays += Number(r.daysWorked ?? 0) || 0;
        teamPay += Number(r.pay ?? 0) || 0;
      }
    }

    return {
      foremanDays,
      foremanPay,
      teamDays,
      teamPay,
      totalDays: foremanDays + teamDays,
      totalPay: foremanPay + teamPay,
    };
  }, [data, foremanKey]);

  // Accept today's work - actual API call
  const doAcceptToday = useCallback(async () => {
    if (!supervisorTimesheetId || !todayISO) return;
    if (busy) return;

    const dayLabel = new Date(todayISO).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });

    setBusy(true);
    setBusyAction("acceptDay");
    try {
      await apiSupervisorAcceptDay(
        supervisorTimesheetId,
        todayISO,
        "accept",
        undefined,
        siteFilterId,
      );
      showAlert("Success", `Day ${dayLabel} accepted.`, [
        { text: "OK", style: "default" },
      ]);
      await refresh();
    } catch (e: any) {
      showAlert("Error", e?.message ?? "Failed to accept day.", [
        { text: "OK", style: "default" },
      ]);
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  }, [supervisorTimesheetId, todayISO, refresh, showAlert, busy, siteFilterId]);

  // Accept today's work - with confirmation dialog
  const acceptToday = useCallback(() => {
    if (!supervisorTimesheetId || !todayISO) return;

    const dayLabel = new Date(todayISO).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });

    showAlert(
      "Confirm Acceptance",
      `Are you sure you want to accept ${dayLabel}'s work? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Accept",
          style: "default",
          onPress: () => doAcceptToday(),
        },
      ],
    );
  }, [supervisorTimesheetId, todayISO, showAlert, doAcceptToday]);

  // Reject today's work
  const rejectTodayWithReason = useCallback(
    async (reason: string) => {
      const r = reason.trim();
      if (!r) {
        showAlert("Reason required", "Please enter a rejection reason.", [
          { text: "OK", style: "default" },
        ]);
        return;
      }
      if (busy) return;

      const dayLabel = new Date(todayISO).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });

      setBusy(true);
      setBusyAction("rejectDay");
      try {
        await apiSupervisorAcceptDay(
          supervisorTimesheetId,
          todayISO,
          "reject",
          r,
          siteFilterId,
        );
        showAlert("Success", `Day ${dayLabel} rejected.`, [
          { text: "OK", style: "default" },
        ]);
        await refresh();
      } catch (e: any) {
        showAlert("Error", e?.message ?? "Failed to reject day.", [
          { text: "OK", style: "default" },
        ]);
      } finally {
        setBusy(false);
        setBusyAction(null);
      }
    },
    [supervisorTimesheetId, todayISO, refresh, showAlert, busy, siteFilterId],
  );

  const rejectToday = useCallback(() => {
    if (!supervisorTimesheetId) return;

    if (Platform.OS === "ios" && typeof (Alert as any).prompt === "function") {
      (Alert as any).prompt(
        "Rejection reason",
        "Tell the foreman what to fix for today.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Reject",
            style: "destructive",
            onPress: (text: string) => rejectTodayWithReason(text),
          },
        ],
        "plain-text",
        "Please review and fix the issues.",
      );
      return;
    }

    showAlert("Reject today's work?", "Enter a reason for rejection.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reject",
        style: "destructive",
        onPress: () =>
          rejectTodayWithReason("Please review and fix the issues."),
      },
    ]);
  }, [supervisorTimesheetId, rejectTodayWithReason, showAlert]);

  const approve = useCallback(async () => {
    if (!supervisorTimesheetId) return;
    if (busy) return;

    setBusy(true);
    setBusyAction("approve");
    try {
      await apiSupervisorApproveTimesheet(supervisorTimesheetId, siteFilterId);
      showAlert("Success", "Timesheet approved.", [
        { text: "OK", style: "default" },
      ]);
      await refresh();
    } catch (e: any) {
      showAlert("Error", e?.message ?? "Failed to approve.", [
        { text: "OK", style: "default" },
      ]);
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  }, [supervisorTimesheetId, siteFilterId, refresh, showAlert, busy]);

  const confirmApprove = useCallback(() => {
    showAlert(
      "Final approve timesheet?",
      "This will finally approve the timesheet.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Approve",
          style: "default",
          onPress: () => void approve(),
        },
      ],
    );
  }, [approve, showAlert]);

  const markPaid = useCallback(async () => {
    if (!supervisorTimesheetId) return;
    if (busy) return;

    setBusy(true);
    setBusyAction("paid");
    try {
      await apiSupervisorMarkPaid(supervisorTimesheetId, siteFilterId);
      showAlert("Success", "Timesheet marked as paid.", [
        { text: "OK", style: "default" },
      ]);
      await refresh();
    } catch (e: any) {
      showAlert("Error", e?.message ?? "Failed to mark paid.", [
        { text: "OK", style: "default" },
      ]);
    } finally {
      setBusy(false);
      setBusyAction(null);
    }
  }, [supervisorTimesheetId, siteFilterId, refresh, showAlert, busy]);

  const rejectWithReason = useCallback(
    async (reason: string) => {
      const r = reason.trim();
      if (!r) {
        showAlert("Reason required", "Please enter a rejection reason.", [
          { text: "OK", style: "default" },
        ]);
        return;
      }
      if (busy) return;

      setBusy(true);
      setBusyAction("reject");
      try {
        await apiSupervisorRejectTimesheet(
          supervisorTimesheetId,
          r,
          siteFilterId,
        );
        showAlert("Success", "Timesheet rejected.", [
          { text: "OK", style: "default" },
        ]);
        await refresh();
      } catch (e: any) {
        showAlert("Error", e?.message ?? "Failed to reject.", [
          { text: "OK", style: "default" },
        ]);
      } finally {
        setBusy(false);
        setBusyAction(null);
      }
    },
    [supervisorTimesheetId, siteFilterId, refresh, showAlert, busy],
  );

  const reject = useCallback(() => {
    if (!supervisorTimesheetId) return;

    if (Platform.OS === "ios" && typeof (Alert as any).prompt === "function") {
      (Alert as any).prompt(
        "Rejection reason",
        "Tell the foreman what to fix.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Reject",
            style: "destructive",
            onPress: (text: string) => rejectWithReason(text),
          },
        ],
        "plain-text",
        "Please review and resubmit.",
      );
      return;
    }

    showAlert(
      "Reject timesheet?",
      "Android needs a custom modal for typed reasons. For now we'll use a standard reason.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reject",
          style: "destructive",
          onPress: () => rejectWithReason("Please review and resubmit."),
        },
      ],
    );
  }, [supervisorTimesheetId, rejectWithReason, showAlert]);

  if (loading) {
    return (
      <AuthStyleBackground>
        <LoadingOverlay
          icon="⏳"
          title="Loading timesheet…"
          message="Please wait while we fetch the timesheet details"
        />
      </AuthStyleBackground>
    );
  }

  if (!data) {
    return (
      <AuthStyleBackground>
        <View style={{ flex: 1, padding: 16 }}>
          <GlassCard style={{ padding: 16, gap: 10 }}>
            <Text
              style={{
                fontWeight: "900",
                fontSize: 16,
                color: colors.textPrimary,
              }}
            >
              Timesheet not found
            </Text>
            {error ? (
              <Text style={{ color: colors.error, fontWeight: "800" }}>
                {error}
              </Text>
            ) : null}

            <Pressable style={styles.backPill} onPress={() => router.back()}>
              <Text style={[styles.backTxt, { color: colors.accent }]}>
                ← Back
              </Text>
            </Pressable>

            <Pressable
              style={[styles.backPill, { backgroundColor: colors.accent }]}
              onPress={refresh}
            >
              <Text style={[styles.backTxt, { color: "#fff" }]}>Retry</Text>
            </Pressable>
          </GlassCard>
        </View>
      </AuthStyleBackground>
    );
  }

  const title = data.foremanName?.trim() ? data.foremanName : "Timesheet";
  const hasRows = Array.isArray(data.rows) && data.rows.length > 0;

  return (
    <AuthStyleBackground>
      <CustomAlert
        visible={alertVisible}
        title={alertTitle}
        message={alertMessage}
        buttons={alertButtons}
        onDismiss={() => setAlertVisible(false)}
      />
      <View style={styles.wrap}>
        <GlassCard style={{ padding: 14 }}>
          <View style={styles.headerRow}>
            <Pressable onPress={() => router.back()} style={styles.backPill}>
              <Ionicons name="arrow-back" size={18} color={colors.accent} />
              <Text style={[styles.backTxt, { color: colors.accent }]}>
                {" "}
                Back
              </Text>
            </Pressable>

            <Pressable
              onPress={refresh}
              disabled={loading}
              style={[
                styles.backPill,
                {
                  backgroundColor: colors.accentLight,
                  borderWidth: 1,
                  borderColor: colors.accentBorder,
                },
              ]}
            >
              <Ionicons name="refresh" size={18} color={colors.accent} />
              <Text style={[styles.backTxt, { color: colors.accent }]}>
                {" "}
                Refresh
              </Text>
            </Pressable>

            <View style={{ flex: 1 }}>
              <Text
                style={[styles.h1, { color: colors.textPrimary }]}
                numberOfLines={1}
              >
                {title}
              </Text>
              <Text
                style={[styles.sub, { color: colors.textSecondary }]}
                numberOfLines={2}
              >
                {data.sitesLabel}
              </Text>
            </View>
          </View>

          <Text style={[styles.sub2, { color: colors.textSecondary }]}>
            Fortnight: {data.startISO} → {data.endISO}
          </Text>

          {/* Day acceptance progress indicator */}
          {isPendingReview && (
            <View style={styles.progressContainer}>
              <Text
                style={[styles.progressText, { color: colors.textSecondary }]}
              >
                Daily Acceptance: {acceptanceProgress.accepted}/
                {acceptanceProgress.total} days
              </Text>
              <View
                style={[styles.progressBar, { backgroundColor: colors.border }]}
              >
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${(acceptanceProgress.accepted / acceptanceProgress.total) * 100}%`,
                      backgroundColor: colors.success,
                    },
                  ]}
                />
              </View>
            </View>
          )}

          {/* Action buttons */}
          {(canDailyAccept || canFinalApprove || canReject || canPaid) && (
            <View style={styles.actionButtonsContainer}>
              {/* Daily accept/reject buttons (during fortnight, before last day) */}
              {canDailyAccept && (
                <>
                  <Pressable
                    style={[
                      styles.actionBtn,
                      styles.acceptDayBtn,
                      busy && { opacity: 0.6 },
                      todayAlreadyAccepted && { opacity: 0.5 },
                    ]}
                    onPress={acceptToday}
                    disabled={busy || todayAlreadyAccepted}
                  >
                    {isAcceptingDay ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons
                          name="checkmark-circle"
                          size={16}
                          color="#fff"
                        />
                        <Text style={styles.actionBtnText}>
                          {todayAlreadyAccepted
                            ? "Today Accepted"
                            : "Accept Today"}
                        </Text>
                      </>
                    )}
                  </Pressable>
                  <Pressable
                    style={[
                      styles.actionBtn,
                      styles.rejectDayBtn,
                      (busy || todayAlreadyAccepted) && { opacity: 0.6 },
                    ]}
                    onPress={rejectToday}
                    disabled={busy || todayAlreadyAccepted}
                  >
                    {isRejectingDay ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="close-circle" size={16} color="#fff" />
                        <Text style={styles.actionBtnText}>Reject Today</Text>
                      </>
                    )}
                  </Pressable>
                </>
              )}

              {/* Final approve button (on/after last day). */}
              {canFinalApprove && (
                <Pressable
                  style={[
                    styles.actionBtn,
                    styles.approveBtn,
                    busy && { opacity: 0.6 },
                  ]}
                  onPress={confirmApprove}
                  disabled={busy}
                >
                  {isApproving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons
                        name="checkmark-circle"
                        size={16}
                        color="#fff"
                      />
                      <Text style={styles.actionBtnText}>Final Approve</Text>
                    </>
                  )}
                </Pressable>
              )}

              {canReject && !canDailyAccept && (
                <Pressable
                  style={[
                    styles.actionBtn,
                    styles.rejectBtn,
                    busy && { opacity: 0.6 },
                  ]}
                  onPress={reject}
                  disabled={busy}
                >
                  {isRejecting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="close-circle" size={16} color="#fff" />
                      <Text style={styles.actionBtnText}>Reject</Text>
                    </>
                  )}
                </Pressable>
              )}

              {canPaid && (
                <Pressable
                  style={[
                    styles.actionBtn,
                    styles.paidBtn,
                    busy && { opacity: 0.6 },
                  ]}
                  onPress={markPaid}
                  disabled={busy}
                >
                  {isMarkingPaid ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="cash" size={16} color="#fff" />
                      <Text style={styles.actionBtnText}>Mark Paid</Text>
                    </>
                  )}
                </Pressable>
              )}
            </View>
          )}
        </GlassCard>

        <GlassCard style={{ padding: 0, flex: 1 }}>
          {!hasRows ? (
            <View style={{ padding: 16 }}>
              <Text
                style={{
                  fontWeight: "900",
                  fontSize: 14,
                  color: colors.textPrimary,
                }}
              >
                No Team Data
              </Text>
              <Text
                style={{
                  marginTop: 6,
                  color: colors.textSecondary,
                  fontWeight: "800",
                }}
              >
                No scans were found in this fortnight for this foreman.
              </Text>
            </View>
          ) : (
            <View style={{ flex: 1 }}>
              {/* Zoom Controls */}
              <View style={styles.zoomControls}>
                <Pressable
                  style={[
                    styles.zoomBtn,
                    { opacity: zoomScale <= MIN_ZOOM ? 0.5 : 1 },
                  ]}
                  onPress={zoomOut}
                  disabled={zoomScale <= MIN_ZOOM}
                >
                  <Ionicons name="remove" size={18} color="#fff" />
                </Pressable>
                <Text style={styles.zoomLabel}>
                  {Math.round(zoomScale * 100)}%
                </Text>
                <Pressable
                  style={[
                    styles.zoomBtn,
                    { opacity: zoomScale >= MAX_ZOOM ? 0.5 : 1 },
                  ]}
                  onPress={zoomIn}
                  disabled={zoomScale >= MAX_ZOOM}
                >
                  <Ionicons name="add" size={18} color="#fff" />
                </Pressable>
                <Pressable style={styles.zoomResetBtn} onPress={resetZoom}>
                  <Text style={styles.zoomResetText}>Reset</Text>
                </Pressable>
              </View>

              {/* Zoomable Timesheet Table */}
              <ScrollView
                ref={scrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ flexGrow: 1 }}
              >
                <View
                  style={{
                    transform: [{ scale: zoomScale }],
                    minWidth: "100%",
                  }}
                >
                  <View
                    style={{
                      minWidth:
                        W_NAME +
                        data.columns.length * W_DAY +
                        W_TOTAL_DAYS * 2 +
                        20,
                    }}
                  >
                    <View
                      style={[
                        styles.tr,
                        styles.thRow,
                        {
                          backgroundColor: cellColors.headerBg,
                          borderBottomColor: cellColors.borderColor,
                        },
                      ]}
                    >
                      <Cell
                        w={W_NAME}
                        text="Full Name"
                        bold
                        textColor={colors.textPrimary}
                        borderColor={cellColors.borderColor}
                      />

                      {data.columns.map((c) => {
                        const dayStatus = dayAcceptanceMap[c.iso];
                        const isDayAccepted = dayStatus?.isAccepted ?? false;
                        const isDayRejected = dayStatus?.isRejected ?? false;
                        const acceptanceColor =
                          dayStatus?.color ?? colors.textSecondary;

                        return (
                          <View
                            key={c.iso}
                            style={[
                              styles.td,
                              {
                                width: W_DAY,
                                borderRightColor: cellColors.borderColor,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.tdTxt,
                                {
                                  fontWeight: "900",
                                  textAlign: "center",
                                  color: colors.textPrimary,
                                },
                              ]}
                            >
                              {c.day}
                            </Text>
                            <Text
                              style={[
                                styles.tdTxt,
                                {
                                  fontWeight: "500",
                                  textAlign: "center",
                                  fontSize: 12,
                                  color: colors.textSecondary,
                                },
                              ]}
                            >
                              {c.iso ? c.iso.split("-")[2] : ""}
                            </Text>
                            {/* Day acceptance indicator */}
                            <View
                              style={{ alignItems: "center", marginTop: 2 }}
                            >
                              {isDayAccepted && (
                                <Ionicons
                                  name="checkmark-circle"
                                  size={12}
                                  color={acceptanceColor}
                                />
                              )}
                              {isDayRejected && (
                                <Ionicons
                                  name="close-circle"
                                  size={12}
                                  color={acceptanceColor}
                                />
                              )}
                              {!dayStatus && (
                                <View style={{ width: 12, height: 12 }} />
                              )}
                            </View>
                          </View>
                        );
                      })}

                      <DaysCell
                        w={W_TOTAL_DAYS}
                        text="F/man Days"
                        bold
                        center
                        textColor={colors.textPrimary}
                        borderColor={cellColors.borderColor}
                      />
                      <DaysCell
                        w={W_TOTAL_DAYS}
                        text="Man/Days"
                        bold
                        center
                        textColor={colors.textPrimary}
                        borderColor={cellColors.borderColor}
                      />
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false}>
                      {(() => {
                        const sorted = [...data.rows].sort((a, b) => {
                          const aIsForeman =
                            foremanKey && normName(a.fullName) === foremanKey
                              ? 0
                              : 1;
                          const bIsForeman =
                            foremanKey && normName(b.fullName) === foremanKey
                              ? 0
                              : 1;
                          return aIsForeman - bIsForeman;
                        });

                        return sorted.map((r) => {
                          const isForeman =
                            !!foremanKey && normName(r.fullName) === foremanKey;

                          return (
                            <View
                              key={r.employeeId}
                              style={[
                                styles.tr,
                                { borderBottomColor: cellColors.borderColor },
                                isForeman && {
                                  backgroundColor: cellColors.foremanRowBg,
                                },
                              ]}
                            >
                              <Cell
                                w={W_NAME}
                                text={
                                  isForeman ? `👨‍💼 ${r.fullName}` : r.fullName
                                }
                                bold={isForeman}
                                textColor={colors.textPrimary}
                                borderColor={cellColors.borderColor}
                              />

                              {r.present.map((p, idx) => (
                                <View
                                  key={`${r.employeeId}-${idx}`}
                                  style={[
                                    styles.td,
                                    {
                                      width: W_DAY,
                                      alignItems: "center",
                                      borderRightColor: cellColors.borderColor,
                                    },
                                    p
                                      ? {
                                          backgroundColor:
                                            cellColors.presentCellBg,
                                        }
                                      : {
                                          backgroundColor:
                                            cellColors.absentCellBg,
                                        },
                                  ]}
                                >
                                  {p ? (
                                    <Ionicons
                                      name="checkmark-circle"
                                      size={18}
                                      color={colors.success}
                                    />
                                  ) : (
                                    <Ionicons
                                      name="close-circle"
                                      size={18}
                                      color={colors.error}
                                    />
                                  )}
                                </View>
                              ))}

                              {isForeman ? (
                                <>
                                  <DaysCell
                                    w={W_TOTAL_DAYS}
                                    text={String(r.daysWorked ?? 0)}
                                    center
                                    bold
                                    isZero={(r.daysWorked ?? 0) === 0}
                                    textColor={colors.textPrimary}
                                    bgColor={cellColors.daysCellBg}
                                    borderColor={cellColors.borderColor}
                                  />
                                  <DaysCell
                                    w={W_TOTAL_DAYS}
                                    text="0"
                                    center
                                    isZero
                                    textColor={colors.textPrimary}
                                    bgColor={cellColors.daysCellBg}
                                    borderColor={cellColors.borderColor}
                                  />
                                </>
                              ) : (
                                <>
                                  <DaysCell
                                    w={W_TOTAL_DAYS}
                                    text="0"
                                    center
                                    isZero
                                    textColor={colors.textPrimary}
                                    bgColor={cellColors.daysCellBg}
                                    borderColor={cellColors.borderColor}
                                  />
                                  <DaysCell
                                    w={W_TOTAL_DAYS}
                                    text={String(r.daysWorked ?? 0)}
                                    center
                                    bold
                                    isZero={(r.daysWorked ?? 0) === 0}
                                    textColor={colors.textPrimary}
                                    bgColor={cellColors.daysCellBg}
                                    borderColor={cellColors.borderColor}
                                  />
                                </>
                              )}
                            </View>
                          );
                        });
                      })()}

                      <View
                        style={[
                          styles.tr,
                          styles.totalRow,
                          {
                            backgroundColor: cellColors.headerBg,
                            borderBottomColor: cellColors.borderColor,
                            borderTopColor: cellColors.borderColor,
                          },
                        ]}
                      >
                        <Cell
                          w={W_NAME}
                          text="TOTAL"
                          bold
                          textColor={colors.textPrimary}
                          borderColor="transparent"
                        />

                        {data.columns.map((c) => (
                          <View
                            key={`t-${c.iso}`}
                            style={[
                              styles.td,
                              styles.totalRowDayCell,
                              {
                                width: W_DAY,
                                backgroundColor: cellColors.headerBg,
                                borderRightColor: "transparent",
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.tdTxt,
                                {
                                  color: colors.textSecondary,
                                  fontSize: 11,
                                  textAlign: "center",
                                },
                              ]}
                            >
                              {" "}
                            </Text>
                          </View>
                        ))}

                        <DaysCell
                          w={W_TOTAL_DAYS}
                          text={String(totals.foremanDays)}
                          center
                          bold
                          inTotalRow
                          textColor={colors.textPrimary}
                          bgColor={cellColors.headerBg}
                          borderColor={cellColors.borderColor}
                          borderLeftColor={cellColors.borderColor}
                        />
                        <DaysCell
                          w={W_TOTAL_DAYS}
                          text={String(totals.teamDays)}
                          center
                          bold
                          inTotalRow
                          textColor={colors.textPrimary}
                          bgColor={cellColors.headerBg}
                          borderColor={cellColors.borderColor}
                        />
                      </View>

                      <View style={{ padding: 14 }}>
                        <Text
                          style={{
                            color: colors.textSecondary,
                            fontWeight: "800",
                            fontSize: 12,
                          }}
                        >
                          ✅ Present = guy scanned that day • ❌ Absent = no
                          scan
                        </Text>
                      </View>
                    </ScrollView>
                  </View>
                </View>
              </ScrollView>
            </View>
          )}
        </GlassCard>
      </View>
    </AuthStyleBackground>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 16, gap: 12 },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  backPill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
    backgroundColor: "#262D68",
    flexDirection: "row",
    alignItems: "center",
  },
  backTxt: { color: "#fff", fontWeight: "900", fontSize: 13 },

  h1: { fontSize: 16, fontWeight: "900", color: "#111" },
  sub: { marginTop: 2, fontSize: 12, fontWeight: "800", color: "#666" },
  sub2: { marginTop: 8, fontSize: 12, fontWeight: "800", color: "#666" },

  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusBadgeText: { fontSize: 12, fontWeight: "900" },

  actionButtonsContainer: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
    flexWrap: "wrap",
  },
  actionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  approveBtn: { backgroundColor: "#16A34A" },
  rejectBtn: { backgroundColor: "#DC2626" },
  paidBtn: { backgroundColor: "#2563EB" },
  acceptDayBtn: { backgroundColor: "#F59E0B" }, // Orange for daily accept
  rejectDayBtn: { backgroundColor: "#EF4444" }, // Red for daily reject
  actionBtnText: { color: "#fff", fontWeight: "900", fontSize: 13 },

  progressContainer: {
    marginTop: 10,
    gap: 6,
  },
  progressText: {
    fontSize: 12,
    fontWeight: "800",
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },

  // Zoom controls styles
  zoomControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 8,
    backgroundColor: "rgba(38, 45, 104, 0.9)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(148, 163, 184, 0.2)",
  },
  zoomBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: "#262D68",
    justifyContent: "center",
    alignItems: "center",
  },
  zoomLabel: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
    minWidth: 45,
    textAlign: "center",
  },
  zoomResetBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 5,
    backgroundColor: "rgba(56, 189, 248, 0.3)",
    marginLeft: 4,
  },
  zoomResetText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },

  thRow: {
    borderBottomWidth: 2,
  },

  tr: {
    flexDirection: "row",
    borderBottomWidth: 1,
  },

  td: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    justifyContent: "center",
    borderRightWidth: 1,
  },

  tdTxt: { fontSize: 12, fontWeight: "800", color: "#111" },

  daysCell: {},
  payCell: {},
  totalRowCell: { backgroundColor: "#262D68" },
  totalRowDayCell: { backgroundColor: "#e8e8e8" },

  presentCell: {},
  absentCell: {},

  foremanRow: {},

  totalRow: {
    borderTopWidth: 2,
  },
});
