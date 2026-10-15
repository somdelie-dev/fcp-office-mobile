import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import LoadingOverlay from "@/components/LoadingOverlay";
import { SearchablePickerModal } from "@/components/SearchablePickerModal";
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

const ACCENT = "#22c55e";

const themes = {
  dark: {
    textPrimary: "#e5e7eb",
    textSecondary: "#94a3b8",
    cardBg: "rgba(15,23,42,0.85)",
    emptyText: "#64748b",
    rowBorder: "rgba(148,163,184,0.15)",
    inputBg: "rgba(255,255,255,0.08)",
    border: "rgba(148,163,184,0.2)",
  },
  light: {
    textPrimary: "#111",
    textSecondary: "#666",
    cardBg: "rgba(255,255,255,0.9)",
    emptyText: "#94a3b8",
    rowBorder: "rgba(0,0,0,0.08)",
    inputBg: "rgba(0,0,0,0.04)",
    border: "rgba(0,0,0,0.1)",
  },
};

type Colors = (typeof themes)["light"];
type StatusFilter = "ALL" | TimesheetStatus;

const STATUS_OPTIONS: { id: TimesheetStatus; name: string }[] = [
  { id: "SUBMITTED", name: "Pending Review" },
  { id: "APPROVED", name: "Approved" },
  { id: "PAID", name: "Paid" },
  { id: "REJECTED", name: "Rejected" },
  { id: "DRAFT", name: "Draft" },
];

const AVATAR_PALETTE = [
  { bg: "#bbf7d0", fg: "#166534" },
  { bg: "#bfdbfe", fg: "#1e3a8a" },
  { bg: "#fed7aa", fg: "#9a3412" },
  { bg: "#ddd6fe", fg: "#5b21b6" },
  { bg: "#fbcfe8", fg: "#9d174d" },
  { bg: "#fde68a", fg: "#854d0e" },
] as const;

function avatarPaletteFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++)
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
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
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  };
  const start = new Date(`${iso10(startISO)}T00:00:00.000Z`);
  const end = new Date(`${iso10(endISO)}T00:00:00.000Z`);
  return `${start.toLocaleDateString(undefined, opts)} - ${end.toLocaleDateString(undefined, opts)}`;
}

function statusLabel(s: TimesheetStatus) {
  return STATUS_OPTIONS.find((o) => o.id === s)?.name ?? "Draft";
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
      return "#6b7280";
  }
}

function foremanLabelFor(item: TimesheetListRowDto) {
  const val = (item.foreman?.name?.trim() || item.foremanName?.trim()) ?? "";
  const lower = val.toLowerCase();
  if (!val || lower === "undefined" || lower === "null") return "";
  return val;
}

function rowKeyFor(item: TimesheetListRowDto, index: number) {
  const siteId = item.siteId ?? item.sites?.[0]?.id;
  return item.rowKey ?? (siteId ? `${item.id}__${siteId}` : `${item.id}_${index}`);
}

