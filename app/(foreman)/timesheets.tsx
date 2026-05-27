import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import { GlassCard } from "@/components/GlassCard";
import { useTheme } from "@/lib/themeContext";
import { Ionicons } from "@expo/vector-icons";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import {
  apiForemanTimesheetsCached,
  type TimesheetListRowDto,
  type TimesheetStatus,
} from "../../lib/apiClient";
import { getApiBase, getToken } from "../../lib/api";

function monthKeyFromISO(iso: string) {
  return String(iso ?? "").slice(0, 7); // YYYY-MM
}

function prettyRange(startISO: string, endISO: string) {
  const a = new Date(`${startISO}T00:00:00`);
  const b = new Date(`${endISO}T00:00:00`);
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return `${fmt(a)} – ${fmt(b)}`;
}

function statusLabel(s: TimesheetStatus | undefined) {
  switch (s) {
    case "SUBMITTED":
      return "Pending Review";
    case "ACCEPTED":
      return "Accepted";
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

function statusColor(s: TimesheetStatus | undefined) {
  switch (s) {
    case "SUBMITTED":
      return "#DC2626";
    case "ACCEPTED":
      return "#16A34A";
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

/**
 * Accept:
 * - { timesheets: TimesheetListRowDto[] }
 * - TimesheetListRowDto[]
 * - { data: TimesheetListRowDto[] }
 */
function pickTimesheets(res: any): TimesheetListRowDto[] {
  if (!res) return [];
  if (Array.isArray(res.timesheets)) return res.timesheets;
  if (Array.isArray(res.data)) return res.data;
  if (Array.isArray(res)) return res;
  return [];
}

export default function ForemanTimesheets() {
  const router = useRouter();
  const { theme } = useTheme();
  const colors = themes[theme];
  const styles = getStyles(colors);
  const [rows, setRows] = useState<TimesheetListRowDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [month, setMonth] = useState<string>("ALL");

  const [refreshing, setRefreshing] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [pdfUri, setPdfUri] = useState<string | null>(null);
  const [pdfFilename, setPdfFilename] = useState<string | null>(null);
  const [sharingPdf, setSharingPdf] = useState(false);

  const refresh = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await apiForemanTimesheetsCached(force);
      const list = pickTimesheets(res);

      const sorted = [...list].sort((a, b) => {
        if (Boolean(a.isCurrent) !== Boolean(b.isCurrent)) {
          return a.isCurrent ? -1 : 1;
        }
        return String(b.startISO).localeCompare(String(a.startISO));
      });

      setRows(sorted);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load timesheets.");
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh(true);
    }, [refresh]),
  );

  const downloadPdf = useCallback(async (row: TimesheetListRowDto) => {
    const rowKey = row.rowKey ?? row.id;
    setDownloadingId(rowKey);
    try {
      const token = await getToken();
      if (!token) {
        Alert.alert("Unauthorized", "Please sign in again.");
        return;
      }

      const params = new URLSearchParams();
      if (row.siteId) params.set("siteId", row.siteId);
      const query = params.toString();
      const url = `${getApiBase()}/api/app/foreman/timesheets-mobile/${encodeURIComponent(
        row.id,
      )}/pdf${query ? `?${query}` : ""}`;
      const filename = `timesheet-${row.startISO}-${row.endISO}-${row.siteId ?? "all"}-${Date.now()}.pdf`;
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
      setDownloadingId(null);
    }
  }, []);

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

  const monthOptions = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => {
      const k = monthKeyFromISO(r.startISO);
      if (k) s.add(k);
    });
    return ["ALL", ...Array.from(s).sort().reverse()];
  }, [rows]);

  const previousTimesheet = useMemo(() => {
    if (!rows.length) return null;

    const chronological = [...rows].sort((a, b) =>
      String(b.startISO).localeCompare(String(a.startISO)),
    );

    const current = rows.find((r) => r.isCurrent) ?? chronological[0];
    if (!current) return null;

    const prev = chronological.find((r) => r.id !== current.id);
    return prev ?? null;
  }, [rows]);

  const filtered = useMemo(() => {
    const list =
      month === "ALL"
        ? rows
        : rows.filter((r) => monthKeyFromISO(r.startISO) === month);

    return [...list].sort((a, b) => {
      if (Boolean(a.isCurrent) !== Boolean(b.isCurrent)) {
        return a.isCurrent ? -1 : 1;
      }
      return String(b.startISO).localeCompare(String(a.startISO));
    });
  }, [rows, month]);

  return (
    <AuthStyleBackground>
      <View style={styles.wrap}>
        <View style={styles.header}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text style={styles.h1}>Attendance Sheets</Text>
            <Pressable
              onPress={() => refresh(true)}
              disabled={refreshing}
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: "#ea580c",
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 20,
                opacity: refreshing ? 0.6 : 1,
              }}
            >
              {refreshing ? (
                <ActivityIndicator
                  size="small"
                  color="#fff"
                  style={{ marginRight: 6 }}
                />
              ) : (
                <Ionicons
                  name="refresh"
                  size={16}
                  color="#fff"
                  style={{ marginRight: 6 }}
                />
              )}
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>
                {refreshing ? "Refreshing…" : "Refresh"}
              </Text>
            </Pressable>
          </View>
          <Text style={styles.sub}>Fortnight-based, current always on top</Text>
        </View>
        {/* 
        {previousTimesheet && (
          <GlassCard style={{ padding: 12 }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "800",
                    color: colors.textSecondary,
                    marginBottom: 2,
                  }}
                >
                  Previous timesheet
                </Text>
                <Text style={styles.rowTopText} numberOfLines={1}>
                  {prettyRange(
                    previousTimesheet.startISO,
                    previousTimesheet.endISO,
                  )}
                </Text>
                <Text style={styles.rowBottomText} numberOfLines={1}>
                  {previousTimesheet.siteName || "Multiple sites"}
                </Text>
              </View>

              <Pressable
                onPress={() =>
                  router.push({
                    pathname: "/(foreman-stack)/timesheets/[id]",
                    params: {
                      id: previousTimesheet.id,
                      siteId: previousTimesheet.siteId,
                    },
                  })
                }
                style={{
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: colors.border,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Ionicons
                  name="arrow-forward"
                  size={14}
                  color={colors.textSecondary}
                />
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "800",
                    color: colors.textSecondary,
                  }}
                >
                  Open
                </Text>
              </Pressable>
            </View>
          </GlassCard>
        )} */}

        <GlassCard style={{ padding: 12 }}>
          <View style={styles.filters}>
            {monthOptions.slice(0, 6).map((m) => (
              <Pressable
                key={m}
                onPress={() => setMonth(m)}
                style={[styles.pill, month === m && styles.pillActive]}
              >
                <Text
                  style={[styles.pillTxt, month === m && styles.pillTxtActive]}
                >
                  {m === "ALL" ? "All" : m}
                </Text>
              </Pressable>
            ))}
            {monthOptions.length > 6 ? (
              <Text style={styles.moreText}>
                (+{monthOptions.length - 6} more later)
              </Text>
            ) : null}
          </View>
        </GlassCard>

        {loading ? (
          <GlassCard style={styles.loading}>
            <ActivityIndicator />
            <Text style={styles.loadingText}>Loading…</Text>
          </GlassCard>
        ) : error ? (
          <GlassCard style={{ padding: 16, gap: 10 }}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.btnSecondary} onPress={() => refresh()}>
              <Text style={styles.btnSecondaryText}>Retry</Text>
            </Pressable>
          </GlassCard>
        ) : (
          <GlassCard style={{ padding: 0, flex: 1 }}>
            {/* <View style={styles.listHeader}>
              <Text style={styles.listTitle}>Fortnights</Text>
              <Text style={styles.listSub}>{filtered.length} shown</Text>
            </View> */}

            <FlatList
              data={filtered}
              keyExtractor={(i) => i.rowKey ?? i.id}
              contentContainerStyle={{ paddingBottom: 16 }}
              renderItem={({ item }) => {
                const siteLine = `${item.siteCode ? item.siteCode + " • " : ""}${item.siteName ?? ""}`;
                const sColor = statusColor(item.status);

                const createdBy = item.createdByLabel || "You";
                const isYou = createdBy === "You";

                const hasTotals =
                  item.totalWorkerDays != null || item.daysCount != null;

                const effectiveDays =
                  item.totalWorkerDays != null
                    ? item.totalWorkerDays
                    : item.daysCount;

                const daysLabel =
                  effectiveDays != null ? `${effectiveDays} days` : undefined;

                const downloading = downloadingId === (item.rowKey ?? item.id);

                return (
                  <Pressable
                    onPress={() =>
                      router.push({
                        pathname: "/(foreman-stack)/timesheets/[id]",
                        params: { id: item.id, siteId: item.siteId },
                      })
                    }
                    style={({ pressed }) => [
                      styles.row,
                      { opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <View style={styles.rowLeft}>
                      <View style={styles.rowCreator}>
                        <Text style={styles.rowTopText}>
                          {prettyRange(item.startISO, item.endISO)}
                        </Text>

                        {isYou ? (
                          <View style={styles.rowCreator}>
                            <Ionicons
                              name="person"
                              size={14}
                              color={colors.textSecondary}
                            />
                            <Text style={styles.rowMidText} numberOfLines={1}>
                              {createdBy}
                            </Text>
                          </View>
                        ) : (
                          <Text style={styles.rowMidText} numberOfLines={1}>
                            {createdBy}
                          </Text>
                        )}
                      </View>

                      <Text style={styles.rowBottomText} numberOfLines={1}>
                        {siteLine || "—"}
                      </Text>
                      <View style={styles.rowRight}>
                        <View
                          style={[
                            styles.badge,
                            { backgroundColor: `${sColor}18` },
                          ]}
                        >
                          <View
                            style={[styles.dot, { backgroundColor: sColor }]}
                          />
                          <Text style={[styles.badgeText, { color: sColor }]}>
                            {statusLabel(item.status)}
                          </Text>
                        </View>
                        <Pressable
                          onPress={() => downloadPdf(item)}
                          disabled={downloading}
                          style={[
                            styles.pdfButton,
                            downloading && { opacity: 0.6 },
                          ]}
                        >
                          {downloading ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <Ionicons
                              name="download-outline"
                              size={15}
                              color="#fff"
                            />
                          )}
                          <Text style={styles.pdfButtonText}>
                            {downloading ? "Loading" : "Download PDF"}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <View style={{ padding: 16 }}>
                  <Text style={styles.emptyText}>
                    No timesheets yet. Scan workers to create days, then they’ll
                    group into fortnights.
                  </Text>

                  <Pressable
                    style={[styles.btnSecondary, { marginTop: 12 }]}
                    onPress={() => refresh()}
                  >
                    <Text style={styles.btnSecondaryText}>Refresh</Text>
                  </Pressable>
                </View>
              }
            />
          </GlassCard>
        )}

        <Modal
          visible={!!pdfUri}
          animationType="slide"
          onRequestClose={() => setPdfUri(null)}
        >
          <View style={styles.pdfModal}>
            <View style={styles.pdfHeader}>
              <Text style={styles.pdfTitle}>Timesheet PDF</Text>
              <Pressable
                style={styles.pdfClose}
                onPress={() => setPdfUri(null)}
              >
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

/* keep your themes + styles as-is */

const themes = {
  dark: {
    bg: "#0b1220",
    bgSecondary: "#0f172a",
    border: "#1f2a44",
    textPrimary: "white",
    textSecondary: "#94a3b8",
    accent: "#38bdf8",
    accentLight: "rgba(56,189,248,0.18)",
    success: "#16a34a",
    successLight: "rgba(22,163,74,0.12)",
    error: "#dc2626",
    errorLight: "rgba(220,38,38,0.10)",
    warning: "#f59e0b",
    warningLight: "rgba(245,158,11,0.14)",
    info: "#38bdf8",
    infoLight: "rgba(56,189,248,0.14)",
  },
  light: {
    bg: "#f8fafc",
    bgSecondary: "#ffffff",
    border: "#e2e8f0",
    textPrimary: "#0f172a",
    textSecondary: "#64748b",
    accent: "#0ea5e9",
    accentLight: "rgba(14,165,233,0.08)",
    success: "#22c55e",
    successLight: "rgba(34,197,94,0.12)",
    error: "#ef4444",
    errorLight: "rgba(239,68,68,0.10)",
    warning: "#f59e0b",
    warningLight: "rgba(245,158,11,0.14)",
    info: "#262D68",
    infoLight: "rgba(38,45,104,0.14)",
  },
};

const getStyles = (colors: (typeof themes)["dark"]) =>
  StyleSheet.create({
    wrap: { flex: 1, padding: 16, gap: 12 },
    header: { gap: 4 },
    h1: { fontSize: 20, fontWeight: "900", color: colors.textPrimary },
    sub: { color: colors.textSecondary, fontWeight: "700" },

    loading: { paddingVertical: 20, alignItems: "center", gap: 10 },
    loadingText: {
      color: colors.textSecondary,
      fontWeight: "800",
    },

    filters: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      alignItems: "center",
    },
    pill: {
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 999,
      backgroundColor: colors.bgSecondary,
      borderWidth: 1,
      borderColor: colors.border,
    },
    pillActive: {
      backgroundColor: colors.info,
      borderColor: "rgba(0,0,0,0)",
    },
    pillTxt: {
      fontWeight: "900",
      fontSize: 12,
      color: colors.textPrimary,
    },
    pillTxtActive: { color: "#fff" },
    moreText: {
      color: colors.textSecondary,
      fontWeight: "800",
      marginLeft: 4,
    },

    listHeader: {
      padding: 16,
      // paddingTop: 0,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    listTitle: {
      fontSize: 14,
      fontWeight: "900",
      color: colors.textPrimary,
    },
    listSub: {
      marginTop: 2,
      color: colors.textSecondary,
      fontWeight: "800",
      fontSize: 12,
    },

    row: {
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      boxShadow: `0 1px 2px ${colors.border}`,
      marginBottom: 8,
    },

    rowLeft: { flex: 1, gap: 4, paddingRight: 12 },
    rowTopText: { fontSize: 14, fontWeight: "900", color: colors.textPrimary },
    rowCreator: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    rowMidText: {
      fontSize: 13,
      fontWeight: "800",
      // Tailwind orange-500
      color: "#f97316",
    },
    rowBottomText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.textSecondary,
    },

    rowRight: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderTopColor: colors.border,
      borderTopWidth: 1,
      marginTop: 10,
      paddingTop: 10,
    },

    rowStats: {
      alignItems: "flex-end",
      marginRight: 4,
    },
    rowStatsTop: {
      fontSize: 12,
      fontWeight: "800",
      color: colors.textSecondary,
    },
    rowStatsBottom: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.textPrimary,
    },

    badge: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    dot: { width: 8, height: 8, borderRadius: 4 },
    badgeText: {
      fontSize: 12,
      fontWeight: "900",
      color: colors.textSecondary,
    },
    pdfButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      borderRadius: 5,
      backgroundColor: colors.info,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    pdfButtonText: { color: "#fff", fontSize: 12, fontWeight: "900" },

    btnSecondary: {
      backgroundColor: colors.bgSecondary,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 5,
      alignItems: "center",
    },
    btnSecondaryText: { color: colors.textPrimary, fontWeight: "900" },
    pdfModal: { flex: 1, backgroundColor: colors.bgSecondary },
    pdfHeader: {
      paddingTop: 52,
      paddingBottom: 12,
      paddingHorizontal: 16,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      backgroundColor: colors.info,
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

    errorText: {
      color: colors.error,
      fontWeight: "900",
    },
    emptyText: {
      color: colors.textSecondary,
      fontWeight: "800",
    },
  });
