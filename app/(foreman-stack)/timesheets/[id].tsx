import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import { GlassCard } from "@/components/GlassCard";
import { useTheme } from "@/lib/themeContext";
import { Ionicons } from "@expo/vector-icons";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  apiForemanTimesheetDetailMobileCached,
  type TimesheetDetailDto,
} from "../../../lib/apiClient";
import { useAuth } from "../../../lib/auth";
import { getApiBase, getToken } from "../../../lib/api";

function pickTimesheet(res: any): TimesheetDetailDto | null {
  if (!res) return null;
  if (res.timesheet && res.timesheet.rows && res.timesheet.columns)
    return res.timesheet;
  if (res.rows && res.columns) return res;
  return null;
}

function toISODateUTC(d: Date) {
  return d.toISOString().slice(0, 10);
}

function weekdayShortUTC(iso: string) {
  const d = new Date(`${iso}T00:00:00.000Z`);
  return d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}

function addDaysUTC(isoStart: string, days: number) {
  const d = new Date(`${isoStart}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toISODateUTC(d);
}

function build14ColumnsFromStartISO(startISO: string) {
  return Array.from({ length: 14 }).map((_, i) => {
    const iso = addDaysUTC(startISO, i);
    return { iso, day: weekdayShortUTC(iso) };
  });
}

function normalizeTimesheet(ts: TimesheetDetailDto): TimesheetDetailDto {
  const startISO = String(ts.startISO ?? "");
  const columns =
    Array.isArray(ts.columns) && ts.columns.length >= 14
      ? ts.columns.slice(0, 14)
      : startISO
        ? build14ColumnsFromStartISO(startISO)
        : Array.isArray(ts.columns)
          ? ts.columns
          : [];

  const colCount = columns.length || 14;

  const rows = Array.isArray(ts.rows)
    ? ts.rows.map((r) => {
        const presentRaw = Array.isArray(r.present) ? r.present : [];
        const present =
          presentRaw.length === colCount
            ? presentRaw
            : presentRaw.length > colCount
              ? presentRaw.slice(0, colCount)
              : [
                  ...presentRaw,
                  ...Array(colCount - presentRaw.length).fill(false),
                ];

        const daysWorked = present.reduce((sum, p) => sum + (p ? 1 : 0), 0);
        const pay = daysWorked * (Number(r.dayRate) || 0);

        return {
          ...r,
          present,
          daysWorked: Number.isFinite(r.daysWorked) ? r.daysWorked : daysWorked,
          pay: Number.isFinite(r.pay) ? r.pay : pay,
        };
      })
    : [];

  const totals =
    ts.totals &&
    typeof ts.totals.totalDays === "number" &&
    typeof ts.totals.totalPay === "number"
      ? ts.totals
      : rows.reduce(
          (acc, r) => {
            acc.totalDays += r.daysWorked || 0;
            acc.totalPay += r.pay || 0;
            return acc;
          },
          { totalDays: 0, totalPay: 0 },
        );

  return { ...ts, columns, rows, totals };
}
export default function ForemanTimesheetDetail() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const colors = themes[theme];
  const styles = getStyles(colors);

  function Cell({
    w,
    text,
    bold,
    center,
    style,
  }: {
    w: number;
    text: string;
    bold?: boolean;
    center?: boolean;
    style?: any;
  }) {
    return (
      <View
        style={[styles.td, { width: w }, center && { alignItems: "center" }]}
      >
        <Text
          numberOfLines={1}
          style={[
            styles.tdTxt,
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
  }: {
    w: number;
    text: string;
    bold?: boolean;
    center?: boolean;
    isZero?: boolean;
    inTotalRow?: boolean;
  }) {
    return (
      <View
        style={[
          styles.td,
          inTotalRow ? styles.totalRowCell : styles.daysCell,
          { width: w },
          center && { alignItems: "center" },
        ]}
      >
        <Text
          numberOfLines={1}
          style={[
            styles.tdTxt,
            inTotalRow ? { color: "#fff" } : null,
            !inTotalRow && isZero ? { color: "#b00020" } : null,
            bold && { fontWeight: "900" },
            center && { textAlign: "center" },
          ]}
        >
          {text}
        </Text>
      </View>
    );
  }

  const router = useRouter();
  const { id, siteId } = useLocalSearchParams<{
    id: string;
    siteId?: string;
  }>();
  const { user } = useAuth();

  const timesheetId = String(id ?? "");
  const siteFilterId = siteId ? String(siteId) : undefined;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TimesheetDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [pdfUri, setPdfUri] = useState<string | null>(null);
  const [pdfFilename, setPdfFilename] = useState<string | null>(null);
  const [sharingPdf, setSharingPdf] = useState(false);

  const refresh = useCallback(
    async (force = false) => {
      if (!timesheetId) return;
      if (force) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await apiForemanTimesheetDetailMobileCached(
          timesheetId,
          siteFilterId,
          force,
        );
        const ts = pickTimesheet(res);
        if (!ts) {
          setData(null);
          setError("Timesheet payload shape is invalid.");
          return;
        }
        setData(normalizeTimesheet(ts));
      } catch (e: any) {
        setError(e?.message ?? "Failed to load timesheet.");
        setData(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [timesheetId, siteFilterId],
  );

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const downloadPdf = useCallback(async () => {
    if (!timesheetId || !data) return;

    setDownloadingPdf(true);
    try {
      const token = await getToken();
      if (!token) {
        Alert.alert("Unauthorized", "Please sign in again.");
        return;
      }

      const params = new URLSearchParams();
      if (siteFilterId) params.set("siteId", siteFilterId);
      const query = params.toString();
      const url = `${getApiBase()}/api/app/foreman/timesheets-mobile/${encodeURIComponent(
        timesheetId,
      )}/pdf${query ? `?${query}` : ""}`;
      const filename = `timesheet-${data.startISO}-${data.endISO}-${siteFilterId ?? "all"}-${Date.now()}.pdf`;
      const destination = new File(Paths.document, filename);
      const result = await File.downloadFileAsync(url, destination, {
        headers: { Authorization: `Bearer ${token}` },
        idempotent: false,
      });

      setPdfUri(result.uri);
      setPdfFilename(filename);
    } catch (e: any) {
      Alert.alert("PDF Download Failed", e?.message ?? "Please try again.");
    } finally {
      setDownloadingPdf(false);
    }
  }, [data, siteFilterId, timesheetId]);

  const sharePdf = useCallback(async () => {
    if (!pdfUri) return;

    setSharingPdf(true);
    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert(
          "PDF Saved",
          `Saved inside the app as ${pdfFilename ?? "timesheet.pdf"}.`,
        );
        return;
      }
      await Sharing.shareAsync(pdfUri, {
        mimeType: "application/pdf",
        UTI: "com.adobe.pdf",
        dialogTitle: "Save or share timesheet PDF",
      });
    } catch (e: any) {
      Alert.alert("Share Failed", e?.message ?? "Failed to share the PDF.");
    } finally {
      setSharingPdf(false);
    }
  }, [pdfFilename, pdfUri]);

  const foremanNameKey = useMemo(() => {
    const n = data?.foreman?.name || user?.name || "";
    return String(n).trim().toLowerCase();
  }, [data?.foreman?.name, user?.name]);

  const totals = useMemo(() => {
    if (!data) {
      return {
        totalDays: 0,
        foremanDays: 0,
        teamDays: 0,
      };
    }

    let foremanDays = 0;
    let teamDays = 0;

    data.rows.forEach((r) => {
      const daysWorked = Array.isArray(r.present)
        ? r.present.filter(Boolean).length
        : 0;
      const rowName = String(r.fullName ?? "")
        .trim()
        .toLowerCase();
      const isForeman = !!foremanNameKey && rowName === foremanNameKey;

      if (isForeman) {
        foremanDays += daysWorked;
      } else {
        teamDays += daysWorked;
      }
    });

    return {
      totalDays: foremanDays + teamDays,
      foremanDays,
      teamDays,
    };
  }, [data, foremanNameKey]);

  if (loading) {
    return (
      <AuthStyleBackground>
        <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 16 }}>
          <GlassCard style={{ padding: 16, alignItems: "center", gap: 10 }}>
            <ActivityIndicator />
            <Text style={{ fontWeight: "900", color: colors.textSecondary }}>
              Loading…
            </Text>
          </GlassCard>
        </View>
      </AuthStyleBackground>
    );
  }

  if (!data) {
    return (
      <AuthStyleBackground>
        <View style={{ flex: 1, padding: 16 }}>
          <GlassCard style={{ padding: 16, gap: 10 }}>
            <Text style={{ fontWeight: "900", fontSize: 16 }}>
              Timesheet not found
            </Text>
            {error ? (
              <Text style={{ color: colors.error, fontWeight: "800" }}>
                {error}
              </Text>
            ) : null}
            <Pressable style={styles.backPill} onPress={() => router.back()}>
              <Text style={styles.backTxt}>← Back</Text>
            </Pressable>
            <Pressable
              style={[styles.backPill, { backgroundColor: colors.info }]}
              onPress={() => refresh()}
            >
              <Text style={styles.backTxt}>Retry</Text>
            </Pressable>
          </GlassCard>
        </View>
      </AuthStyleBackground>
    );
  }
  return (
    <AuthStyleBackground>
      <View style={styles.wrap}>
        <View
          style={{
            paddingTop: 8,
            flexDirection: "row",
            gap: 8,
            justifyContent: "flex-end",
          }}
        >
          <Pressable
            onPress={downloadPdf}
            disabled={downloadingPdf}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: colors.info,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 16,
              opacity: downloadingPdf ? 0.6 : 1,
            }}
          >
            {downloadingPdf ? (
              <ActivityIndicator
                size="small"
                color="#fff"
                style={{ marginRight: 4 }}
              />
            ) : (
              <Ionicons
                name="download-outline"
                size={14}
                color="#fff"
                style={{ marginRight: 4 }}
              />
            )}
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>
              {downloadingPdf ? "Preparing..." : "PDF"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => refresh(true)}
            disabled={refreshing}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: colors.accent,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 16,
              opacity: refreshing ? 0.6 : 1,
            }}
          >
            {refreshing ? (
              <ActivityIndicator
                size="small"
                color="#fff"
                style={{ marginRight: 4 }}
              />
            ) : (
              <Ionicons
                name="refresh"
                size={14}
                color="#fff"
                style={{ marginRight: 4 }}
              />
            )}
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>
              {refreshing ? "Refreshing…" : "Refresh"}
            </Text>
          </Pressable>
        </View>

        <GlassCard style={{ padding: 14 }}>
          <Text style={styles.sub}>
            Fortnight: {data.startISO} → {data.endISO}
          </Text>
          <Text style={styles.sub2}>
            Sites: <Text style={{ fontWeight: "900" }}>{data.sitesLabel}</Text>
          </Text>
        </GlassCard>

        <GlassCard style={{ padding: 0, flex: 1 }}>
          <View style={{ flex: 1 }}>
            {/* Horizontal scroll for many columns */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ flex: 1 }}
              contentContainerStyle={{ flexGrow: 1 }}
            >
              <View style={{ flex: 1 }}>
                {/* Header row */}
                <View style={[styles.tr, styles.thRow]}>
                  <Cell w={W_NAME} text="Full Name" bold />

                  {data.columns.map((c) => (
                    <View key={c.iso} style={[styles.td, { width: W_DAY }]}>
                      <Text
                        style={[
                          styles.tdTxt,
                          { fontWeight: "900", textAlign: "center" },
                        ]}
                      >
                        {c.day}
                      </Text>
                    </View>
                  ))}

                  <DaysCell w={W_TOTAL_DAYS} text="F/man Days" bold center />
                  <DaysCell w={W_TOTAL_DAYS} text="Man/Days" bold center />
                </View>

                <ScrollView
                  style={{ flex: 1 }}
                  contentContainerStyle={{ paddingBottom: 16 }}
                  showsVerticalScrollIndicator={false}
                >
                  {(() => {
                    const sorted = [...data.rows].sort((a, b) => {
                      const aName = String(a.fullName ?? String())
                        .trim()
                        .toLowerCase();
                      const bName = String(b.fullName ?? String())
                        .trim()
                        .toLowerCase();
                      const aIsForeman =
                        foremanNameKey && aName === foremanNameKey ? 0 : 1;
                      const bIsForeman =
                        foremanNameKey && bName === foremanNameKey ? 0 : 1;
                      if (aIsForeman !== bIsForeman)
                        return aIsForeman - bIsForeman;
                      return String(a.fullName ?? String()).localeCompare(
                        String(b.fullName ?? String()),
                      );
                    });

                    return sorted.map((r) => {
                      const rowName = String(r.fullName ?? String())
                        .trim()
                        .toLowerCase();
                      const isForeman =
                        !!foremanNameKey && rowName === foremanNameKey;

                      const daysWorked = Array.isArray(r.present)
                        ? r.present.filter(Boolean).length
                        : 0;

                      return (
                        <View
                          key={r.employeeId}
                          style={[styles.tr, isForeman && styles.foremanRow]}
                        >
                          <Cell
                            w={W_NAME}
                            text={
                              isForeman
                                ? `👨‍💼 ${r.fullName}`
                                : String(r.fullName ?? "")
                            }
                            bold={isForeman}
                          />

                          {(r.present ?? []).map((p, idx) => (
                            <View
                              key={`${r.employeeId}-${idx}`}
                              style={[
                                styles.td,
                                { width: W_DAY, alignItems: "center" },
                                p ? styles.presentCell : styles.absentCell,
                              ]}
                            >
                              {p ? (
                                <Ionicons
                                  name="checkmark-circle"
                                  size={18}
                                  color="#1a7f37"
                                />
                              ) : (
                                <Ionicons
                                  name="close-circle"
                                  size={18}
                                  color="#b00020"
                                />
                              )}
                            </View>
                          ))}

                          {isForeman ? (
                            <>
                              <DaysCell
                                w={W_TOTAL_DAYS}
                                text={String(daysWorked)}
                                center
                                bold
                              />
                              <DaysCell
                                w={W_TOTAL_DAYS}
                                text="0"
                                center
                                isZero
                              />
                            </>
                          ) : (
                            <>
                              <DaysCell
                                w={W_TOTAL_DAYS}
                                text="0"
                                center
                                isZero
                              />
                              <DaysCell
                                w={W_TOTAL_DAYS}
                                text={String(daysWorked)}
                                center
                                bold
                              />
                            </>
                          )}
                        </View>
                      );
                    });
                  })()}

                  <View style={[styles.tr, styles.totalRow]}>
                    <Cell
                      w={W_NAME}
                      text="TOTAL"
                      bold
                      style={{ color: "#fff" }}
                    />

                    {data.columns.map((c) => (
                      <View
                        key={`t-${c.iso}`}
                        style={[
                          styles.td,
                          styles.totalRowDayCell,
                          { width: W_DAY },
                        ]}
                      >
                        <Text
                          style={[
                            styles.tdTxt,
                            { color: colors.textSecondary, fontSize: 11 },
                          ]}
                        >
                          -
                        </Text>
                      </View>
                    ))}

                    <DaysCell
                      w={W_TOTAL_DAYS}
                      text={String(totals.foremanDays)}
                      center
                      bold
                      inTotalRow
                    />
                    <DaysCell
                      w={W_TOTAL_DAYS}
                      text={String(totals.teamDays)}
                      center
                      bold
                      inTotalRow
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
                      ✅ Present = scanned that day • ❌ Absent = no scan
                    </Text>
                  </View>
                </ScrollView>
              </View>
            </ScrollView>
          </View>
        </GlassCard>

        <Modal
          visible={!!pdfUri}
          animationType="slide"
          onRequestClose={() => setPdfUri(null)}
        >
          <View style={styles.pdfModal}>
            <View style={[styles.pdfHeader, { paddingTop: insets.top + 12 }]}>
              <Text style={styles.pdfTitle}>Timesheet PDF</Text>
              <Pressable style={styles.pdfClose} onPress={() => setPdfUri(null)}>
                <Ionicons name="close" size={22} color="#fff" />
              </Pressable>
            </View>
            <View style={styles.pdfActions}>
              <Text numberOfLines={1} style={styles.pdfSavedText}>
                Saved in app: {pdfFilename ?? "timesheet.pdf"}
              </Text>
              <Pressable
                style={styles.pdfShareButton}
                onPress={sharePdf}
                disabled={sharingPdf}
              >
                {sharingPdf ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Ionicons name="share-outline" size={16} color="#fff" />
                )}
                <Text style={styles.pdfShareText}>Save / Share</Text>
              </Pressable>
            </View>
            {pdfUri && (
              <WebView
                source={{ uri: pdfUri }}
                style={styles.pdfViewer}
                originWhitelist={["*"]}
                allowFileAccess
                startInLoadingState
                renderLoading={() => (
                  <View style={styles.pdfLoading}>
                    <ActivityIndicator color={colors.info} />
                    <Text style={{ color: colors.textSecondary }}>
                      Loading PDF...
                    </Text>
                  </View>
                )}
              />
            )}
          </View>
        </Modal>
      </View>
    </AuthStyleBackground>
  );
}

/* keep your constants + themes + styles as-is */

const W_NAME = 150;
const W_DAY = 52;
const W_TOTAL_DAYS = 70;

const themes = {
  dark: {
    bg: "#0b1220",
    bgSecondary: "#0f172a",
    border: "#1f2a44",
    textPrimary: "white",
    textSecondary: "#94a3b8",
    accent: "#22c55e",
    accentLight: "rgba(34,197,94,0.18)",
    success: "#16a34a",
    successLight: "rgba(22,163,74,0.12)",
    error: "#dc2626",
    errorLight: "rgba(220,38,38,0.10)",
    warning: "#f59e0b",
    warningLight: "rgba(245,158,11,0.14)",
    info: "#22c55e",
    infoLight: "rgba(34,197,94,0.14)",
  },
  light: {
    bg: "#f8fafc",
    bgSecondary: "#ffffff",
    border: "#e2e8f0",
    textPrimary: "#0f172a",
    textSecondary: "#64748b",
    accent: "#16A34A",
    accentLight: "rgba(22,163,74,0.08)",
    success: "#22c55e",
    successLight: "rgba(34,197,94,0.12)",
    error: "#ef4444",
    errorLight: "rgba(239,68,68,0.10)",
    warning: "#f59e0b",
    warningLight: "rgba(245,158,11,0.14)",
    info: "#16A34A",
    infoLight: "rgba(34,197,94,0.14)",
  },
};

const getStyles = (colors: (typeof themes)["dark"]) =>
  StyleSheet.create({
    wrap: { flex: 1, paddingHorizontal: 16, gap: 12 },

    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    backPill: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 5,
      backgroundColor: colors.info,
      borderWidth: 1,
      borderColor: colors.infoLight,
      flexDirection: "row",
      alignItems: "center",
    },
    backTxt: { fontWeight: "900", color: "#fff" },

    h1: { fontWeight: "900", color: colors.textPrimary, fontSize: 16 },
    sub: { marginTop: 8, color: colors.textSecondary, fontWeight: "800" },
    sub2: { marginTop: 6, color: colors.textSecondary, fontWeight: "800" },

    thRow: {
      backgroundColor: colors.infoLight,
      borderBottomWidth: 2,
      borderBottomColor: colors.border,
      borderRadius: 4,
    },

    tr: {
      flexDirection: "row",
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },

    foremanRow: {
      backgroundColor: colors.infoLight,
    },

    td: {
      paddingVertical: 10,
      paddingHorizontal: 8,
      justifyContent: "center",
      borderRightWidth: 1,
      borderRightColor: colors.border,
    },
    tdTxt: { fontWeight: "800", color: colors.textPrimary, fontSize: 12 },

    daysCell: {
      backgroundColor: colors.warningLight,
    },
    totalRowCell: {
      backgroundColor: colors.info,
    },
    totalRowDayCell: {
      backgroundColor: colors.bgSecondary,
    },

    presentCell: { backgroundColor: colors.successLight },
    absentCell: { backgroundColor: colors.errorLight },

    totalRow: {
      backgroundColor: colors.info,
      borderTopWidth: 2,
      borderTopColor: colors.info,
    },
    pdfModal: {
      flex: 1,
      backgroundColor: colors.bgSecondary,
    },
    pdfHeader: {
      // paddingTop is set dynamically from useSafeAreaInsets() above.
      paddingBottom: 12,
      paddingHorizontal: 16,
      backgroundColor: colors.info,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    pdfTitle: { color: "#fff", fontSize: 18, fontWeight: "900" },
    pdfClose: { padding: 6 },
    pdfActions: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      flexDirection: "row",
      gap: 12,
      alignItems: "center",
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    pdfSavedText: {
      flex: 1,
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: "700",
    },
    pdfShareButton: {
      minWidth: 124,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 9,
      backgroundColor: colors.info,
      flexDirection: "row",
      gap: 6,
      justifyContent: "center",
      alignItems: "center",
    },
    pdfShareText: { color: "#fff", fontWeight: "900", fontSize: 12 },
    pdfViewer: { flex: 1, backgroundColor: colors.bgSecondary },
    pdfLoading: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: "center",
      alignItems: "center",
      gap: 10,
      backgroundColor: colors.bgSecondary,
    },
  });