export default function AdminTimesheetsScreen() {
  const { theme } = useTheme();
  const colors = themes[theme];
  const isDark = theme === "dark";

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timesheets, setTimesheets] = useState<TimesheetListRowDto[]>([]);
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>("ALL");
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);

  // Period navigation: undefined = let the server resolve "current".
  const [periodOverride, setPeriodOverride] = useState<string | undefined>();
  const [activePeriod, setActivePeriod] =
    useState<AdminTimesheetsPeriodDto | null>(null);

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

  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedSearch(searchText.trim());
    }, 400);
    return () => clearTimeout(id);
  }, [searchText]);

  const loadTimesheets = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
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
        setRefreshing(false);
      }
    },
    [debouncedSearch, selectedStatus, periodOverride, selectedSupervisorId],
  );

  // Refetches on focus and whenever a filter changes (the callback identity
  // changes with its deps), since filtering happens server-side.
  useFocusEffect(
    useCallback(() => {
      loadTimesheets();
    }, [loadTimesheets]),
  );

  const goToPeriod = useCallback(
    (direction: -1 | 1) => {
      if (!activePeriod) return;
      const startISO = addDaysISO(activePeriod.startISO, direction * 14);
      const endISO = addDaysISO(activePeriod.endISO, direction * 14);
      setPeriodOverride(`${startISO}_${endISO}`);
    },
    [activePeriod],
  );

  const supervisorOptions = useMemo(
    () => supervisors.map((s) => ({ id: s.id, name: s.name })),
    [supervisors],
  );

  const selectedSupervisorLabel =
    selectedSupervisorId === "ALL"
      ? "All Supervisors"
      : (supervisors.find((s) => s.id === selectedSupervisorId)?.name ??
        "All Supervisors");

  const hasFilters =
    !!searchText.trim() ||
    selectedStatus !== "ALL" ||
    selectedSupervisorId !== "ALL";

  return (
    <AuthStyleBackground>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Timesheets
          </Text>
        </View>

        <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
          <View
            style={[
              styles.searchBox,
              { borderColor: colors.rowBorder, backgroundColor: colors.inputBg },
            ]}
          >
            <Ionicons name="search" size={18} color={colors.textSecondary} />
            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Search foreman or site…"
              placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
              style={[styles.searchInput, { color: colors.textPrimary }]}
              autoCapitalize="none"
              returnKeyType="search"
            />
            {searchText.length > 0 && (
              <Pressable onPress={() => setSearchText("")} hitSlop={8}>
                <Ionicons
                  name="close-circle"
                  size={18}
                  color={colors.textSecondary}
                />
              </Pressable>
            )}
          </View>
        </View>

        <View style={styles.filterBar}>
          <Pressable
            style={[
              styles.filterTrigger,
              { borderColor: colors.rowBorder, backgroundColor: colors.inputBg },
            ]}
            onPress={() => setSupervisorPickerOpen(true)}
          >
            <Text
              style={[
                styles.filterTriggerText,
                {
                  color:
                    selectedSupervisorId !== "ALL"
                      ? colors.textPrimary
                      : colors.textSecondary,
                },
              ]}
              numberOfLines={1}
            >
              {selectedSupervisorLabel}
            </Text>
            <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            style={[
              styles.filterTrigger,
              { borderColor: colors.rowBorder, backgroundColor: colors.inputBg },
            ]}
            onPress={() => setStatusPickerOpen(true)}
          >
            <Text
              style={[
                styles.filterTriggerText,
                {
                  color:
                    selectedStatus !== "ALL"
                      ? colors.textPrimary
                      : colors.textSecondary,
                },
              ]}
              numberOfLines={1}
            >
              {selectedStatus === "ALL" ? "All Statuses" : statusLabel(selectedStatus)}
            </Text>
            <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
          </Pressable>
        </View>

        <SearchablePickerModal
          visible={supervisorPickerOpen}
          title="Filter by Supervisor"
          searchPlaceholder="Search supervisors…"
          allLabel="All Supervisors"
          options={supervisorOptions}
          selectedId={selectedSupervisorId === "ALL" ? null : selectedSupervisorId}
          onSelect={(option) => setSelectedSupervisorId(option?.id ?? "ALL")}
          onClose={() => setSupervisorPickerOpen(false)}
          colors={colors}
          isDark={isDark}
        />
        <SearchablePickerModal
          visible={statusPickerOpen}
          title="Filter by Status"
          searchPlaceholder="Search statuses…"
          allLabel="All Statuses"
          options={STATUS_OPTIONS}
          selectedId={selectedStatus === "ALL" ? null : selectedStatus}
          onSelect={(option) =>
            setSelectedStatus((option?.id as TimesheetStatus | undefined) ?? "ALL")
          }
          onClose={() => setStatusPickerOpen(false)}
          colors={colors}
          isDark={isDark}
        />

        <View style={styles.periodRow}>
          <View style={styles.periodNav}>
            <Pressable
              onPress={() => goToPeriod(-1)}
              disabled={!activePeriod}
              hitSlop={8}
              style={[styles.periodNavBtn, { borderColor: colors.rowBorder }]}
            >
              <Ionicons name="chevron-back" size={16} color={colors.textPrimary} />
            </Pressable>
            <Pressable
              onPress={() => setPeriodOverride(undefined)}
              disabled={!periodOverride}
            >
              <Text style={[styles.periodHeading, { color: colors.textPrimary }]}>
                {activePeriod
                  ? formatDateRange(activePeriod.startISO, activePeriod.endISO)
                  : "Current period"}
              </Text>
              {periodOverride ? (
                <Text style={styles.jumpToCurrent}>Jump to current</Text>
              ) : null}
            </Pressable>
            <Pressable
              onPress={() => goToPeriod(1)}
              disabled={!activePeriod}
              hitSlop={8}
              style={[styles.periodNavBtn, { borderColor: colors.rowBorder }]}
            >
              <Ionicons name="chevron-forward" size={16} color={colors.textPrimary} />
            </Pressable>
          </View>
          <Text style={[styles.periodCount, { color: colors.textSecondary }]}>
            {timesheets.length} timesheet{timesheets.length === 1 ? "" : "s"}
          </Text>
        </View>

        {loading && !refreshing ? (
          <LoadingOverlay title="Loading timesheets…" message="Please wait" />
        ) : error ? (
          <View style={styles.stateWrap}>
            <Ionicons name="alert-circle" size={48} color="#ef4444" />
            <Text style={[styles.errorText, { color: colors.textPrimary }]}>
              {error}
            </Text>
            <Pressable onPress={() => loadTimesheets()} style={styles.retryBtn}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : timesheets.length === 0 ? (
          <View style={styles.stateWrap}>
            <Ionicons
              name="document-text-outline"
              size={64}
              color={colors.emptyText}
            />
            <Text style={[styles.emptyText, { color: colors.emptyText }]}>
              {hasFilters
                ? "No timesheets match your filters"
                : "No timesheets for this period"}
            </Text>
          </View>
        ) : (
          <FlatList
            data={timesheets}
            keyExtractor={rowKeyFor}
            renderItem={({ item }) => <TimesheetCard item={item} colors={colors} />}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => loadTimesheets(true)}
              />
            }
          />
        )}
      </View>
    </AuthStyleBackground>
  );
}

