// AdminTimesheetDetail.tsx
import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import { GlassCard } from "@/components/GlassCard";
import LoadingOverlay from "@/components/LoadingOverlay";
import { formatCurrency } from "@/lib/formatCurrency";
import { useTheme } from "@/lib/themeContext";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { CustomAlert, type AlertButton } from "@/components/CustomAlert";
import {
  apiAdminApproveTimesheet,
  apiAdminMarkPaid,
  apiAdminRejectTimesheet,
  apiAdminTimesheetDetail,
  type TimesheetDetailDto,
} from "../../../lib/apiClient";

type Status = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "PAID";

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

function getStatusColor(status: Status): string {
  switch (status) {
    case "SUBMITTED":
      return "#DC2626";
    case "APPROVED":
      return "#16A34A";
    case "PAID":
      return "#2563EB";
    case "REJECTED":
      return "#EA580C";
    default:
      return "#666";
  }
}

function getStatusLabel(status: Status): string {
  switch (status) {
    case "SUBMITTED":
      return "Pending Review";
    case "APPROVED":
      return "Approved";
    case "PAID":
      return "Paid";
    case "REJECTED":
      return "Rejected";
    default:
      return "Draft";
  }
}

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
  const existing = safeString(ts?.sitesLabel).trim();
  if (existing) return existing;

  const sites = Array.isArray(ts?.sites) ? ts.sites : [];
  const parts = sites
    .map((s: any) => {
      const code = safeString(s?.code).trim();
      const name = safeString(s?.name).trim();
      if (code && name) return `${code} - ${name}`;
      return name || code;
    })
    .filter(Boolean);

  return parts.join(", ") || "--";
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

