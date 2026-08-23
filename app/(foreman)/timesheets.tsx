import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import { GlassCard } from "@/components/GlassCard";
import {
  useFaceTheme,
  type FaceColorPalette,
} from "@/components/team/faceTheme";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  apiForemanTimesheetsCached,
  apiForemanTimesheetsForPeriod,
  type TimesheetListRowDto,
  type TimesheetStatus,
} from "../../lib/apiClient";
import { getApiBase, getToken } from "../../lib/api";
import {
  getCurrentFortnight,
  getFortnightForDate,
  type Fortnight,
} from "../../lib/fortnight";

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

// statusColor moved into component so it can use the face theme

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
  const insets = useSafeAreaInsets();
  const { colors: faceColors, radius, typography } = useFaceTheme();
  const styles = getStyles(faceColors, radius, typography);
  // local mapping so the component can still reference `colors.*` as before
  const colors = {
    bg: faceColors.background,
    bgSecondary: faceColors.backgroundElevated,
    border: (faceColors as any).glassBorder ?? faceColors.backgroundElevated,
    textPrimary: faceColors.textPrimary,
    textOnPrimary: faceColors.textOnPrimary,
    textSecondary: faceColors.textSecondary,
    // matches the green brand action colour used on the foreman home screen
    info: faceColors.success,
    infoLight: faceColors.successDim,
    infoBg: faceColors.successDim,
    error: faceColors.danger,
    errorLight: faceColors.dangerDim,
  } as const;

  function statusColor(s: TimesheetStatus | undefined) {
    switch (s) {
      case "SUBMITTED":
        return faceColors.danger;
      case "ACCEPTED":
        return faceColors.success;
      case "APPROVED":
        return faceColors.success;
      case "PAID":
        return faceColors.primary;
      case "REJECTED":
        return faceColors.warning;
      default:
        return faceColors.textSecondary;
    }
  }
  const [rows, setRows] = useState<TimesheetListRowDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Default to the current fortnight only — the list endpoint returns the
  // current period plus up to 2 previous ones in one flat array, and
  // showing all of them by default made past-fortnight sites look like
  // they belonged to the current one.
  const [scope, setScope] = useState<"CURRENT" | "ALL">("CURRENT");

  // "All History" — a picker of the 3 fortnights before the current one
  // (current is always shown on its own tab, so it's excluded here).
  // Each fortnight's rows are fetched on demand when selected.
  const [selectedPastId, setSelectedPastId] = useState<string | null>(null);
  const [fortnightDropdownOpen, setFortnightDropdownOpen] = useState(false);
  const [pastRows, setPastRows] = useState<TimesheetListRowDto[]>([]);
  const [pastLoading, setPastLoading] = useState(false);
  const [pastError, setPastError] = useState<string | null>(null);

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

  // Past 3 fortnights, most recent first, excluding the current one — it
  // always has its own tab.
  const pastFortnights = useMemo(() => {
    const current = getCurrentFortnight();
    const out: Fortnight[] = [];
    let cursorStart = new Date(`${current.startISO}T00:00:00.000Z`);
    for (let i = 0; i < 3; i++) {
      cursorStart = new Date(cursorStart.getTime() - 14 * 24 * 60 * 60 * 1000);
      const dateISO = cursorStart.toISOString().slice(0, 10);
      out.push(getFortnightForDate(dateISO));
    }
    return out;
  }, []);

  const selectedPastFortnight = useMemo(
    () => pastFortnights.find((f) => f.id === selectedPastId) ?? null,
    [pastFortnights, selectedPastId],
  );

  const loadPastPeriod = useCallback(async (periodId: string) => {
    setPastLoading(true);
    setPastError(null);
    try {
      const res = await apiForemanTimesheetsForPeriod(periodId);
      setPastRows(res.timesheets ?? []);
    } catch (e: any) {
      setPastError(e?.message ?? "Failed to load this fortnight.");
      setPastRows([]);
    } finally {
      setPastLoading(false);
    }
  }, []);

  const selectScope = useCallback(
    (next: "CURRENT" | "ALL") => {
      setScope(next);
      if (next === "ALL" && !selectedPastId && pastFortnights[0]) {
        setSelectedPastId(pastFortnights[0].id);
        loadPastPeriod(pastFortnights[0].id);
      }
    },
    [selectedPastId, pastFortnights, loadPastPeriod],
  );

  const selectPastFortnight = useCallback(
    (id: string) => {
      setSelectedPastId(id);
      loadPastPeriod(id);
    },
    [loadPastPeriod],
  );

  const filtered = useMemo(() => {
    const list =
      scope === "CURRENT" ? rows.filter((r) => r.isCurrent) : pastRows;

    return [...list].sort((a, b) =>
      String(b.startISO).localeCompare(String(a.startISO)),
    );
  }, [rows, scope, pastRows]);

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
                backgroundColor: colors.info,
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 20,
                opacity: refreshing ? 0.6 : 1,
              }}
            >
              {refreshing ? (
                <ActivityIndicator
                  size="small"
                  color={colors.textOnPrimary}
                  style={{ marginRight: 6 }}
                />
              ) : (
                <Ionicons
                  name="refresh"
                  size={16}
                  color={colors.textOnPrimary}
                  style={{ marginRight: 6 }}
                />
              )}
              <Text style={{ color: colors.textOnPrimary, fontWeight: "800", fontSize: 13 }}>
                {refreshing ? "Refreshing…" : "Refresh"}
              </Text>
            </Pressable>
          </View>
          <Text style={styles.sub}>
            {scope === "CURRENT"
              ? "Showing your current fortnight"
              : "Pick a past fortnight to view"}
          </Text>
        </View>

        <GlassCard style={{ padding: 12 }}>
          <View style={styles.filters}>
            <Pressable
              onPress={() => selectScope("CURRENT")}
              style={[styles.pill, scope === "CURRENT" && styles.pillActive]}
            >
              <Text
                style={[
                  styles.pillTxt,
                  scope === "CURRENT" && styles.pillTxtActive,
                ]}
              >
                Current Fortnight
              </Text>
            </Pressable>
            <Pressable
              onPress={() => selectScope("ALL")}
              style={[styles.pill, scope === "ALL" && styles.pillActive]}
            >
              <Text
                style={[
                  styles.pillTxt,
                  scope === "ALL" && styles.pillTxtActive,
                ]}
              >
                All History
              </Text>
            </Pressable>
          </View>
        </GlassCard>

        {scope === "ALL" && (
          <GlassCard style={{ padding: 12 }}>
            <Pressable
              style={styles.fortnightDropdownTrigger}
              onPress={() => setFortnightDropdownOpen(true)}
            >
              <Text style={styles.fortnightDropdownTxt} numberOfLines={1}>
                {selectedPastFortnight
                  ? prettyRange(
                      selectedPastFortnight.startISO,
                      selectedPastFortnight.endISO,
                    )
                  : "Select a fortnight"}
              </Text>
              <Ionicons
                name="chevron-down"
                size={16}
                color={colors.textSecondary}
              />
            </Pressable>
          </GlassCard>
        )}

        <Modal
          visible={fortnightDropdownOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setFortnightDropdownOpen(false)}
        >
          <Pressable
            style={styles.dropdownBackdrop}
            onPress={() => setFortnightDropdownOpen(false)}
          >
            <Pressable style={styles.dropdownSheet} onPress={() => {}}>
              <Text style={styles.dropdownSheetTitle}>Select a fortnight</Text>
              {pastFortnights.map((f) => {
                const active = selectedPastId === f.id;
                return (
                  <Pressable
                    key={f.id}
                    style={[
                      styles.dropdownRow,
                      active && styles.dropdownRowActive,
                    ]}
                    onPress={() => {
                      setFortnightDropdownOpen(false);
                      selectPastFortnight(f.id);
                    }}
                  >
                    <Text
                      style={[
                        styles.dropdownRowTxt,
                        active && { color: colors.info },
                      ]}
                    >
                      {prettyRange(f.startISO, f.endISO)}
                    </Text>
                    {active && (
                      <Ionicons
                        name="checkmark"
                        size={18}
                        color={colors.info}
                      />
                    )}
                  </Pressable>
                );
              })}
            </Pressable>
          </Pressable>
        </Modal>
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

        {scope === "CURRENT" && loading ? (
          <GlassCard style={styles.loading}>
            <ActivityIndicator />
            <Text style={styles.loadingText}>Loading…</Text>
          </GlassCard>
        ) : scope === "CURRENT" && error ? (
          <GlassCard style={{ padding: 16, gap: 10 }}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.btnSecondary} onPress={() => refresh()}>
              <Text style={styles.btnSecondaryText}>Retry</Text>
            </Pressable>
          </GlassCard>
        ) : scope === "ALL" && pastLoading ? (
          <GlassCard style={styles.loading}>
            <ActivityIndicator />
            <Text style={styles.loadingText}>Loading…</Text>
          </GlassCard>
        ) : scope === "ALL" && pastError ? (
          <GlassCard style={{ padding: 16, gap: 10 }}>
            <Text style={styles.errorText}>{pastError}</Text>
            <Pressable
              style={styles.btnSecondary}
              onPress={() => selectedPastId && loadPastPeriod(selectedPastId)}
            >
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
                            <ActivityIndicator size="small" color={colors.textOnPrimary} />
                          ) : (
                            <Ionicons
                              name="download-outline"
                              size={15}
                              color={colors.textOnPrimary}
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
                    {scope === "ALL"
                      ? "No attendance recorded for this fortnight."
                      : "No timesheets yet. Scan guys to create days, then they’ll group into fortnights."}
                  </Text>

                  <Pressable
                    style={[styles.btnSecondary, { marginTop: 12 }]}
                    onPress={() =>
                      scope === "ALL"
                        ? selectedPastId && loadPastPeriod(selectedPastId)
                        : refresh()
                    }
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
            <View style={[styles.pdfHeader, { paddingTop: insets.top + 12 }]}>
              <Text style={styles.pdfTitle}>Timesheet PDF</Text>
              <Pressable
                style={styles.pdfClose}
                onPress={() => setPdfUri(null)}
              >
                <Ionicons name="close" size={22} color={colors.textOnPrimary} />
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
                  <ActivityIndicator color={colors.textOnPrimary} size="small" />
                ) : (
                  <Ionicons name="share-outline" size={16} color={colors.textOnPrimary} />
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

const getStyles = (
  faceColors: FaceColorPalette,
  radius: { sm: number; md: number; lg: number; xl: number; pill: number },
  typography?: Record<string, any>,
) => {
  // map legacy keys used in this screen to the FaceColorPalette
  const colors = {
    bg: faceColors.background,
    bgSecondary: faceColors.backgroundElevated,
    border: (faceColors as any).glassBorder ?? faceColors.backgroundElevated,
    textPrimary: faceColors.textPrimary,
    textOnPrimary: faceColors.textOnPrimary,
    textSecondary: faceColors.textSecondary,
    // matches the green brand action colour used on the foreman home screen
    info: faceColors.success,
    infoLight: faceColors.successDim,
    infoBg: faceColors.successDim,
    error: faceColors.danger,
    errorLight: faceColors.dangerDim,
  } as const;

  return StyleSheet.create({
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
    pillTxtActive: { color: colors.textOnPrimary },
    moreText: {
      color: colors.textSecondary,
      fontWeight: "800",
      marginLeft: 4,
    },

    fortnightDropdownTrigger: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: colors.bgSecondary,
      borderWidth: 1,
      borderColor: colors.border,
    },
    fortnightDropdownTxt: {
      flex: 1,
      color: colors.textPrimary,
      fontWeight: "800",
      fontSize: 14,
    },

    dropdownBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      paddingHorizontal: 24,
    },
    dropdownSheet: {
      backgroundColor: colors.bgSecondary,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
    },
    dropdownSheetTitle: {
      color: colors.textSecondary,
      fontWeight: "900",
      fontSize: 12,
      textTransform: "uppercase",
      marginBottom: 8,
    },
    dropdownRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 14,
      paddingHorizontal: 4,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    dropdownRowActive: {
      backgroundColor: colors.infoLight,
      borderRadius: 10,
      paddingHorizontal: 10,
    },
    dropdownRowTxt: {
      color: colors.textPrimary,
      fontWeight: "800",
      fontSize: 14,
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
      color: colors.info,
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
    pdfButtonText: { color: colors.textOnPrimary, fontSize: 12, fontWeight: "900" },

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
      // paddingTop is set dynamically from useSafeAreaInsets() at the call site.
      paddingBottom: 12,
      paddingHorizontal: 16,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      backgroundColor: colors.info,
    },
    pdfTitle: { color: colors.textOnPrimary, fontSize: 18, fontWeight: "900" },
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
    pdfShareText: { color: colors.textOnPrimary, fontWeight: "900", fontSize: 12 },
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
};
