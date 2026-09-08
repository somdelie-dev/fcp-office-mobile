import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
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
  apiSupervisorAllForemen,
  apiSupervisorAssignForemanToSite,
  apiSupervisorEndForemanAssignment,
  apiSupervisorSiteDetail,
  apiSupervisorSiteTotals,
  type ForemanOptionDto,
  type SupervisorSiteDetailDto,
  type SupervisorSiteTotalsDataDto,
} from "@/lib/apiClient";
import { useTheme } from "@/lib/themeContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const themes = {
  dark: {
    textPrimary: "#e5e7eb",
    textSecondary: "#94a3b8",
    metaLabel: "#cbd5e1",
    statusActive: "#4ade80",
    statusInactive: "#f97316",
    totalLabel: "#94a3b8",
    totalValue: "#e5e7eb",
  },
  light: {
    textPrimary: "#111111",
    textSecondary: "#666666",
    metaLabel: "#666666",
    statusActive: "#1a7f37",
    statusInactive: "#b00020",
    totalLabel: "#666666",
    totalValue: "#111111",
  },
} as const;

function formatCurrencyZAR(n?: number | null) {
  const x = Number(n ?? 0);
  if (!Number.isFinite(x)) return "R0.00";
  // Keep it simple and consistent with RN environments
  return `R${x.toFixed(2)}`;
}

function prettyRange(startISO: string, endISO: string) {
  const a = new Date(`${startISO}T00:00:00.000Z`);
  const b = new Date(`${endISO}T00:00:00.000Z`);
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return `${fmt(a)} – ${fmt(b)}`;
}

