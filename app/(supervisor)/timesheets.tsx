import { useFocusEffect } from "@react-navigation/native";
import { File, Paths } from "expo-file-system";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { WebView } from "react-native-webview";

import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import { GlassCard } from "@/components/GlassCard";
import LoadingOverlay from "@/components/LoadingOverlay";
import { useDataCache } from "@/lib/dataCache";
import {
  getCurrentFortnight,
  getFortnightForDate,
  type Fortnight,
} from "@/lib/fortnight";
import { useTheme } from "@/lib/themeContext";
import { Ionicons } from "@expo/vector-icons";

import type { TimesheetListRowDto, TimesheetStatus } from "../../lib/apiClient";
import { apiSupervisorTimesheetsCached } from "../../lib/apiClient";
import { getApiBase, getToken } from "../../lib/api";

const NAVY = "#262D68";

const themes = {
  dark: {
    bg: "#0b1220",
    bgSecondary: "#0f172a",
    border: "#1f2a44",
    textPrimary: "white",
    textSecondary: "#94a3b8",
    textTertiary: "#cbd5e1",
    accent: "#38bdf8",
    error: "#dc2626",
  },
  light: {
    bg: "#f8fafc",
    bgSecondary: "#ffffff",
    border: "#e2e8f0",
    textPrimary: "#0f172a",
    textSecondary: "#64748b",
    textTertiary: "#475569",
    accent: "#0ea5e9",
    error: "#ef4444",
  },
};