function TimesheetCard({
  item,
  colors,
}: {
  item: TimesheetListRowDto;
  colors: Colors;
}) {
  const router = useRouter();
  const status = item.status ?? "DRAFT";
  const sColor = statusColor(status);
  const firstSite = item.sites?.[0];
  const siteId = item.siteId ?? firstSite?.id;
  const siteCode = item.siteCode ?? firstSite?.code ?? "";
  const siteName = item.siteName ?? firstSite?.name ?? "";
  const siteLine = [siteCode, siteName].filter(Boolean).join(" - ");
  const foreman = foremanLabelFor(item);
  const avatar = avatarPaletteFor(item.foremanId ?? item.foreman?.id ?? item.id);

  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: "/(admin-stack)/timesheets/[id]",
          params: { id: item.id, siteId },
        })
      }
      style={({ pressed }) => [
        styles.card,
        {
          borderColor: colors.rowBorder,
          backgroundColor: colors.cardBg,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <View style={styles.cardTopRow}>
        <View style={styles.cardLeft}>
          <View style={styles.identityRow}>
            <View style={[styles.avatar, { backgroundColor: avatar.bg }]}>
              <Text style={[styles.avatarText, { color: avatar.fg }]}>
                {initialsFor(foreman || siteName)}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={[styles.foremanName, { color: colors.textPrimary }]}
                numberOfLines={1}
              >
                {foreman || "Unassigned foreman"}
              </Text>
              <Text style={[styles.foremanRole, { color: colors.textSecondary }]}>
                Site Foreman
              </Text>
            </View>
          </View>

          {siteLine ? (
            <View style={styles.siteRow}>
              <Ionicons name="business" size={14} color={colors.textSecondary} />
              <Text
                style={[styles.siteText, { color: colors.textPrimary }]}
                numberOfLines={1}
              >
                {siteLine}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.cardRight}>
          <View style={[styles.statusBadge, { backgroundColor: `${sColor}1f` }]}>
            <View style={[styles.statusDot, { backgroundColor: sColor }]} />
            <Text style={[styles.statusText, { color: sColor }]}>
              {statusLabel(status)}
            </Text>
          </View>
          {item.totalWorkerWages != null && (
            <Text style={[styles.wages, { color: colors.textPrimary }]}>
              {formatCurrency(item.totalWorkerWages)}
            </Text>
          )}
          {item.totalWorkerDays != null && (
            <Text style={[styles.days, { color: colors.textSecondary }]}>
              {item.totalWorkerDays} guy day
              {item.totalWorkerDays === 1 ? "" : "s"}
            </Text>
          )}
        </View>
      </View>

      <View style={[styles.cardFooter, { borderTopColor: colors.rowBorder }]}>
        <View style={styles.footerLeft}>
          <Ionicons name="calendar-outline" size={12} color={colors.textSecondary} />
          <Text style={[styles.footerText, { color: colors.textSecondary }]}>
            {formatDateRange(item.startISO, item.endISO)}
          </Text>
          {item.isCurrent && (
            <View style={styles.currentBadge}>
              <Text style={styles.currentText}>Current</Text>
            </View>
          )}
        </View>
        <View style={styles.footerRight}>
          <Text style={styles.viewText}>View</Text>
          <Ionicons name="chevron-forward" size={14} color={ACCENT} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 18, fontWeight: "900" },

  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 5,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14 },

  filterBar: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  filterTrigger: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 5,
    borderWidth: 1,
  },
  filterTriggerText: { flex: 1, fontSize: 13, fontWeight: "700" },

  periodRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginTop: 4,
    marginBottom: 10,
  },
  periodNav: { flexDirection: "row", alignItems: "center", gap: 10 },
  periodNavBtn: {
    width: 30,
    height: 30,
    borderRadius: 5,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  periodHeading: { fontSize: 17, fontWeight: "900" },
  jumpToCurrent: { fontSize: 11, fontWeight: "800", color: ACCENT },
  periodCount: { fontSize: 13, fontWeight: "700" },

  listContent: { paddingHorizontal: 16, paddingBottom: 32 },

  card: {
    padding: 14,
    borderWidth: 1,
    borderRadius: 5,
    marginBottom: 12,
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  cardLeft: { flex: 1, minWidth: 0, gap: 6 },
  identityRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 14, fontWeight: "900" },
  foremanName: { fontSize: 15, fontWeight: "800" },
  foremanRole: { fontSize: 11, fontWeight: "600", marginTop: 1 },
  siteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  siteText: { flex: 1, fontSize: 13, fontWeight: "800" },

  cardRight: { alignItems: "flex-end", gap: 4, flexShrink: 0 },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    gap: 5,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 11, fontWeight: "800" },
  wages: { fontSize: 15, fontWeight: "800", marginTop: 2 },
  days: { fontSize: 11, fontWeight: "600" },

  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    gap: 8,
  },
  footerLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minWidth: 0,
  },
  footerText: { fontSize: 12, fontWeight: "700" },
  currentBadge: {
    backgroundColor: ACCENT,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    marginLeft: 4,
  },
  currentText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  footerRight: { flexDirection: "row", alignItems: "center", gap: 2 },
  viewText: { fontSize: 12, fontWeight: "800", color: ACCENT },

  stateWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  errorText: { fontSize: 16, textAlign: "center", marginTop: 12 },
  emptyText: { fontSize: 16, textAlign: "center", marginTop: 16 },
  retryBtn: {
    marginTop: 16,
    backgroundColor: ACCENT,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 5,
  },
  retryText: { color: "#fff", fontWeight: "600" },
});