export default function SupervisorSiteDetailScreen() {
  const router = useRouter();
  const { id, assign } = useLocalSearchParams<{ id: string; assign?: string }>();
  const siteId = String(id ?? "");
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = Dimensions.get("window");

  const { theme } = useTheme();
  const isDark = theme === "dark";
  const colors = themes[theme];

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [data, setData] = useState<SupervisorSiteDetailDto | null>(null);
  const [totals, setTotals] = useState<SupervisorSiteTotalsDataDto | null>(
    null,
  );

  const [error, setError] = useState<string | null>(null);

  const [assignOpen, setAssignOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmEndForemanId, setConfirmEndForemanId] = useState<string | null>(
    null,
  );
  const [confirmEndForemanName, setConfirmEndForemanName] = useState<
    string | null
  >(null);

  // Drawer state
  const [allForemen, setAllForemen] = useState<ForemanOptionDto[]>([]);
  const [foremenLoading, setForemenLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [selectedForemen, setSelectedForemen] = useState<Set<string>>(
    new Set(),
  );
  const drawerAnim = useRef(new Animated.Value(screenHeight)).current;
  const handledAssignOpen = useRef(false);

  // Fetch all foremen when drawer opens
  const fetchAllForemen = useCallback(async () => {
    setForemenLoading(true);
    try {
      const res = await apiSupervisorAllForemen();
      setAllForemen(res.foremen ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load foremen");
    } finally {
      setForemenLoading(false);
    }
  }, []);

  // Open drawer
  const openDrawer = useCallback(() => {
    setAssignOpen(true);
    setSearchText("");
    setSelectedForemen(new Set());
    fetchAllForemen();
    Animated.spring(drawerAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, [drawerAnim, fetchAllForemen]);

  useEffect(() => {
    if (assign === "1" && data && !handledAssignOpen.current) {
      handledAssignOpen.current = true;
      openDrawer();
    }
  }, [assign, data, openDrawer]);

  // Close drawer
  const closeDrawer = useCallback(() => {
    Animated.timing(drawerAnim, {
      toValue: screenHeight,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setAssignOpen(false);
      setSelectedForemen(new Set());
      setSearchText("");
    });
  }, [drawerAnim, screenHeight]);

  // Toggle foreman selection
  const toggleForeman = useCallback((foremanId: string) => {
    setSelectedForemen((prev) => {
      const next = new Set(prev);
      if (next.has(foremanId)) {
        next.delete(foremanId);
      } else {
        next.add(foremanId);
      }
      return next;
    });
  }, []);

  // Filter foremen based on search
  const filteredForemen = useMemo(() => {
    const assignedIds = new Set(
      (data?.assignedForemen ?? []).map((f) => f.foremanId),
    );
    const available = allForemen.filter((f) => !assignedIds.has(f.foremanId));

    if (!searchText.trim()) return available;
    const q = searchText.toLowerCase();
    return available.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        (f.email && f.email.toLowerCase().includes(q)),
    );
  }, [allForemen, searchText, data?.assignedForemen]);

  // Assign selected foremen
  const doAssignSelected = useCallback(async () => {
    if (!siteId || selectedForemen.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      // Assign each selected foreman
      for (const foremanId of selectedForemen) {
        await apiSupervisorAssignForemanToSite({ siteId, foremanId });
      }
      closeDrawer();
      await refresh("refresh");
    } catch (e: any) {
      setError(e?.message ?? "Failed to assign foremen.");
    } finally {
      setBusy(false);
    }
  }, [siteId, selectedForemen, closeDrawer]);

  const refresh = useCallback(
    async (mode: "load" | "refresh" = "load") => {
      if (!siteId) return;

      if (mode === "load") setLoading(true);
      if (mode === "refresh") setRefreshing(true);

      setError(null);

      try {
        // ✅ Load detail + totals in parallel
        const [detailRes, totalsRes] = await Promise.all([
          apiSupervisorSiteDetail(siteId),
          apiSupervisorSiteTotals(siteId),
        ]);

        setData(detailRes);
        // Extract the data wrapper from totals response
        setTotals(totalsRes.data as any);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load site.");
        setData(null);
        setTotals(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [siteId],
  );

  useFocusEffect(
    useCallback(() => {
      refresh("load");
    }, [refresh]),
  );

  const site = data?.site;
  const assignedForemen = useMemo(() => data?.assignedForemen ?? [], [data]);

  // ✅ IMPORTANT: this must be “all foremen” now (not only supervisor-linked)
  // Your server detail route should return availableForemen as ALL foremen not currently assigned to this site,
  // OR simply all foremen (and you can still show “Already assigned”/disable in UI if you want).
  const availableForemen = useMemo(() => data?.availableForemen ?? [], [data]);

  const doAssign = useCallback(
    async (foremanId: string) => {
      if (!siteId) return;
      setBusy(true);
      setError(null);
      try {
        await apiSupervisorAssignForemanToSite({ siteId, foremanId });
        setAssignOpen(false);
        await refresh("refresh");
      } catch (e: any) {
        setError(e?.message ?? "Failed to assign foreman.");
      } finally {
        setBusy(false);
      }
    },
    [siteId, refresh],
  );

  const doEnd = useCallback(
    async (foremanId: string) => {
      if (!siteId) return;
      setBusy(true);
      setError(null);
      try {
        await apiSupervisorEndForemanAssignment({ siteId, foremanId });
        setConfirmEndForemanId(null);
        setConfirmEndForemanName(null);
        await refresh("refresh");
      } catch (e: any) {
        setError(e?.message ?? "Failed to end assignment.");
      } finally {
        setBusy(false);
      }
    },
    [siteId, refresh],
  );

  if (loading) {
    return (
      <AuthStyleBackground>
        <LoadingOverlay
          icon="⏳"
          title="Loading site…"
          message="Please wait while we fetch the site details"
        />
      </AuthStyleBackground>
    );
  }

  if (!data || !site) {
    return (
      <AuthStyleBackground>
        <View style={styles.wrap}>
          <GlassCard style={{ padding: 16, gap: 10 }}>
            <Text style={[styles.h1, { color: colors.textPrimary }]}>
              Site Not Found
            </Text>
            {error ? <Text style={styles.err}>{error}</Text> : null}

            <Pressable style={styles.pill} onPress={() => router.back()}>
              <Text style={styles.pillTxt}>← Back</Text>
            </Pressable>

            <Pressable
              style={[styles.pill, { backgroundColor: "#16A34A" }]}
              onPress={() => refresh("load")}
            >
              <Text style={styles.pillTxt}>Retry</Text>
            </Pressable>
          </GlassCard>
        </View>
      </AuthStyleBackground>
    );
  }

  const period = totals
    ? { startISO: totals.startISO, endISO: totals.endISO }
    : null;
  const t = totals?.totals;

  return (
    <AuthStyleBackground>
      <ScrollView
        contentContainerStyle={styles.wrap}
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

            <Text style={[styles.h1, { color: colors.textPrimary }]}>Site</Text>
          </View>

          <Text style={[styles.siteName, { color: colors.textPrimary }]}>
            {site.name}
          </Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]}>
            {(site.code ? `${site.code} • ` : "") + (site.location ?? "—")}
          </Text>

          <View style={styles.statusRow}>
            <Text style={[styles.metaLabel, { color: colors.metaLabel }]}>
              Status:
            </Text>
            <Text
              style={[
                styles.status,
                {
                  color: site.isActive
                    ? colors.statusActive
                    : colors.statusInactive,
                },
              ]}
            >
              {site.isActive ? "ACTIVE" : "INACTIVE"}
            </Text>
          </View>

          {error ? <Text style={styles.err}>{error}</Text> : null}

          {/* Transfer Employee button */}
          <Pressable
            style={[
              styles.actionBtn,
              { marginTop: 12, alignSelf: "stretch", alignItems: "center" },
            ]}
            onPress={() =>
              router.push({
                pathname: "/(supervisor-stack)/transfer-employee",
                params: { siteId },
              })
            }
          >
            <Text style={styles.actionTxt}>↔ Transfer Guy</Text>
          </Pressable>
        </GlassCard>

        {/* ✅ Totals / Wages */}
        <GlassCard style={{ padding: 16, marginTop: 12 }}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              Current Fortnight Totals
            </Text>
          </View>

          {period ? (
            <Text style={[styles.small, { marginTop: 6 }]}>
              Period: {prettyRange(period.startISO, period.endISO)} (Sat–Fri)
            </Text>
          ) : (
            <Text style={[styles.small, { marginTop: 6 }]}>Period: —</Text>
          )}

          <View style={styles.totalsGrid}>
            <View style={styles.totalTile}>
              <Text style={[styles.totalLabel, { color: colors.totalLabel }]}>
                Total Wages
              </Text>
              <Text style={[styles.totalValue, { color: colors.totalValue }]}>
                {formatCurrencyZAR(t?.totalWages)}
              </Text>
            </View>

            <View style={styles.totalTile}>
              <Text style={[styles.totalLabel, { color: colors.totalLabel }]}>
                Team Days
              </Text>
              <Text style={[styles.totalValue, { color: colors.totalValue }]}>
                {Number(t?.totalDays ?? 0)}
              </Text>
            </View>
          </View>

          <Pressable
            disabled={refreshing}
            style={[
              styles.actionBtn,
              { marginTop: 12 },
              refreshing && { opacity: 0.6 },
            ]}
            onPress={() => refresh("refresh")}
          >
            <Text style={styles.actionTxt}>Refresh Totals</Text>
          </Pressable>
        </GlassCard>

        {/* Assigned foremen */}
        <GlassCard style={{ padding: 16, marginTop: 12 }}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              Assigned Foremen
            </Text>

            <Pressable
              disabled={busy}
              style={[styles.actionBtn, busy && { opacity: 0.6 }]}
              onPress={openDrawer}
            >
              <Text style={styles.actionTxt}>+ Assign</Text>
            </Pressable>
          </View>

          {assignedForemen.length === 0 ? (
            <Text style={[styles.sub, { color: colors.textSecondary }]}>
              No foremen assigned to this site.
            </Text>
          ) : (
            <View style={{ marginTop: 6 }}>
              {assignedForemen.map((f, index) => (
                <View
                  key={f.foremanId ?? f.userId ?? `assigned-${index}`}
                  style={styles.foremanRow}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.foremanName,
                        { color: colors.textPrimary },
                      ]}
                    >
                      {f.name}
                    </Text>
                    <Text style={styles.small}>
                      Since: {new Date(f.startsOn).toLocaleDateString()}
                    </Text>
                    {f.email ? (
                      <Text style={styles.small}>{f.email}</Text>
                    ) : null}
                  </View>

                  <Pressable
                    disabled={busy}
                    style={[styles.dangerBtn, busy && { opacity: 0.6 }]}
                    onPress={() => {
                      setConfirmEndForemanId(f.foremanId);
                      setConfirmEndForemanName(f.name);
                    }}
                  >
                    <Text style={styles.dangerTxt}>End</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </GlassCard>

        {/* Assign Foremen Bottom Drawer */}
        <Modal
          visible={assignOpen}
          transparent
          animationType="none"
          onRequestClose={closeDrawer}
        >
          <View style={styles.drawerOverlay}>
            <Pressable style={styles.drawerBackdrop} onPress={closeDrawer} />
            <Animated.View
              style={[
                styles.drawerContainer,
                {
                  transform: [{ translateY: drawerAnim }],
                  paddingBottom: insets.bottom + 20,
                },
              ]}
            >
              {/* Drawer Handle */}
              <View style={styles.drawerHandle}>
                <View
                  style={[
                    styles.drawerHandleBar,
                    { backgroundColor: isDark ? "#475569" : "#cbd5e1" },
                  ]}
                />
              </View>

              {/* Drawer Header */}
              <View style={styles.drawerHeader}>
                <Text
                  style={[
                    styles.drawerTitle,
                    { color: isDark ? "#e5e7eb" : "#111827" },
                  ]}
                >
                  Assign Foremen
                </Text>
                <TouchableOpacity onPress={closeDrawer} style={styles.closeBtn}>
                  <Ionicons
                    name="close"
                    size={24}
                    color={isDark ? "#94a3b8" : "#64748b"}
                  />
                </TouchableOpacity>
              </View>

              {/* Search Input */}
              <View
                style={[
                  styles.searchContainer,
                  {
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.08)"
                      : "rgba(0,0,0,0.04)",
                    borderColor: isDark ? "#334155" : "#e2e8f0",
                  },
                ]}
              >
                <Ionicons
                  name="search"
                  size={18}
                  color={isDark ? "#94a3b8" : "#64748b"}
                />
                <TextInput
                  value={searchText}
                  onChangeText={setSearchText}
                  placeholder="Search foremen..."
                  placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                  style={[
                    styles.searchInput,
                    { color: isDark ? "#e5e7eb" : "#111827" },
                  ]}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {searchText.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchText("")}>
                    <Ionicons
                      name="close-circle"
                      size={18}
                      color={isDark ? "#94a3b8" : "#64748b"}
                    />
                  </TouchableOpacity>
                )}
              </View>

              {/* Selected Count */}
              {selectedForemen.size > 0 && (
                <View style={styles.selectedBanner}>
                  <Text style={styles.selectedText}>
                    {selectedForemen.size} foreman
                    {selectedForemen.size > 1 ? "en" : ""} selected
                  </Text>
                </View>
              )}

              {/* Foremen List */}
              <ScrollView
                style={styles.drawerScroll}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {foremenLoading ? (
                  <View style={styles.loadingContainer}>
                    <Text
                      style={{
                        color: isDark ? "#94a3b8" : "#64748b",
                        fontWeight: "600",
                      }}
                    >
                      Loading foremen...
                    </Text>
                  </View>
                ) : filteredForemen.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Ionicons
                      name="people-outline"
                      size={48}
                      color={isDark ? "#475569" : "#cbd5e1"}
                    />
                    <Text
                      style={{
                        color: isDark ? "#94a3b8" : "#64748b",
                        fontWeight: "600",
                        marginTop: 12,
                        textAlign: "center",
                      }}
                    >
                      {searchText
                        ? "No foremen match your search"
                        : "No foremen available to assign"}
                    </Text>
                  </View>
                ) : (
                  filteredForemen.map((f) => {
                    const isSelected = selectedForemen.has(f.foremanId);
                    return (
                      <TouchableOpacity
                        key={f.foremanId}
                        activeOpacity={0.7}
                        onPress={() => toggleForeman(f.foremanId)}
                        style={[
                          styles.foremanItem,
                          {
                            backgroundColor: isSelected
                              ? isDark
                                ? "rgba(59,130,246,0.2)"
                                : "rgba(59,130,246,0.1)"
                              : isDark
                                ? "rgba(255,255,255,0.04)"
                                : "rgba(0,0,0,0.02)",
                            borderColor: isSelected
                              ? "#22c55e"
                              : isDark
                                ? "#334155"
                                : "#e2e8f0",
                          },
                        ]}
                      >
                        <View style={styles.foremanInfo}>
                          <View
                            style={[
                              styles.foremanAvatar,
                              {
                                backgroundColor: isDark
                                  ? "rgba(59,130,246,0.3)"
                                  : "rgba(59,130,246,0.15)",
                              },
                            ]}
                          >
                            <Text style={styles.foremanAvatarText}>
                              {f.name
                                .split(" ")
                                .map((n) => n[0])
                                .join("")
                                .slice(0, 2)
                                .toUpperCase()}
                            </Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text
                              style={[
                                styles.foremanItemName,
                                { color: isDark ? "#e5e7eb" : "#111827" },
                              ]}
                            >
                              {f.name}
                            </Text>
                            {f.email && (
                              <Text
                                style={[
                                  styles.foremanItemEmail,
                                  { color: isDark ? "#94a3b8" : "#64748b" },
                                ]}
                              >
                                {f.email}
                              </Text>
                            )}
                          </View>
                        </View>
                        <View
                          style={[
                            styles.checkbox,
                            {
                              backgroundColor: isSelected
                                ? "#22c55e"
                                : "transparent",
                              borderColor: isSelected
                                ? "#22c55e"
                                : isDark
                                  ? "#475569"
                                  : "#cbd5e1",
                            },
                          ]}
                        >
                          {isSelected && (
                            <Ionicons name="checkmark" size={16} color="#fff" />
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>

              {/* Assign Button */}
              <View style={styles.drawerFooter}>
                <TouchableOpacity
                  disabled={selectedForemen.size === 0 || busy}
                  onPress={doAssignSelected}
                  style={[
                    styles.assignButton,
                    {
                      backgroundColor:
                        selectedForemen.size === 0 ? "#94a3b8" : "#22c55e",
                      opacity: busy ? 0.6 : 1,
                    },
                  ]}
                >
                  <Text style={styles.assignButtonText}>
                    {busy
                      ? "Assigning..."
                      : `Assign ${selectedForemen.size > 0 ? `(${selectedForemen.size})` : ""}`}
                  </Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </View>
        </Modal>

        {/* Confirm end foreman assignment modal */}
        <Modal
          visible={confirmEndForemanId !== null}
          transparent
          animationType="fade"
          onRequestClose={() => {
            setConfirmEndForemanId(null);
            setConfirmEndForemanName(null);
          }}
        >
          <View style={styles.modalBackdrop}>
            <GlassCard style={{ padding: 16, width: "92%", maxWidth: 340 }}>
              <Text style={[styles.h1, { color: colors.textPrimary }]}>
                End Assignment?
              </Text>
              <Text style={[styles.sub, { marginTop: 8 }]}>
                Are you sure you want to end the assignment for{" "}
                <Text style={{ fontWeight: "900" }}>
                  {confirmEndForemanName}
                </Text>
                ?
              </Text>
              <Text style={[styles.small, { marginTop: 8, color: "#999" }]}>
                This action cannot be undone.
              </Text>

              <View
                style={{
                  flexDirection: "row",
                  gap: 8,
                  marginTop: 16,
                }}
              >
                <Pressable
                  disabled={busy}
                  style={[
                    styles.actionBtn,
                    { flex: 1 },
                    busy && { opacity: 0.6 },
                  ]}
                  onPress={() => {
                    setConfirmEndForemanId(null);
                    setConfirmEndForemanName(null);
                  }}
                >
                  <Text style={styles.actionTxt}>Cancel</Text>
                </Pressable>

                <Pressable
                  disabled={busy}
                  style={[
                    styles.dangerBtn,
                    { flex: 1, alignItems: "center", justifyContent: "center" },
                    busy && { opacity: 0.6 },
                  ]}
                  onPress={() => {
                    if (confirmEndForemanId) {
                      doEnd(confirmEndForemanId);
                    }
                  }}
                >
                  <Text style={styles.dangerTxt} numberOfLines={1}>
                    End Assignment
                  </Text>
                </Pressable>
              </View>
            </GlassCard>
          </View>
        </Modal>
      </ScrollView>
    </AuthStyleBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  wrap: { padding: 16 },

  h1: { fontSize: 18, fontWeight: "900", color: "#111" },
  sub: { marginTop: 6, color: "#666", fontWeight: "800" },
  err: { marginTop: 10, color: "#b00020", fontWeight: "900" },

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

  siteName: { marginTop: 10, fontSize: 18, fontWeight: "900", color: "#111" },

  statusRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  metaLabel: { color: "#666", fontWeight: "900" },
  status: { fontWeight: "900" },
  ok: { color: "#1a7f37" },
  bad: { color: "#b00020" },

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: { fontSize: 16, fontWeight: "900", color: "#111" },

  actionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: "#16A34A",
    alignSelf: "flex-start",
  },
  actionTxt: { fontWeight: "900", color: "#fff" },

  foremanRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.08)",
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  foremanName: { fontWeight: "900", color: "#111", fontSize: 14 },
  small: { color: "#666", fontWeight: "800", marginTop: 2, fontSize: 12 },

  dangerBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: "rgba(176,0,32,0.12)",
    borderWidth: 1,
    borderColor: "rgba(176,0,32,0.25)",
  },
  dangerTxt: { fontWeight: "900", color: "#b00020", textAlign: "center" },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  pickRow: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.06)",
    marginTop: 10,
  },

  // ✅ Totals UI
  totalsGrid: {
    marginTop: 10,
    gap: 10,
  },
  totalTile: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  totalLabel: {
    fontSize: 12,
    color: "#666",
    fontWeight: "800",
    marginBottom: 4,
  },
  totalValue: {
    fontSize: 16,
    fontWeight: "900",
    color: "#111",
  },

  // ✅ Foreman Assignment Drawer
  drawerOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  drawerBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  drawerContainer: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "85%",
    overflow: "hidden",
  },
  drawerHandle: {
    alignItems: "center",
    paddingVertical: 10,
  },
  drawerHandleBar: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#ccc",
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  drawerTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#111",
  },
  closeBtn: {
    padding: 4,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    margin: 12,
    paddingHorizontal: 12,
    height: 44,
    backgroundColor: "#f5f5f5",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: "#111",
    marginLeft: 8,
  },
  selectedBanner: {
    backgroundColor: "rgba(0,122,255,0.1)",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,122,255,0.2)",
  },
  selectedText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#007AFF",
  },
  drawerScroll: {
    maxHeight: 340,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: "center",
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: "center",
  },
  foremanItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  foremanInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  foremanAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#e0e0e0",
    alignItems: "center",
    justifyContent: "center",
  },
  foremanAvatarText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#555",
  },
  foremanItemName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111",
  },
  foremanItemEmail: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#ccc",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  drawerFooter: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.08)",
  },
  assignButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  assignButtonText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#fff",
  },
});