function todayLabel() {
  const d = new Date();
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function iso10(v: any) {
  return String(v ?? "").slice(0, 10);
}

function formatDateRange(startISO: string, endISO: string): string {
  // Use YYYY-MM-DD only (prevents invalid Date bugs)
  const start = new Date(`${iso10(startISO)}T00:00:00.000Z`);
  const end = new Date(`${iso10(endISO)}T00:00:00.000Z`);
  const startStr = start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const endStr = end.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return `${startStr} - ${endStr}`;
}

function buildRecentFortnights(): Fortnight[] {
  const current = getCurrentFortnight();
  const periods: Fortnight[] = [];
  let cursor = new Date(`${current.startISO}T00:00:00.000Z`);

  for (let i = 0; i < 6; i++) {
    periods.push(getFortnightForDate(cursor.toISOString().slice(0, 10)));
    cursor = new Date(cursor.getTime() - 14 * 24 * 60 * 60 * 1000);
  }

  return periods;
}

function statusLabel(s: TimesheetStatus) {
  switch (s) {
    case "SUBMITTED":
      return "Pending";
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

function statusColor(s: TimesheetStatus) {
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

export default function SupervisorTimesheets() {
  const { theme } = useTheme();
  const colors = themes[theme];
  const { supervisorTimesheets, setSupervisorTimesheets, isFresh } =
    useDataCache();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timesheets, setTimesheets] = useState<TimesheetListRowDto[]>([]);
  const [searchText, setSearchText] = useState("");
  const periods = useMemo(buildRecentFortnights, []);
  const [selectedPeriod, setSelectedPeriod] = useState<Fortnight>(periods[0]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [pdfUri, setPdfUri] = useState<string | null>(null);
  const [pdfFilename, setPdfFilename] = useState<string | null>(null);
  const [sharingPdf, setSharingPdf] = useState(false);

  const loadTimesheets = useCallback(async (forceRefresh = false) => {
    const periodParam = `${selectedPeriod.startISO}_${selectedPeriod.endISO}`;
    const cacheKey = `${periodParam}_${searchText.trim()}`;

    const cachedData = supervisorTimesheets[cacheKey];
    if (!forceRefresh && cachedData && isFresh(cachedData.timestamp)) {
      setTimesheets(cachedData.data.timesheets ?? []);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res: any = await apiSupervisorTimesheetsCached(
        {
          q: searchText.trim().length ? searchText.trim() : undefined,
          period: periodParam,
          limit: 60,
        },
        forceRefresh,
      );
      setTimesheets(res.timesheets ?? []);
      setSupervisorTimesheets(cacheKey, res);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load timesheets");
      setTimesheets([]);
    } finally {
      setLoading(false);
    }
  }, [
    selectedPeriod,
    searchText,
    supervisorTimesheets,
    isFresh,
    setSupervisorTimesheets,
  ]);

  useEffect(() => {
    loadTimesheets();
  }, [loadTimesheets]);

  const loadTimesheetsRef = useRef(loadTimesheets);
  loadTimesheetsRef.current = loadTimesheets;

  useFocusEffect(
    useCallback(() => {
      void loadTimesheetsRef.current(true);
    }, []),
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
      const url = `${getApiBase()}/api/app/supervisor/timesheets/${encodeURIComponent(
        row.id,
      )}/pdf${query ? `?${query}` : ""}`;
      const filename = `supervisor-timesheet-${row.startISO}-${row.endISO}-${row.siteId ?? "all"}-${Date.now()}.pdf`;
      const destination = new File(Paths.document, filename);
      const result = await File.downloadFileAsync(url, destination, {
        headers: { Authorization: `Bearer ${token}` },
        idempotent: false,
      });
      setPdfFilename(filename);
      setPdfUri(result.uri);
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
        dialogTitle: "Save or share supervisor timesheet PDF",
      });
    } catch (e: any) {
      Alert.alert("Share Failed", e?.message ?? "Failed to share the PDF.");
    } finally {
      setSharingPdf(false);
    }
  }, [pdfFilename, pdfUri]);

  return (
    <AuthStyleBackground>
      <ScrollView style={styles.wrap} showsVerticalScrollIndicator={false}>
        <GlassCard style={styles.topCard}>
          <View style={styles.topCardRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.h1, { color: colors.textPrimary }]}>
                Timesheets
              </Text>
              <Text style={[styles.sub, { color: colors.textSecondary }]}>
                {todayLabel()}
              </Text>
            </View>

            <Pressable
              onPress={() => loadTimesheets(true)}
              disabled={loading}
              style={[styles.refreshBtn, loading && { opacity: 0.6 }]}
            >
              <Ionicons name="refresh" size={18} color="#fff" />
              <Text style={styles.refreshBtnText}>Refresh</Text>
            </Pressable>
          </View>
        </GlassCard>

        <GlassCard style={styles.filterCard}>
          <View
            style={[
              styles.searchBox,
              {
                backgroundColor: colors.bgSecondary,
                borderColor: colors.border,
              },
            ]}
          >
            <Ionicons name="search" size={18} color={colors.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: colors.textPrimary }]}
              placeholder="Search foreman or site..."
              placeholderTextColor={colors.textSecondary}
              value={searchText}
              onChangeText={setSearchText}
              returnKeyType="search"
              onSubmitEditing={() => loadTimesheets(true)}
            />
            {searchText.length > 0 && (
              <Pressable onPress={() => setSearchText("")}>
                <Ionicons
                  name="close-circle"
                  size={18}
                  color={colors.textSecondary}
                />
              </Pressable>
            )}
          </View>

          <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>
            Fortnight:
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.periodTabs}
          >
            {periods.map((period) => {
              const selected = period.id === selectedPeriod.id;
              return (
                <Pressable
                  key={period.id}
                  style={[
                    styles.periodTab,
                    selected
                      ? { backgroundColor: NAVY, borderColor: NAVY }
                      : {
                          backgroundColor: colors.bgSecondary,
                          borderColor: colors.border,
                        },
                  ]}
                  onPress={() => setSelectedPeriod(period)}
                >
                  <Text
                    style={[
                      styles.periodTabLabel,
                      selected
                        ? styles.periodTabLabelActive
                        : { color: colors.textSecondary },
                    ]}
                  >
                    {formatDateRange(period.startISO, period.endISO)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </GlassCard>

        {loading ? (
          <LoadingOverlay
            icon="⏳"
            title="Loading timesheets…"
            message="Please wait while we fetch your timesheets"
          />
        ) : error ? (
          <View style={styles.stateBox}>
            <Text
              style={[styles.stateText, { color: colors.error || "#dc2626" }]}
            >
              {error}
            </Text>
            <Pressable
              style={styles.retryButton}
              onPress={() => loadTimesheets(true)}
            >
              <Ionicons name="refresh" size={18} color="#fff" />
              <Text style={styles.retryButtonText}>Try Again</Text>
            </Pressable>
          </View>
        ) : timesheets.length === 0 ? (
          <View style={styles.stateBox}>
            <Text
              style={[
                styles.stateText,
                { color: colors.textSecondary, fontWeight: "800" },
              ]}
            >
              No timesheets found.
            </Text>
          </View>
        ) : (
          <View style={[styles.listShell, { borderTopColor: colors.border }]}>
            <FlatList
              data={timesheets}
              keyExtractor={(item) => item.rowKey ?? item.id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <TimesheetRow
                  item={item}
                  theme={colors}
                  downloading={downloadingId === (item.rowKey ?? item.id)}
                  onDownload={() => downloadPdf(item)}
                />
              )}
            />
          </View>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
      <Modal
        visible={!!pdfUri}
        animationType="slide"
        onRequestClose={() => setPdfUri(null)}
      >
        <View
          style={[styles.pdfModal, { backgroundColor: colors.bgSecondary }]}
        >
          <View style={styles.pdfHeader}>
            <Text style={styles.pdfTitle}>Timesheet PDF</Text>
            <Pressable style={styles.pdfClose} onPress={() => setPdfUri(null)}>
              <Ionicons name="close" size={22} color="#fff" />
            </Pressable>
          </View>
          <View
            style={[styles.pdfActions, { borderBottomColor: colors.border }]}
          >
            <Text
              numberOfLines={1}
              style={[styles.pdfSavedText, { color: colors.textSecondary }]}
            >
              Saved in app: {pdfFilename ?? "timesheet.pdf"}
            </Text>
            <Pressable
              style={styles.pdfShareButton}
              onPress={sharePdf}
              disabled={sharingPdf}
            >
              {sharingPdf ? (
                <ActivityIndicator size="small" color="#fff" />
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
                <View
                  style={[
                    styles.pdfLoading,
                    { backgroundColor: colors.bgSecondary },
                  ]}
                >
                  <ActivityIndicator color={colors.accent} />
                  <Text style={{ color: colors.textSecondary }}>
                    Loading PDF...
                  </Text>
                </View>
              )}
            />
          )}
        </View>
      </Modal>
    </AuthStyleBackground>
  );
}

function TimesheetRow({
  item,
  theme,
  downloading,
  onDownload,
}: {
  item: TimesheetListRowDto;
  theme: (typeof themes)["dark"];
  downloading: boolean;
  onDownload: () => void;
}) {
  const router = useRouter();
  const sColor = statusColor(item.status ?? "DRAFT");
  const siteLine = `${item.siteCode ? item.siteCode + " • " : ""}${item.siteName}`;
  const foremanLabel = (() => {
    const primary =
      item.foreman?.name && item.foreman?.name.trim().length > 0
        ? item.foreman.name.trim()
        : item.foremanName?.trim();

    const val = primary ?? "";
    const lower = val.toLowerCase();
    if (!val || lower === "undefined" || lower === "null") return "";
    return val;
  })();

  const detailId = String(item.id ?? "").trim(); // ✅ already composite id

  return (
    <Pressable
      onPress={() => {
        if (!detailId) {
          Alert.alert("Cannot open timesheet", "Missing timesheet id.");
          return;
        }

        router.push({
          pathname: "/(supervisor-stack)/timesheets/[id]",
          params: {
            id: detailId,
            siteId: item.siteId,
          },
        });
      }}
      style={({ pressed }) => [
        styles.row,
        {
          borderBottomColor: theme.border || "#1f2a44",
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View style={styles.rowLeft}>
        <Text style={[styles.rowTopText, { color: theme.textPrimary }]}>
          {foremanLabel}
        </Text>

        <Text style={[styles.rowBottomText, { color: theme.textSecondary }]}>
          {siteLine}
        </Text>
      </View>

      <View style={styles.rowRight}>
        <View style={styles.rowMeta}>
          <View style={styles.statusIndicator}>
            <View style={[styles.dot, { backgroundColor: sColor }]} />
            <Text style={[styles.badgeText, { color: sColor }]}>
              {statusLabel(item.status ?? "DRAFT")}
            </Text>
          </View>
        </View>
        <Pressable
          style={[styles.pdfButton, downloading && { opacity: 0.6 }]}
          disabled={downloading}
          onPress={(event) => {
            event.stopPropagation();
            onDownload();
          }}
        >
          {downloading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="download-outline" size={14} color="#fff" />
          )}
          <Text style={styles.pdfButtonText}>
            {downloading ? "Preparing..." : "PDF"}
          </Text>
        </Pressable>
        <Ionicons
          name="chevron-forward"
          size={18}
          color={theme.textSecondary}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 16, paddingTop: 0 },

  topCard: { padding: 14, marginBottom: 12 },
  topCardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  refreshBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: NAVY,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: NAVY,
  },
  refreshBtnText: {
    fontSize: 13,
    fontWeight: "900",
    color: "#fff",
  },
  filterCard: { padding: 14, marginBottom: 12 },

  h1: { fontSize: 20, fontWeight: "900" },
  sub: { marginTop: 6, fontWeight: "800", fontSize: 13 },

  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 14,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, fontWeight: "600" },

  filterLabel: { fontSize: 12, fontWeight: "900", marginBottom: 8 },
  periodTabs: { flexDirection: "row", gap: 8 },
  periodTab: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
  },
  periodTabLabel: { fontSize: 12, fontWeight: "800" },
  periodTabLabelActive: { color: "#fff" },

  listShell: { backgroundColor: "transparent", borderTopWidth: 1 },

  row: {
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    borderBottomWidth: 1,
  },

  rowLeft: { flex: 1, gap: 5, paddingRight: 12 },
  rowTopText: { fontSize: 14, fontWeight: "900" },
  rowBottomText: { fontSize: 12, fontWeight: "700" },

  rowRight: { flexDirection: "row", alignItems: "center", gap: 9 },
  rowMeta: { alignItems: "flex-end", gap: 6 },
  rowStatsTop: { fontSize: 11, fontWeight: "800" },

  statusIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  badgeText: { fontSize: 12, fontWeight: "900" },
  pdfButton: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: NAVY,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  pdfButtonText: { color: "#fff", fontSize: 12, fontWeight: "900" },

  stateBox: { paddingVertical: 28, alignItems: "center", gap: 12 },
  stateText: { fontWeight: "800" },

  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#dc2626",
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  retryButtonText: { fontSize: 13, fontWeight: "900", color: "#fff" },
  pdfModal: { flex: 1 },
  pdfHeader: {
    paddingTop: 52,
    paddingBottom: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: NAVY,
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
  },
  pdfSavedText: { flex: 1, fontSize: 12, fontWeight: "700" },
  pdfShareButton: {
    minWidth: 124,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 9,
    backgroundColor: NAVY,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  pdfShareText: { color: "#fff", fontWeight: "900", fontSize: 12 },
  pdfViewer: { flex: 1 },
  pdfLoading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },
});