export default function AdminTimesheetDetail() {
  const router = useRouter();
  const { id, siteId } = useLocalSearchParams<{
    id: string;
    siteId?: string;
  }>();
  const { theme } = useTheme();
  const colors = themes[theme];
  const adminTimesheetId = String(id ?? "");
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
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");
  const [alertButtons, setAlertButtons] = useState<AlertButton[]>([]);

  const showAlert = (
    title: string,
    message: string,
    buttons: AlertButton[],
  ) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertButtons(buttons);
    setAlertVisible(true);
  };

  const refresh = useCallback(async () => {
    if (!adminTimesheetId) return;

    setLoading(true);
    setError(null);

    try {
      // Load timesheet detail using admin API
      // id is the same as list id (startISO_endISO_foremanId)
      // siteFilterId ensures we get per-site detail
      const res = await apiAdminTimesheetDetail(adminTimesheetId, siteFilterId);
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
    } catch (e: any) {
      setError(e?.message ?? "Failed to load timesheet.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [adminTimesheetId, siteFilterId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const status = (data?.status ?? "DRAFT") as Status;
  const statusColor = getStatusColor(status);
  const statusLabel = getStatusLabel(status);

  const canApprove = status === "SUBMITTED";
  const canReject = status === "SUBMITTED";
  const canPaid = status === "APPROVED";

  const foremanKey = useMemo(
    () => normName(data?.foremanName),
    [data?.foremanName],
  );

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

  const approve = useCallback(() => {
    if (!adminTimesheetId) return;
    showAlert(
      "Approve timesheet?",
      "This will approve the timesheet for payment processing.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Approve",
          onPress: async () => {
            setBusy(true);
            try {
              await apiAdminApproveTimesheet(adminTimesheetId);
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
            }
          },
        },
      ],
    );
  }, [adminTimesheetId, refresh, showAlert]);

  const markPaid = useCallback(() => {
    if (!adminTimesheetId) return;
    showAlert("Mark as paid?", "This will record payment and complete it.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Mark Paid",
        onPress: async () => {
          setBusy(true);
          try {
            await apiAdminMarkPaid(adminTimesheetId);
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
          }
        },
      },
    ]);
  }, [adminTimesheetId, refresh, showAlert]);

  const rejectWithReason = useCallback(
    (reason: string) => {
      const r = reason.trim();
      if (!r) {
        showAlert("Reason required", "Please enter a rejection reason.", [
          { text: "OK", style: "default" },
        ]);
        return;
      }

      showAlert(
        "Reject timesheet?",
        "The foreman will see your reason and must resubmit.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Reject",
            style: "destructive",
            onPress: async () => {
              setBusy(true);
              try {
                await apiAdminRejectTimesheet(adminTimesheetId, r);
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
              }
            },
          },
        ],
      );
    },
    [adminTimesheetId, refresh, showAlert],
  );

  const reject = useCallback(() => {
    if (!adminTimesheetId) return;

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
  }, [adminTimesheetId, rejectWithReason, showAlert]);

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
                â† Back
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

            <View
              style={[
                styles.statusBadge,
                { backgroundColor: `${statusColor}15` },
              ]}
            >
              <View
                style={[styles.statusDot, { backgroundColor: statusColor }]}
              />
              <Text style={[styles.statusBadgeText, { color: statusColor }]}>
                {statusLabel}
              </Text>
            </View>
          </View>

          <Text style={[styles.sub2, { color: colors.textSecondary }]}>
            Fortnight: {data.startISO} {'→'} {data.endISO}
          </Text>

          {(canApprove || canReject || canPaid) && (
            <View style={styles.actionButtonsContainer}>
              {canApprove && (
                <Pressable
                  style={[
                    styles.actionBtn,
                    styles.approveBtn,
                    busy && { opacity: 0.6 },
                  ]}
                  onPress={approve}
                  disabled={busy}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons
                        name="checkmark-circle"
                        size={16}
                        color="#fff"
                      />
                      <Text style={styles.actionBtnText}>Approve</Text>
                    </>
                  )}
                </Pressable>
              )}

              {canReject && (
                <Pressable
                  style={[
                    styles.actionBtn,
                    styles.rejectBtn,
                    busy && { opacity: 0.6 },
                  ]}
                  onPress={reject}
                  disabled={busy}
                >
                  {busy ? (
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
                  {busy ? (
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
                No Employee Data
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
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
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

                  {data.columns.map((c) => (
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
                    </View>
                  ))}

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
                  <PayCell
                    w={W_TOTAL_PAY}
                    text="F/man Pay"
                    bold
                    center
                    textColor={colors.textPrimary}
                    borderColor={cellColors.borderColor}
                  />
                  <PayCell
                    w={W_TOTAL_PAY}
                    text="Team Pay"
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
                              isForeman
                                ? `ðŸ‘¨â€ðŸ’¼ ${r.fullName}`
                                : r.fullName
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
                                      backgroundColor: cellColors.presentCellBg,
                                    }
                                  : {
                                      backgroundColor: cellColors.absentCellBg,
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
                              <PayCell
                                w={W_TOTAL_PAY}
                                text={formatCurrency(r.pay ?? 0)}
                                center
                                bold
                                isZero={(r.pay ?? 0) === 0}
                                textColor={colors.textPrimary}
                                bgColor={cellColors.payCellBg}
                                borderColor={cellColors.borderColor}
                              />
                              <PayCell
                                w={W_TOTAL_PAY}
                                text="0"
                                center
                                isZero
                                textColor={colors.textPrimary}
                                bgColor={cellColors.payCellBg}
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
                              <PayCell
                                w={W_TOTAL_PAY}
                                text="0"
                                center
                                isZero
                                textColor={colors.textPrimary}
                                bgColor={cellColors.payCellBg}
                                borderColor={cellColors.borderColor}
                              />
                              <PayCell
                                w={W_TOTAL_PAY}
                                text={formatCurrency(r.pay ?? 0)}
                                center
                                bold
                                isZero={(r.pay ?? 0) === 0}
                                textColor={colors.textPrimary}
                                bgColor={cellColors.payCellBg}
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
                    <PayCell
                      w={W_TOTAL_PAY}
                      text={formatCurrency(totals.foremanPay)}
                      center
                      bold
                      inTotalRow
                      textColor={colors.textPrimary}
                      bgColor={cellColors.headerBg}
                      borderColor={cellColors.borderColor}
                    />
                    <PayCell
                      w={W_TOTAL_PAY}
                      text={formatCurrency(totals.teamPay)}
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
                      âœ… Present = worker scanned that day â€¢ âŒ Absent = no
                      scan
                    </Text>
                  </View>
                </ScrollView>
              </View>
            </ScrollView>
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
  actionBtnText: { color: "#fff", fontWeight: "900", fontSize: 13 },

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
