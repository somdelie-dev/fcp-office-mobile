import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import { GlassCard } from "@/components/GlassCard";
import LoadingOverlay from "@/components/LoadingOverlay";
import {
  apiAdminListUsers,
  apiAdminTimesheets,
  type AdminTimesheetsPeriodDto,
  type AdminUserListItemDto,
  type TimesheetListRowDto,
  type TimesheetStatus,
} from "@/lib/apiClient";
import { formatCurrency } from "@/lib/formatCurrency";
import { useTheme } from "@/lib/themeContext";
import { Ionicons } from "@expo/vector-icons";

// Face Scan green accent, kept as a module constant so the plain (non-hook)
// StyleSheet entries below can reference it too.
const NAVY = "#16A34A";

const themes = {
  dark: {
    bg: "#0b1220",
    bgSecondary: "#0f172a",
    border: "#1f2a44",
    textPrimary: "white",
    textSecondary: "#94a3b8",
    textTertiary: "#cbd5e1",
    accent: "#22c55e",
    error: "#dc2626",
  },
  light: {
    bg: "#f8fafc",
    bgSecondary: "#ffffff",
    border: "#e2e8f0",
    textPrimary: "#0f172a",
    textSecondary: "#64748b",
    textTertiary: "#475569",
    accent: "#16A34A",
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

function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso10(iso)}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDateRange(startISO: string, endISO: string): string {
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

function statusLabel(s: TimesheetStatus) {
  switch (s) {
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

function statusColor(s: TimesheetStatus) {
  switch (s) {
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

export default function AdminTimesheetsScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const colors = themes[theme];

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timesheets, setTimesheets] = useState<TimesheetListRowDto[]>([]);
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<"ALL" | TimesheetStatus>(
    "ALL",
  );

  // Period navigation: undefined = let the server resolve "current".
  const [periodOverride, setPeriodOverride] = useState<string | undefined>();
  const [activePeriod, setActivePeriod] = useState<AdminTimesheetsPeriodDto | null>(
    null,
  );

  const [supervisors, setSupervisors] = useState<AdminUserListItemDto[]>([]);
  const [selectedSupervisorId, setSelectedSupervisorId] = useState<
    string | "ALL"
  >("ALL");
  const [supervisorPickerOpen, setSupervisorPickerOpen] = useState(false);

  useEffect(() => {
    apiAdminListUsers("SUPERVISOR")
      .then((res) => setSupervisors(res.users ?? []))
      .catch(() => setSupervisors([]));
  }, []);

  // Debounce search
  React.useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedSearch(searchText.trim());
    }, 400);
    return () => clearTimeout(id);
  }, [searchText]);

  const loadTimesheets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiAdminTimesheets({
        q: debouncedSearch || undefined,
        status: selectedStatus === "ALL" ? undefined : selectedStatus,
        period: periodOverride,
        supervisorId:
          selectedSupervisorId === "ALL" ? undefined : selectedSupervisorId,
        limit: 100,
      });
      setTimesheets(res.timesheets ?? []);
      if (res.period) setActivePeriod(res.period);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load timesheets");
      setTimesheets([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, selectedStatus, periodOverride, selectedSupervisorId]);

  const goToPeriod = useCallback(
    (direction: -1 | 1) => {
      if (!activePeriod) return;
      const startISO = addDaysISO(activePeriod.startISO, direction * 14);
      const endISO = addDaysISO(activePeriod.endISO, direction * 14);
      setPeriodOverride(`${startISO}_${endISO}`);
    },
    [activePeriod],
  );

  const goToCurrentPeriod = useCallback(() => {
    setPeriodOverride(undefined);
  }, []);

  const selectedSupervisorLabel = useMemo(() => {
    if (selectedSupervisorId === "ALL") return "All supervisors";
    return (
      supervisors.find((s) => s.id === selectedSupervisorId)?.name ??
      "All supervisors"
    );
  }, [selectedSupervisorId, supervisors]);

  React.useEffect(() => {
    loadTimesheets();
  }, [loadTimesheets]);

  useFocusEffect(
    useCallback(() => {
      loadTimesheets();
    }, [loadTimesheets]),
  );

  // Local filtering is handled server-side now, just display
  const filteredTimesheets = timesheets;

  const statusOptions = useMemo(
    (): Array<{ label: string; value: "ALL" | TimesheetStatus }> => [
      { label: "All", value: "ALL" },
      { label: "Pending", value: "SUBMITTED" },
      { label: "Approved", value: "APPROVED" },
      { label: "Paid", value: "PAID" },
      { label: "Rejected", value: "REJECTED" },
      { label: "Draft", value: "DRAFT" },
    ],
    [],
  );

  return (
    <AuthStyleBackground>
      <ScrollView
        style={styles.wrap}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <GlassCard style={styles.topCard}>
          <Text style={[styles.h1, { color: colors.textPrimary }]}>
            All Timesheets
          </Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]}>
            {todayLabel()}
          </Text>
          <Text style={[styles.adminNote, { color: colors.textTertiary }]}>
            View and manage timesheets across all foremen and sites
          </Text>
        </GlassCard>

        <GlassCard style={styles.filterCard}>
          {activePeriod && (
            <View style={styles.periodRow}>
              <Pressable
                onPress={() => goToPeriod(-1)}
                style={[
                  styles.periodNavBtn,
                  { backgroundColor: colors.bgSecondary, borderColor: colors.border },
                ]}
              >
                <Ionicons name="chevron-back" size={16} color={colors.textPrimary} />
              </Pressable>

              <Pressable
                onPress={goToCurrentPeriod}
                style={styles.periodLabelWrap}
              >
                <Text style={[styles.periodLabel, { color: colors.textPrimary }]}>
                  {formatDateRange(activePeriod.startISO, activePeriod.endISO)}
                </Text>
                {periodOverride && (
                  <Text style={[styles.periodBackToToday, { color: NAVY }]}>
                    Jump to current
                  </Text>
                )}
              </Pressable>

              <Pressable
                onPress={() => goToPeriod(1)}
                style={[
                  styles.periodNavBtn,
                  { backgroundColor: colors.bgSecondary, borderColor: colors.border },
                ]}
              >
                <Ionicons name="chevron-forward" size={16} color={colors.textPrimary} />
              </Pressable>
            </View>
          )}

          <Pressable
            onPress={() => setSupervisorPickerOpen((v) => !v)}
            style={[
              styles.supervisorTrigger,
              { backgroundColor: colors.bgSecondary, borderColor: colors.border },
            ]}
          >
            <Ionicons name="people-outline" size={16} color={colors.textSecondary} />
            <Text
              style={[styles.supervisorTriggerText, { color: colors.textPrimary }]}
              numberOfLines={1}
            >
              {selectedSupervisorLabel}
            </Text>
            <Ionicons
              name={supervisorPickerOpen ? "chevron-up" : "chevron-down"}
              size={16}
              color={colors.textSecondary}
            />
          </Pressable>

          {supervisorPickerOpen && (
            <View
              style={[
                styles.supervisorDropdown,
                { backgroundColor: colors.bgSecondary, borderColor: colors.border },
              ]}
            >
              <ScrollView
                style={{ maxHeight: 240 }}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
              >
                <Pressable
                  style={styles.supervisorOption}
                  onPress={() => {
                    setSelectedSupervisorId("ALL");
                    setSupervisorPickerOpen(false);
                  }}
                >
                  <Text style={{ color: colors.textPrimary, fontWeight: "700" }}>
                    All supervisors
                  </Text>
                </Pressable>
                {supervisors.map((s) => (
                  <Pressable
                    key={s.id}
                    style={styles.supervisorOption}
                    onPress={() => {
                      setSelectedSupervisorId(s.id);
                      setSupervisorPickerOpen(false);
                    }}
                  >
                    <Text style={{ color: colors.textPrimary, fontWeight: "700" }}>
                      {s.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

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
            Filter by status:
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.statusTabs}
          >
            {statusOptions.map((opt) => (
              <Pressable
                key={opt.value}
                style={[
                  styles.statusTab,
                  selectedStatus === opt.value && [
                    styles.statusTabActive,
                    { backgroundColor: NAVY },
                  ],
                  selectedStatus !== opt.value && {
                    backgroundColor: colors.bgSecondary,
                    borderColor: colors.border,
                  },
                ]}
                onPress={() => setSelectedStatus(opt.value)}
              >
                <Text
                  style={[
                    styles.statusTabLabel,
                    selectedStatus === opt.value
                      ? styles.statusTabLabelActive
                      : { color: colors.textSecondary },
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </GlassCard>

        {loading ? (
          <LoadingOverlay
            icon="⏳"
            title="Loading timesheets…"
            message="Please wait while we fetch all timesheets"
          />
        ) : error ? (
          <View style={styles.stateBox}>
            <Text
              style={[styles.stateText, { color: colors.error || "#dc2626" }]}
            >
              {error}
            </Text>
            <Pressable style={styles.retryButton} onPress={loadTimesheets}>
              <Ionicons name="refresh" size={18} color="#fff" />
              <Text style={styles.retryButtonText}>Try Again</Text>
            </Pressable>
          </View>
        ) : filteredTimesheets.length === 0 ? (
          <View style={styles.stateBox}>
            <Text
              style={[
                styles.stateText,
                { color: colors.textSecondary, fontWeight: "800" },
              ]}
            >
              No timesheets found.
            </Text>
            <Text
              style={[styles.stateSubText, { color: colors.textSecondary }]}
            >
              {searchText.trim()
                ? "Try adjusting your search or filters."
                : "No timesheets match the current filter."}
            </Text>
          </View>
        ) : (
          <GlassCard style={styles.listCard}>
            <View style={styles.listHeader}>
              <Text style={[styles.listTitle, { color: colors.textPrimary }]}>
                Timesheets
              </Text>
              <Text style={[styles.listMeta, { color: colors.textSecondary }]}>
                {filteredTimesheets.length} result
                {filteredTimesheets.length === 1 ? "" : "s"}
              </Text>
            </View>
            <FlatList
              data={filteredTimesheets}
              keyExtractor={(item, index) => {
                const firstSite = Array.isArray(item.sites)
                  ? item.sites[0]
                  : undefined;
                const siteId = item.siteId ?? firstSite?.id;
                return (
                  item.rowKey ??
                  (siteId ? `${item.id}__${siteId}` : `${item.id}_${index}`)
                );
              }}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <TimesheetRow item={item} theme={colors} />
              )}
            />
          </GlassCard>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
    </AuthStyleBackground>
  );
}

function TimesheetRow({
  item,
  theme,
}: {
  item: TimesheetListRowDto;
  theme: (typeof themes)["dark"];
}) {
  const router = useRouter();
  const sColor = statusColor(item.status ?? "DRAFT");
  const firstSite = Array.isArray(item.sites) ? item.sites[0] : undefined;
  const siteCode = item.siteCode ?? firstSite?.code ?? "";
  const siteName = item.siteName ?? firstSite?.name ?? "";
  const siteLine = [siteCode, siteName].filter(Boolean).join(" • ");
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

  const hasTotals =
    item.totalWorkerDays != null || item.totalWorkerWages != null;
  const daysLabel =
    item.totalWorkerDays != null ? `${item.totalWorkerDays} days` : undefined;
  const wagesLabel =
    item.totalWorkerWages != null
      ? formatCurrency(item.totalWorkerWages)
      : undefined;

  return (
    <Pressable
      onPress={() => {
        router.push({
          pathname: "/(admin-stack)/timesheets/[id]",
          params: {
            id: item.id,
            siteId: item.siteId ?? firstSite?.id,
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
          {formatDateRange(item.startISO, item.endISO)}
        </Text>

        <Text
          style={[styles.rowMidText, { color: theme.textSecondary }]}
          numberOfLines={1}
        >
          {foremanLabel}
        </Text>

        <Text
          style={[styles.rowBottomText, { color: theme.textSecondary }]}
          numberOfLines={1}
        >
          {siteLine}
        </Text>
      </View>

      <View style={styles.rowRight}>
        {hasTotals && (
          <View style={styles.rowStats}>
            {daysLabel && (
              <Text
                style={[styles.rowStatsTop, { color: theme.textPrimary }]}
                numberOfLines={1}
              >
                {daysLabel}
              </Text>
            )}
            {wagesLabel && (
              <Text
                style={[styles.rowStatsBottom, { color: theme.textSecondary }]}
                numberOfLines={1}
              >
                {wagesLabel}
              </Text>
            )}
          </View>
        )}
        <View style={[styles.badge, { backgroundColor: `${sColor}18` }]}>
          <View style={[styles.dot, { backgroundColor: sColor }]} />
          <Text style={[styles.badgeText, { color: sColor }]}>
            {statusLabel(item.status ?? "DRAFT")}
          </Text>
        </View>
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
  filterCard: { padding: 14, marginBottom: 12 },
  listCard: { padding: 0 },

  h1: { fontSize: 20, fontWeight: "900" },
  sub: { marginTop: 6, fontWeight: "800", fontSize: 13 },
  adminNote: { marginTop: 4, fontWeight: "700", fontSize: 12 },

  periodRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 8,
  },
  periodNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  periodLabelWrap: { flex: 1, alignItems: "center" },
  periodLabel: { fontSize: 14, fontWeight: "900" },
  periodBackToToday: { fontSize: 11, fontWeight: "800", marginTop: 2 },

  supervisorTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  supervisorTriggerText: { flex: 1, fontSize: 13, fontWeight: "700" },
  supervisorDropdown: {
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
    overflow: "hidden",
  },
  supervisorOption: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(148,163,184,0.15)",
  },

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
  statusTabs: { flexDirection: "row", gap: 8 },
  statusTab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  statusTabActive: { backgroundColor: NAVY, borderColor: NAVY },
  statusTabLabel: { fontSize: 12, fontWeight: "900" },
  statusTabLabelActive: { color: "#fff" },

  listHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  listTitle: { fontSize: 14, fontWeight: "900" },
  listMeta: { fontSize: 12, fontWeight: "800" },

  row: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
  },

  rowLeft: { flex: 1, gap: 4, paddingRight: 12 },
  rowTopText: { fontSize: 14, fontWeight: "900" },
  rowMidText: { fontSize: 13, fontWeight: "800" },
  rowBottomText: { fontSize: 12, fontWeight: "700" },

  rowRight: { flexDirection: "row", alignItems: "center", gap: 10 },

  rowStats: {
    alignItems: "flex-end",
    marginRight: 4,
  },
  rowStatsTop: { fontSize: 12, fontWeight: "800" },
  rowStatsBottom: { fontSize: 11, fontWeight: "700" },

  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  badgeText: { fontSize: 12, fontWeight: "900" },

  stateBox: { paddingVertical: 28, alignItems: "center", gap: 8 },
  stateText: { fontWeight: "800", fontSize: 14 },
  stateSubText: { fontWeight: "700", fontSize: 12 },

  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#dc2626",
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  retryButtonText: { fontSize: 13, fontWeight: "900", color: "#fff" },
});
