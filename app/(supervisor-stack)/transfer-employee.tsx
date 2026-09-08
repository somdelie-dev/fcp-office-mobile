import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import { GlassCard } from "@/components/GlassCard";
import LoadingOverlay from "@/components/LoadingOverlay";
import {
  apiDeleteScan,
  apiSupervisorSiteScansToday,
  apiSupervisorSites,
  apiTransferEmployee,
  type SiteForemanDto,
  type SiteScanTodayDto,
  type SupervisorSiteListItemDto,
} from "@/lib/apiClient";
import { getFortnightForDate } from "@/lib/fortnight";
import { useTheme } from "@/lib/themeContext";

const themes = {
  dark: {
    textPrimary: "#e5e7eb",
    textSecondary: "#94a3b8",
    cardBg: "rgba(15,23,42,0.85)",
    accent: "#22c55e",
    success: "#4ade80",
    danger: "#ef4444",
    border: "rgba(148,163,184,0.15)",
    inputBg: "rgba(255,255,255,0.08)",
  },
  light: {
    textPrimary: "#111111",
    textSecondary: "#666666",
    cardBg: "rgba(255,255,255,0.9)",
    accent: "#22c55e",
    success: "#22c55e",
    danger: "#ef4444",
    border: "rgba(0,0,0,0.08)",
    inputBg: "rgba(0,0,0,0.04)",
  },
} as const;

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function joburgISODate(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function prettyWorkDate(dateISO: string) {
  return new Date(`${dateISO}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function jobNumberToNumber(v?: string | null): number {
  const s = String(v ?? "").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export default function TransferEmployeeScreen() {
  const router = useRouter();
  const { siteId: paramSiteId } = useLocalSearchParams<{ siteId: string }>();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const colors = themes[theme];

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Source site data
  const [sites, setSites] = useState<SupervisorSiteListItemDto[]>([]);
  // Subset of `sites` that have at least one attendance scan on the selected
  // work date — used only for the Source Site row. Destination pickers and
  // name lookups below intentionally keep using the full `sites` list.
  const [sitesWithScans, setSitesWithScans] = useState<
    SupervisorSiteListItemDto[]
  >([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>(
    paramSiteId ?? "",
  );
  const [scans, setScans] = useState<SiteScanTodayDto[]>([]);
  const [scannedInCount, setScannedInCount] = useState(0);
  const [scannedOutCount, setScannedOutCount] = useState(0);
  const todayISO = useMemo(() => joburgISODate(), []);
  const currentFortnight = useMemo(
    () => getFortnightForDate(todayISO),
    [todayISO],
  );
  const workDateOptions = useMemo(() => {
    const result: string[] = [];
    const start = new Date(`${currentFortnight.startISO}T00:00:00`);
    const end = new Date(`${todayISO}T00:00:00`);
    for (
      let date = new Date(start);
      date <= end;
      date.setDate(date.getDate() + 1)
    ) {
      result.push(joburgISODate(date));
    }
    return result.reverse();
  }, [currentFortnight.startISO, todayISO]);
  const [dateISO, setDateISO] = useState(todayISO);
  const [deletingScanId, setDeletingScanId] = useState<string | null>(null);

  // Transfer modal state
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] =
    useState<SiteScanTodayDto | null>(null);
  const [destinationSiteId, setDestinationSiteId] = useState<string | null>(
    null,
  );
  const [transferReason, setTransferReason] = useState("");
  const [transferring, setTransferring] = useState(false);

  // Site picker state (destination site modal)
  const [sitePickerOpen, setSitePickerOpen] = useState(false);
  const [siteSearch, setSiteSearch] = useState("");

  // Source site search (main screen)
  const [sourceSiteSearch, setSourceSiteSearch] = useState("");

  // Employee search (main screen)
  const [employeeSearch, setEmployeeSearch] = useState("");

  // Foreman picker state
  const [foremanPickerOpen, setForemanPickerOpen] = useState(false);
  const [destForemen, setDestForemen] = useState<SiteForemanDto[]>([]);
  const [selectedForemanId, setSelectedForemanId] = useState<string | null>(
    null,
  );
  const [loadingForemen, setLoadingForemen] = useState(false);

  // Load supervisor's sites (always sort by job number DESC), plus a second,
  // separate fetch scoped to the selected work date — the backend only
  // returns sites that have at least one attendance scan on that date, used
  // for the Source Site row.
  const loadSites = useCallback(async () => {
    try {
      const [allRes, scannedRes] = await Promise.all([
        apiSupervisorSites({ show: "active" }),
        apiSupervisorSites({ show: "active", dateISO }),
      ]);

      const list = Array.isArray(allRes.sites) ? allRes.sites : [];
      const sorted = [...list].sort(
        (a, b) =>
          jobNumberToNumber((b as any).code) -
          jobNumberToNumber((a as any).code),
      );
      setSites(sorted);

      const scannedList = Array.isArray(scannedRes.sites)
        ? scannedRes.sites
        : [];
      setSitesWithScans(
        [...scannedList].sort(
          (a, b) =>
            jobNumberToNumber((b as any).code) -
            jobNumberToNumber((a as any).code),
        ),
      );

      if (!selectedSiteId && sorted.length > 0) {
        setSelectedSiteId(sorted[0].id);
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to load sites");
    }
  }, [selectedSiteId, dateISO]);

  // Load scans for the selected site
  const loadScans = useCallback(async () => {
    if (!selectedSiteId) return;
    try {
      const res = await apiSupervisorSiteScansToday(selectedSiteId, dateISO);
      setScans(res.scans ?? []);
      setScannedInCount(res.scannedInCount ?? 0);
      setScannedOutCount(res.scannedOutCount ?? 0);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load scans");
      setScans([]);
    }
  }, [dateISO, selectedSiteId]);

  const refresh = useCallback(
    async (mode: "load" | "refresh" = "load") => {
      if (mode === "load") setLoading(true);
      if (mode === "refresh") setRefreshing(true);
      setError(null);
      try {
        await loadSites();
        await loadScans();
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [loadSites, loadScans],
  );

  useFocusEffect(
    useCallback(() => {
      refresh("load");
    }, [refresh]),
  );

  // Refetch scans (and each site's scan count for the date, so the Source
  // Site list can filter to sites with attendance) when the site or date
  // changes — avoids reloading the full screen.
  React.useEffect(() => {
    if (!selectedSiteId) return;
    if (loading) return; // don’t interfere with the initial "load" refresh

    let alive = true;

    (async () => {
      try {
        setRefreshing(true);
        setError(null);
        await Promise.all([loadScans(), loadSites()]);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? "Failed to load scans");
      } finally {
        if (!alive) return;
        setRefreshing(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [selectedSiteId, dateISO, loadScans, loadSites, loading]);

  // Filter scans: show only scanned-in employees (not yet scanned out)
  const transferableScans = useMemo(
    () => scans.filter((s) => !s.isScannedOut),
    [scans],
  );

  // Available destination sites (exclude current site)
  const destinationSites = useMemo(() => {
    const filtered = sites.filter((s) => s.id !== selectedSiteId);
    if (!siteSearch.trim()) return filtered;
    const q = siteSearch.toLowerCase();
    return filtered.filter((s) => s.name.toLowerCase().includes(q));
  }, [sites, selectedSiteId, siteSearch]);

  // Source site search (main screen) — only list sites that have attendance
  // scans on the selected work date, so there's nothing to move/delete for
  // sites shown here. Destination pickers (below) intentionally show all sites.
  const sourceSites = useMemo(() => {
    const q = sourceSiteSearch.trim().toLowerCase();
    if (!q) return sitesWithScans;
    return sitesWithScans.filter((s) => s.name.toLowerCase().includes(q));
  }, [sitesWithScans, sourceSiteSearch]);

  const employeeSearchNorm = useMemo(
    () => employeeSearch.trim().toLowerCase(),
    [employeeSearch],
  );

  const filteredTransferableScans = useMemo(() => {
    if (!employeeSearchNorm) return transferableScans;
    return transferableScans.filter((s) => {
      const n = s.employeeName?.toLowerCase?.() ?? "";
      const c = s.employeeCode?.toLowerCase?.() ?? "";
      return n.includes(employeeSearchNorm) || c.includes(employeeSearchNorm);
    });
  }, [transferableScans, employeeSearchNorm]);

  const filteredScannedOut = useMemo(() => {
    if (!employeeSearchNorm) return scans.filter((s) => s.isScannedOut);
    return scans.filter((s) => {
      if (!s.isScannedOut) return false;
      const n = s.employeeName?.toLowerCase?.() ?? "";
      const c = s.employeeCode?.toLowerCase?.() ?? "";
      return n.includes(employeeSearchNorm) || c.includes(employeeSearchNorm);
    });
  }, [scans, employeeSearchNorm]);

  const selectedSiteName = useMemo(() => {
    return sites.find((s) => s.id === selectedSiteId)?.name ?? "Select site";
  }, [sites, selectedSiteId]);

  const destinationSiteName = useMemo(() => {
    return sites.find((s) => s.id === destinationSiteId)?.name ?? null;
  }, [sites, destinationSiteId]);

  const selectedForemanName = useMemo(() => {
    return destForemen.find((f) => f.id === selectedForemanId)?.name ?? null;
  }, [destForemen, selectedForemanId]);

  // Load foremen when destination site changes
  const loadDestForemen = useCallback(
    async (siteId: string) => {
      setLoadingForemen(true);
      setSelectedForemanId(null);
      setDestForemen([]);
      try {
        const res = await apiSupervisorSiteScansToday(siteId, dateISO);
        const foremen = res.foremen ?? [];
        setDestForemen(foremen);
        // Auto-select if only one foreman
        if (foremen.length === 1) {
          setSelectedForemanId(foremen[0].id);
        }
      } catch {
        setDestForemen([]);
      } finally {
        setLoadingForemen(false);
      }
    },
    [dateISO],
  );

  // Open transfer modal for a specific employee
  const openTransferModal = useCallback((scan: SiteScanTodayDto) => {
    setSelectedEmployee(scan);
    setDestinationSiteId(null);
    setSelectedForemanId(null);
    setDestForemen([]);
    setTransferReason("");
    setTransferModalOpen(true);
  }, []);

  // Perform the transfer
  const doTransfer = useCallback(async () => {
    if (
      !selectedEmployee ||
      !destinationSiteId ||
      !selectedSiteId ||
      !selectedForemanId
    )
      return;

    setTransferring(true);
    setError(null);

    try {
      const res = await apiTransferEmployee({
        employeeId: selectedEmployee.employeeId,
        fromSiteId: selectedSiteId,
        toSiteId: destinationSiteId,
        toForemanId: selectedForemanId,
        workDateISO: dateISO,
        reason: transferReason.trim() || undefined,
      });

      Alert.alert("Move Successful", res.message);
      setTransferModalOpen(false);
      setSelectedEmployee(null);

      // Refresh scans
      await loadScans();
    } catch (e: any) {
      Alert.alert("Move Failed", e?.message ?? "Unknown error");
    } finally {
      setTransferring(false);
    }
  }, [
    selectedEmployee,
    destinationSiteId,
    selectedSiteId,
    selectedForemanId,
    transferReason,
    dateISO,
    loadScans,
  ]);

  const deleteScan = useCallback(
    (scan: SiteScanTodayDto) => {
      Alert.alert(
        "Delete attendance?",
        `Remove ${scan.employeeName} from ${selectedSiteName} on ${prettyWorkDate(dateISO)}?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              setDeletingScanId(scan.id);
              try {
                await apiDeleteScan(scan.id);
                await loadScans();
              } catch (e: any) {
                Alert.alert(
                  "Delete Failed",
                  e?.message ?? "Unable to delete attendance.",
                );
              } finally {
                setDeletingScanId(null);
              }
            },
          },
        ],
      );
    },
    [dateISO, loadScans, selectedSiteName],
  );

  if (loading) {
    return (
      <AuthStyleBackground>
        <LoadingOverlay
          icon="🔄"
          title="Loading..."
          message="Fetching site attendance data"
        />
      </AuthStyleBackground>
    );
  }

  return (
    <AuthStyleBackground>
      <ScrollView
        contentContainerStyle={styles.wrap}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => refresh("refresh")}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <GlassCard style={{ padding: 16 }}>
          <View style={styles.headerRow}>
            <Pressable style={styles.pill} onPress={() => router.back()}>
              <Text style={styles.pillTxt}>← Back</Text>
            </Pressable>
            <Text style={[styles.h1, { color: colors.textPrimary }]}>
              Adjust Attendance
            </Text>
          </View>
          <Text
            style={[styles.sub, { color: colors.textSecondary, marginTop: 8 }]}
          >
            Move or remove attendance entered on the wrong site.
          </Text>
        </GlassCard>

        {/* Site Selector */}
        <GlassCard style={{ padding: 16, marginTop: 12 }}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            Work Date
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.row}>
              {workDateOptions.map((workDate) => {
                const active = workDate === dateISO;
                return (
                  <TouchableOpacity
                    key={workDate}
                    style={[styles.siteBtn, active && styles.siteBtnActive]}
                    onPress={() => setDateISO(workDate)}
                  >
                    <Text
                      style={[
                        styles.siteBtnText,
                        active && styles.siteBtnTextActive,
                      ]}
                    >
                      {prettyWorkDate(workDate)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            Source Site
          </Text>

          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={colors.textSecondary} />
            <TextInput
              value={sourceSiteSearch}
              onChangeText={setSourceSiteSearch}
              placeholder="Search sites..."
              placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
              style={[styles.searchInput, { color: colors.textPrimary }]}
              autoCapitalize="none"
            />
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.row}>
              {sourceSites.map((s) => {
                const active = s.id === selectedSiteId;
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.siteBtn, active && styles.siteBtnActive]}
                    onPress={() => {
                      setSelectedSiteId(s.id);
                    }}
                  >
                    <Text
                      style={[
                        styles.siteBtnText,
                        active && styles.siteBtnTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {s.code} - {s.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </GlassCard>

        {error ? (
          <GlassCard style={{ padding: 16, marginTop: 12 }}>
            <Text style={{ color: "#ef4444", fontWeight: "900" }}>{error}</Text>
          </GlassCard>
        ) : null}

        {/* Stats */}
        <GlassCard style={{ padding: 16, marginTop: 12 }}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            Attendance - {prettyWorkDate(dateISO)} - {selectedSiteName}
          </Text>
          <View style={styles.statsRow}>
            <View style={styles.statBadge}>
              <Text style={[styles.statValue, { color: colors.success }]}>
                {scannedInCount}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                Scanned In
              </Text>
            </View>
            <View style={styles.statBadge}>
              <Text style={[styles.statValue, { color: colors.textSecondary }]}>
                {scannedOutCount}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                Scanned Out
              </Text>
            </View>
            <View style={styles.statBadge}>
              <Text style={[styles.statValue, { color: colors.accent }]}>
                {scans.length}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                Total
              </Text>
            </View>
          </View>
        </GlassCard>

        {/* Employee List */}
        <GlassCard style={{ padding: 16, marginTop: 12 }}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            People on Site ({filteredTransferableScans.length})
          </Text>

          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={colors.textSecondary} />
            <TextInput
              value={employeeSearch}
              onChangeText={setEmployeeSearch}
              placeholder="Search team..."
              placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
              style={[styles.searchInput, { color: colors.textPrimary }]}
              autoCapitalize="none"
            />
          </View>

          <Text
            style={[
              styles.sub,
              { color: colors.textSecondary, marginBottom: 8, marginTop: 8 },
            ]}
          >
            Move a person to the correct site or delete an incorrect entry.
          </Text>

          {filteredTransferableScans.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons
                name="people-outline"
                size={48}
                color={isDark ? "#475569" : "#cbd5e1"}
              />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                {employeeSearch.trim()
                  ? "No team members match your search."
                  : "No one currently scanned in at this site."}
              </Text>
            </View>
          ) : (
            filteredTransferableScans.map((scan) => (
              <View
                key={scan.id}
                style={[
                  styles.employeeRow,
                  { borderBottomColor: colors.border },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.employeeName, { color: colors.textPrimary }]}
                  >
                    {scan.employeeName}
                  </Text>
                  <Text
                    style={[
                      styles.employeeMeta,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {scan.employeeCode} • In: {formatTime(scan.scannedAt)}
                  </Text>
                  {scan.isTransferred && (
                    <Text style={styles.transferBadge}>↗ Transferred here</Text>
                  )}
                </View>
                <View style={styles.rowActions}>
                  <TouchableOpacity
                    style={styles.transferBtn}
                    onPress={() => openTransferModal(scan)}
                  >
                    <Ionicons name="swap-horizontal" size={18} color="#fff" />
                    <Text style={styles.transferBtnText}>Move</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    disabled={deletingScanId === scan.id}
                    onPress={() => deleteScan(scan)}
                  >
                    {deletingScanId === scan.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Ionicons name="trash-outline" size={18} color="#fff" />
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}

          {/* Show scanned-out employees separately */}
          {filteredScannedOut.length > 0 && (
            <>
              <Text
                style={[
                  styles.sectionTitle,
                  { color: colors.textSecondary, marginTop: 20 },
                ]}
              >
                Scanned Out ({filteredScannedOut.length})
              </Text>
              {filteredScannedOut.map((scan) => (
                <View
                  key={scan.id}
                  style={[
                    styles.employeeRow,
                    { borderBottomColor: colors.border },
                  ]}
                >
                  <View style={{ flex: 1, opacity: 0.6 }}>
                    <Text
                      style={[
                        styles.employeeName,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {scan.employeeName}
                    </Text>
                    <Text
                      style={[
                        styles.employeeMeta,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {scan.employeeCode} • In: {formatTime(scan.scannedAt)}
                      {scan.scannedOutAt
                        ? ` • Out: ${formatTime(scan.scannedOutAt)}`
                        : ""}
                    </Text>
                  </View>
                  <View style={styles.rowActions}>
                    <View style={styles.outBadge}>
                      <Text style={styles.outBadgeText}>OUT</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.transferBtn}
                      onPress={() => openTransferModal(scan)}
                    >
                      <Ionicons name="swap-horizontal" size={18} color="#fff" />
                      <Text style={styles.transferBtnText}>Move</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      disabled={deletingScanId === scan.id}
                      onPress={() => deleteScan(scan)}
                    >
                      {deletingScanId === scan.id ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Ionicons name="trash-outline" size={18} color="#fff" />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </>
          )}
        </GlassCard>
      </ScrollView>

      {/* Transfer Modal */}
      <Modal
        visible={transferModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setTransferModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <GlassCard
            style={{
              padding: 20,
              width: "92%",
              maxWidth: 400,
              maxHeight: "80%",
              backgroundColor: isDark
                ? "rgba(15,23,42,0.97)"
                : "rgba(255,255,255,0.97)",
            }}
          >
            <Text style={[styles.h1, { color: colors.textPrimary }]}>
              Move Attendance
            </Text>

            {selectedEmployee && (
              <View style={styles.selectedEmployeeCard}>
                <Text
                  style={[
                    styles.employeeName,
                    { color: colors.textPrimary, fontSize: 16 },
                  ]}
                >
                  {selectedEmployee.employeeName}
                </Text>
                <Text
                  style={[styles.employeeMeta, { color: colors.textSecondary }]}
                >
                  {selectedEmployee.employeeCode} • Scanned in:{" "}
                  {formatTime(selectedEmployee.scannedAt)}
                </Text>
              </View>
            )}

            <Text
              style={[
                styles.label,
                { color: colors.textSecondary, marginTop: 16 },
              ]}
            >
              From: {selectedSiteName} - {prettyWorkDate(dateISO)}
            </Text>

            <Text
              style={[
                styles.label,
                { color: colors.textSecondary, marginTop: 12 },
              ]}
            >
              Move to:
            </Text>

            {/* Destination site picker */}
            <TouchableOpacity
              style={[
                styles.sitePicker,
                {
                  borderColor: colors.border,
                  backgroundColor: isDark
                    ? "rgba(30,41,59,0.9)"
                    : "rgba(241,245,249,0.95)",
                },
              ]}
              onPress={() => setSitePickerOpen(true)}
            >
              <Text
                style={{
                  color: destinationSiteName
                    ? colors.textPrimary
                    : colors.textSecondary,
                  fontWeight: "700",
                }}
              >
                {destinationSiteName ?? "Select destination site..."}
              </Text>
              <Ionicons
                name="chevron-down"
                size={18}
                color={colors.textSecondary}
              />
            </TouchableOpacity>

            {/* Foreman picker */}
            {destinationSiteId && (
              <>
                <Text
                  style={[
                    styles.label,
                    { color: colors.textSecondary, marginTop: 12 },
                  ]}
                >
                  Foreman:
                </Text>
                {loadingForemen ? (
                  <View style={{ padding: 12, alignItems: "center" }}>
                    <ActivityIndicator size="small" color={colors.accent} />
                    <Text
                      style={[
                        styles.sub,
                        { color: colors.textSecondary, marginTop: 6 },
                      ]}
                    >
                      Loading foremen...
                    </Text>
                  </View>
                ) : destForemen.length === 0 ? (
                  <View style={{ padding: 12 }}>
                    <Text style={[styles.sub, { color: colors.danger }]}>
                      No foremen assigned to this site
                    </Text>
                  </View>
                ) : destForemen.length === 1 ? (
                  <View
                    style={[
                      styles.sitePicker,
                      {
                        borderColor: colors.accent,
                        backgroundColor: isDark
                          ? "rgba(59,130,246,0.15)"
                          : "rgba(59,130,246,0.08)",
                        marginTop: 6,
                      },
                    ]}
                  >
                    <Text
                      style={{ color: colors.textPrimary, fontWeight: "700" }}
                    >
                      {destForemen[0].name} (auto-selected)
                    </Text>
                    <Ionicons
                      name="checkmark"
                      size={18}
                      color={colors.accent}
                    />
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[
                      styles.sitePicker,
                      {
                        borderColor: colors.border,
                        backgroundColor: isDark
                          ? "rgba(30,41,59,0.9)"
                          : "rgba(241,245,249,0.95)",
                        marginTop: 6,
                      },
                    ]}
                    onPress={() => setForemanPickerOpen(true)}
                  >
                    <Text
                      style={{
                        color: selectedForemanName
                          ? colors.textPrimary
                          : colors.textSecondary,
                        fontWeight: "700",
                      }}
                    >
                      {selectedForemanName ?? "Select foreman..."}
                    </Text>
                    <Ionicons
                      name="chevron-down"
                      size={18}
                      color={colors.textSecondary}
                    />
                  </TouchableOpacity>
                )}
              </>
            )}

            {/* Reason input */}
            <Text
              style={[
                styles.label,
                { color: colors.textSecondary, marginTop: 12 },
              ]}
            >
              Reason (optional):
            </Text>
            <TextInput
              value={transferReason}
              onChangeText={setTransferReason}
              placeholder="e.g. Site needs more people"
              placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
              style={[
                styles.reasonInput,
                {
                  color: colors.textPrimary,
                  borderColor: colors.border,
                  backgroundColor: isDark
                    ? "rgba(30,41,59,0.9)"
                    : "rgba(241,245,249,0.95)",
                },
              ]}
              multiline
              numberOfLines={2}
            />

            {/* Actions */}
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.cancelBtn]}
                onPress={() => setTransferModalOpen(false)}
                disabled={transferring}
              >
                <Text
                  style={[
                    styles.cancelBtnText,
                    { color: colors.textSecondary },
                  ]}
                >
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.confirmBtn,
                  (!destinationSiteId ||
                    !selectedForemanId ||
                    transferring) && { opacity: 0.5 },
                ]}
                onPress={doTransfer}
                disabled={
                  !destinationSiteId || !selectedForemanId || transferring
                }
              >
                {transferring ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.confirmBtnText}>Confirm Move</Text>
                )}
              </Pressable>
            </View>
          </GlassCard>
        </View>

        {/* Nested site picker modal */}
        <Modal
          visible={sitePickerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setSitePickerOpen(false)}
        >
          <View style={styles.modalBackdrop}>
            <GlassCard
              style={{
                padding: 16,
                width: "92%",
                maxWidth: 400,
                maxHeight: "70%",
                backgroundColor: isDark
                  ? "rgba(15,23,42,0.97)"
                  : "rgba(255,255,255,0.97)",
              }}
            >
              <Text style={[styles.h1, { color: colors.textPrimary }]}>
                Select Destination Site
              </Text>

              <View
                style={[
                  styles.searchBox,
                  {
                    borderColor: colors.border,
                    backgroundColor: isDark
                      ? "rgba(30,41,59,0.9)"
                      : "rgba(241,245,249,0.95)",
                  },
                ]}
              >
                <Ionicons
                  name="search"
                  size={18}
                  color={colors.textSecondary}
                />
                <TextInput
                  value={siteSearch}
                  onChangeText={setSiteSearch}
                  placeholder="Search sites..."
                  placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                  style={[styles.searchInput, { color: colors.textPrimary }]}
                  autoCapitalize="none"
                />
              </View>

              <FlatList
                data={destinationSites}
                keyExtractor={(item) => item.id}
                style={{ maxHeight: 300, marginTop: 8 }}
                renderItem={({ item }) => {
                  const isSelected = item.id === destinationSiteId;
                  return (
                    <TouchableOpacity
                      style={[
                        styles.siteOption,
                        {
                          backgroundColor: isSelected
                            ? isDark
                              ? "rgba(59,130,246,0.2)"
                              : "rgba(59,130,246,0.1)"
                            : isDark
                              ? "rgba(30,41,59,0.9)"
                              : "rgba(241,245,249,0.95)",
                          borderColor: isSelected ? "#22c55e" : colors.border,
                        },
                      ]}
                      onPress={() => {
                        setDestinationSiteId(item.id);
                        setSitePickerOpen(false);
                        setSiteSearch("");
                        loadDestForemen(item.id);
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.siteOptionText,
                            { color: colors.textPrimary },
                          ]}
                          numberOfLines={1}
                        >
                          {item.code
                            ? `${item.code} - ${item.name}`
                            : item.name}
                        </Text>
                      </View>
                      {isSelected && (
                        <Ionicons name="checkmark" size={20} color="#22c55e" />
                      )}
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  <View style={{ padding: 20, alignItems: "center" }}>
                    <Text style={{ color: colors.textSecondary }}>
                      No other sites available
                    </Text>
                  </View>
                }
              />

              <TouchableOpacity
                style={[
                  styles.cancelBtn,
                  { marginTop: 12, alignSelf: "center" },
                ]}
                onPress={() => {
                  setSitePickerOpen(false);
                  setSiteSearch("");
                }}
              >
                <Text
                  style={[
                    styles.cancelBtnText,
                    { color: colors.textSecondary },
                  ]}
                >
                  Close
                </Text>
              </TouchableOpacity>
            </GlassCard>
          </View>
        </Modal>

        {/* Nested foreman picker modal */}
        <Modal
          visible={foremanPickerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setForemanPickerOpen(false)}
        >
          <View style={styles.modalBackdrop}>
            <GlassCard
              style={{
                padding: 16,
                width: "92%",
                maxWidth: 400,
                maxHeight: "60%",
                backgroundColor: isDark
                  ? "rgba(15,23,42,0.97)"
                  : "rgba(255,255,255,0.97)",
              }}
            >
              <Text style={[styles.h1, { color: colors.textPrimary }]}>
                Select Foreman
              </Text>

              <FlatList
                data={destForemen}
                keyExtractor={(item) => item.id}
                style={{ maxHeight: 300, marginTop: 12 }}
                renderItem={({ item }) => {
                  const isSelected = item.id === selectedForemanId;
                  return (
                    <TouchableOpacity
                      style={[
                        styles.siteOption,
                        {
                          backgroundColor: isSelected
                            ? isDark
                              ? "rgba(59,130,246,0.2)"
                              : "rgba(59,130,246,0.1)"
                            : isDark
                              ? "rgba(30,41,59,0.9)"
                              : "rgba(241,245,249,0.95)",
                          borderColor: isSelected ? "#22c55e" : colors.border,
                        },
                      ]}
                      onPress={() => {
                        setSelectedForemanId(item.id);
                        setForemanPickerOpen(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.siteOptionText,
                          { color: colors.textPrimary },
                        ]}
                      >
                        {item.name}
                      </Text>
                      {isSelected && (
                        <Ionicons name="checkmark" size={20} color="#22c55e" />
                      )}
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  <View style={{ padding: 20, alignItems: "center" }}>
                    <Text style={{ color: colors.textSecondary }}>
                      No foremen available
                    </Text>
                  </View>
                }
              />

              <TouchableOpacity
                style={[
                  styles.cancelBtn,
                  { marginTop: 12, alignSelf: "center" },
                ]}
                onPress={() => setForemanPickerOpen(false)}
              >
                <Text
                  style={[
                    styles.cancelBtnText,
                    { color: colors.textSecondary },
                  ]}
                >
                  Close
                </Text>
              </TouchableOpacity>
            </GlassCard>
          </View>
        </Modal>
      </Modal>
    </AuthStyleBackground>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16 },
  h1: { fontSize: 18, fontWeight: "900" },
  sub: { fontSize: 13, fontWeight: "700" },
  label: { fontSize: 13, fontWeight: "800" },
  sectionTitle: { fontSize: 16, fontWeight: "900" },

  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: "black",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.6)",
  },
  pillTxt: { fontWeight: "900", color: "#fff" },

  row: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
    paddingBottom: 4,
  },
  siteBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.06)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  siteBtnActive: {
    backgroundColor: "#22c55e",
    borderColor: "#22c55e",
  },
  siteBtnText: {
    fontWeight: "800",
    fontSize: 13,
    color: "#666",
  },
  siteBtnTextActive: {
    color: "#fff",
  },

  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  statBadge: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.04)",
    alignItems: "center",
  },
  statValue: {
    fontSize: 20,
    fontWeight: "900",
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },

  employeeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  employeeName: {
    fontSize: 14,
    fontWeight: "900",
  },
  employeeMeta: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  transferBadge: {
    fontSize: 11,
    fontWeight: "800",
    color: "#f59e0b",
    marginTop: 2,
  },

  transferBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: "#22c55e",
  },
  transferBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 13,
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  deleteBtn: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#dc2626",
  },

  outBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: "rgba(100,116,139,0.15)",
  },
  outBadgeText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#64748b",
  },

  emptyState: {
    paddingVertical: 30,
    alignItems: "center",
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },

  selectedEmployeeCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "rgba(59,130,246,0.08)",
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.2)",
  },

  sitePicker: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 6,
  },

  reasonInput: {
    marginTop: 6,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 14,
    minHeight: 50,
    textAlignVertical: "top",
  },

  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  cancelBtnText: {
    fontWeight: "800",
    fontSize: 14,
  },
  confirmBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: "#22c55e",
    alignItems: "center",
  },
  confirmBtnText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 14,
  },

  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
  },

  siteOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 6,
  },
  siteOptionText: {
    fontWeight: "700",
    fontSize: 14,
    flex: 1,
  },
});
