import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import LoadingOverlay from "@/components/LoadingOverlay";
import {
  SearchablePickerModal,
  type SearchablePickerOption,
} from "@/components/SearchablePickerModal";
import {
  apiAdminBulkOvertimeEntries,
  apiAdminCreateOvertimeEntry,
  apiAdminForemenList,
  apiAdminListUsers,
  apiAdminOvertimeEntries,
  apiAdminOvertimePrices,
  apiAdminOvertimeRequests,
  apiAdminSetOvertimeEntryPaid,
  apiAdminSites,
  apiAdminUpdateOvertimeEntry,
  type OvertimeEntryDto,
  type OvertimePriceDto,
} from "@/lib/apiClient";
import { formatCurrency } from "@/lib/formatCurrency";
import { openPdf, postForPdf, savePdfToDevice, sharePdf } from "@/lib/pdfFiles";
import { getCurrentFortnight } from "@/lib/fortnight";
import { useTheme } from "@/lib/themeContext";

const ACCENT = "#22c55e";
const PAID_COLOR = "#2563eb";
const UNPAID_COLOR = "#f59e0b";

const themes = {
  dark: {
    textPrimary: "#e5e7eb",
    textSecondary: "#94a3b8",
    cardBg: "rgba(15,23,42,0.85)",
    emptyText: "#64748b",
    rowBorder: "rgba(148,163,184,0.15)",
    inputBg: "rgba(255,255,255,0.08)",
    border: "rgba(148,163,184,0.2)",
    sheetBg: "#0f172a",
    barBg: "rgba(11,24,38,0.97)",
  },
  light: {
    textPrimary: "#111",
    textSecondary: "#666",
    cardBg: "rgba(255,255,255,0.9)",
    emptyText: "#94a3b8",
    rowBorder: "rgba(0,0,0,0.08)",
    inputBg: "rgba(0,0,0,0.04)",
    border: "rgba(0,0,0,0.1)",
    sheetBg: "#ffffff",
    barBg: "rgba(255,255,255,0.97)",
  },
};

type Colors = (typeof themes)["light"];
type PaidFilter = "UNPAID" | "PAID" | "ALL";
type DateField = "workDate" | "createdAt";
type Period = { id: string; name: string; from?: string; to?: string };

// Same columns, in the same order, as the web admin's Print Selected.
const PRINT_COLUMNS = [
  { id: "date", label: "Date" },
  { id: "site", label: "Site" },
  { id: "foreman", label: "Foreman" },
  { id: "supervisor", label: "Supervisor" },
  { id: "priceType", label: "Price Type" },
  { id: "rate", label: "Rate" },
  { id: "employees", label: "Guys" },
  { id: "hours", label: "Hours" },
  { id: "total", label: "Total" },
] as const;
type PrintColumnId = (typeof PRINT_COLUMNS)[number]["id"];

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

function localISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shiftISO(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return localISO(d);
}

function dateLabel(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function addedLabel(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function buildPeriods(): Period[] {
  const today = new Date();
  const fortnight = getCurrentFortnight();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
  // The first entry is the default: recent enough to load fast, and wide
  // enough to catch overtime added late for the previous fortnight.
  return [
    {
      id: "TWO_FORTNIGHTS",
      name: "Last 2 fortnights",
      from: shiftISO(fortnight.startISO, -14),
      to: fortnight.endISO,
    },
    {
      id: "FORTNIGHT",
      name: "This fortnight",
      from: fortnight.startISO,
      to: fortnight.endISO,
    },
    {
      id: "LAST_FORTNIGHT",
      name: "Last fortnight",
      from: shiftISO(fortnight.startISO, -14),
      to: shiftISO(fortnight.startISO, -1),
    },
    {
      id: "MONTH",
      name: "This month",
      from: localISO(monthStart),
      to: localISO(today),
    },
    {
      id: "LAST_MONTH",
      name: "Last month",
      from: localISO(lastMonthStart),
      to: localISO(lastMonthEnd),
    },
    {
      id: "90_DAYS",
      name: "Last 90 days",
      from: shiftISO(localISO(today), -89),
      to: localISO(today),
    },
    { id: "ALL", name: "All time" },
  ];
}

function siteLabel(code: string | null | undefined, name: string) {
  return code ? `${code} - ${name}` : name;
}

function EntryCard({
  item,
  colors,
  selected,
  onToggle,
  onPress,
}: {
  item: OvertimeEntryDto;
  colors: Colors;
  selected: boolean;
  onToggle: () => void;
  onPress: () => void;
}) {
  const avatar = avatarPaletteFor(item.foremanId);
  const paid = !!item.paidAt;
  const statusColor = paid ? PAID_COLOR : UNPAID_COLOR;
  const fromRequest = item.note?.startsWith("Approved overtime request");

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.card,
        {
          backgroundColor: colors.cardBg,
          borderColor: selected ? ACCENT : colors.rowBorder,
        },
      ]}
    >
      <View style={styles.cardTopRow}>
        <Pressable onPress={onToggle} hitSlop={10} style={styles.checkWrap}>
          <View
            style={[
              styles.checkbox,
              selected
                ? { backgroundColor: ACCENT, borderColor: ACCENT }
                : { borderColor: colors.textSecondary },
            ]}
          >
            {selected && <Ionicons name="checkmark" size={14} color="#fff" />}
          </View>
        </Pressable>

        <View style={styles.cardLeft}>
          <View style={styles.identityRow}>
            <View style={[styles.avatar, { backgroundColor: avatar.bg }]}>
              <Text style={[styles.avatarText, { color: avatar.fg }]}>
                {initialsFor(item.foremanName)}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={[styles.foremanName, { color: colors.textPrimary }]}
                numberOfLines={1}
              >
                {item.foremanName}
              </Text>
              <Text style={[styles.subText, { color: colors.textSecondary }]}>
                {dateLabel(item.workDate)}
              </Text>
            </View>
          </View>
          <View style={styles.siteRow}>
            <Ionicons name="business" size={14} color={colors.textSecondary} />
            <Text
              style={[styles.siteText, { color: colors.textPrimary }]}
              numberOfLines={1}
            >
              {siteLabel(item.siteCode, item.siteName)}
            </Text>
          </View>
        </View>

        <View style={styles.cardRight}>
          <Text style={[styles.amount, { color: colors.textPrimary }]}>
            {formatCurrency(item.totalCost)}
          </Text>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: `${statusColor}1f` },
            ]}
          >
            <View
              style={[styles.statusDot, { backgroundColor: statusColor }]}
            />
            <Text style={[styles.statusText, { color: statusColor }]}>
              {paid ? "Paid" : "Unpaid"}
            </Text>
          </View>
        </View>
      </View>

      <View style={[styles.cardFooter, { borderTopColor: colors.rowBorder }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.footerText, { color: colors.textSecondary }]}>
            {item.numberOfEmployees} guy
            {item.numberOfEmployees === 1 ? "" : "s"} · {item.hoursWorked} h ·{" "}
            {formatCurrency(item.rateAtCreation)}/h
          </Text>
          <Text style={[styles.addedText, { color: colors.textSecondary }]}>
            Added {addedLabel(item.createdAt)}
          </Text>
        </View>
        {fromRequest && (
          <View style={styles.sourceBadge}>
            <Ionicons name="camera-outline" size={11} color="#6b7280" />
            <Text style={styles.sourceText}>Scan-out</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

export default function AdminOvertimeEntriesScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const colors = themes[theme];
  const isDark = theme === "dark";
  const insets = useSafeAreaInsets();
  const periods = useMemo(buildPeriods, []);

  const [entries, setEntries] = useState<OvertimeEntryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sites, setSites] = useState<SearchablePickerOption[]>([]);
  const [foremen, setForemen] = useState<SearchablePickerOption[]>([]);
  const [prices, setPrices] = useState<OvertimePriceDto[]>([]);
  const [pendingRequests, setPendingRequests] = useState(0);

  const [searchText, setSearchText] = useState("");
  const [supervisors, setSupervisors] = useState<SearchablePickerOption[]>([]);
  const [filterSupervisor, setFilterSupervisor] =
    useState<SearchablePickerOption | null>(null);
  const [paidFilter, setPaidFilter] = useState<PaidFilter>("UNPAID");
  const [period, setPeriod] = useState<Period>(periods[0]);
  const [dateField, setDateField] = useState<DateField>("workDate");
  const [picker, setPicker] = useState<"supervisor" | "period" | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [detail, setDetail] = useState<OvertimeEntryDto | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<OvertimeEntryDto | null>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{
    entries: OvertimeEntryDto[];
    fromDetail: boolean;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [report, setReport] = useState<{
    uri: string;
    filename: string;
    saved: boolean;
  } | null>(null);
  const [printColumns, setPrintColumns] = useState<Set<PrintColumnId>>(
    () => new Set(PRINT_COLUMNS.map((c) => c.id)),
  );

  useEffect(() => {
    apiAdminSites({ isActive: true })
      .then((res) =>
        setSites(
          (res.sites ?? [])
            .map((s) => ({ id: s.id, name: s.name, code: s.code ?? null }))
            .sort((a, b) => Number(b.code ?? 0) - Number(a.code ?? 0)),
        ),
      )
      .catch(() => setSites([]));
    apiAdminForemenList()
      .then((res) =>
        setForemen(
          (res.foremen ?? [])
            .filter((f) => !f.isAssistant)
            .map((f) => ({ id: f.foremanId, name: f.name }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        ),
      )
      .catch(() => setForemen([]));
    apiAdminOvertimePrices()
      .then((res) => setPrices(res.data ?? []))
      .catch(() => setPrices([]));
    apiAdminListUsers("SUPERVISOR")
      .then((res) =>
        setSupervisors(
          (res.users ?? [])
            .map((u) => ({ id: u.id, name: u.name }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        ),
      )
      .catch(() => setSupervisors([]));
  }, []);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await apiAdminOvertimeEntries({
          supervisorId: filterSupervisor?.id,
          paid: paidFilter === "ALL" ? undefined : paidFilter,
          from: period.from,
          to: period.to,
          dateField,
        });
        setEntries(res.data ?? []);
        setSelectedIds(new Set());
      } catch (e: any) {
        setError(e?.message ?? "Failed to load overtime.");
        setEntries([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [filterSupervisor, paidFilter, period, dateField],
  );

  useFocusEffect(
    useCallback(() => {
      load();
      apiAdminOvertimeRequests()
        .then((res) =>
          setPendingRequests(
            (res.requests ?? []).filter((r) => r.status === "PENDING").length,
          ),
        )
        .catch(() => setPendingRequests(0));
    }, [load]),
  );

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.foremanName.toLowerCase().includes(q) ||
        e.siteName.toLowerCase().includes(q) ||
        (e.siteCode ?? "").toLowerCase().includes(q) ||
        (e.note ?? "").toLowerCase().includes(q),
    );
  }, [entries, searchText]);

  const selectedVisible = useMemo(
    () => filtered.filter((e) => selectedIds.has(e.id)),
    [filtered, selectedIds],
  );
  const selectedTotal = selectedVisible.reduce(
    (sum, e) => sum + e.totalCost,
    0,
  );
  const allSelected =
    filtered.length > 0 && filtered.every((e) => selectedIds.has(e.id));

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = () => {
    setSelectedIds(
      allSelected ? new Set() : new Set(filtered.map((e) => e.id)),
    );
  };

  const runBulk = async (action: "MARK_PAID" | "MARK_UNPAID" | "DELETE") => {
    setBulkBusy(true);
    try {
      await apiAdminBulkOvertimeEntries(
        action,
        selectedVisible.map((e) => e.id),
      );
    } catch (e: any) {
      Alert.alert("Update failed", e?.message ?? "Please try again.");
    } finally {
      setBulkBusy(false);
      load(true);
    }
  };

  const bulkSetPaid = (paid: boolean) => {
    const n = selectedVisible.length;
    Alert.alert(
      paid ? "Mark as paid?" : "Mark as unpaid?",
      `${n} entr${n === 1 ? "y" : "ies"} totalling ${formatCurrency(selectedTotal)}.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: paid ? "Mark paid" : "Mark unpaid",
          onPress: () => runBulk(paid ? "MARK_PAID" : "MARK_UNPAID"),
        },
      ],
    );
  };

  const bulkDelete = () => {
    setConfirmDelete({ entries: selectedVisible, fromDetail: false });
  };

  const runConfirmedDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await apiAdminBulkOvertimeEntries(
        "DELETE",
        confirmDelete.entries.map((e) => e.id),
      );
      setConfirmDelete(null);
      load(true);
    } catch (e: any) {
      Alert.alert("Delete failed", e?.message ?? "Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  const cancelDelete = () => {
    // Deleting from an entry's details returns to those details on cancel.
    if (confirmDelete?.fromDetail) setDetail(confirmDelete.entries[0]);
    setConfirmDelete(null);
  };

  const downloadReport = async () => {
    const subtitle = [
      period.name,
      dateField === "createdAt" ? "by date added" : "by day worked",
      paidFilter === "ALL"
        ? "paid and unpaid"
        : paidFilter === "PAID"
          ? "paid"
          : "unpaid",
      filterSupervisor?.name,
    ]
      .filter(Boolean)
      .join(" - ");
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
    const filename = `overtime-report-${stamp}.pdf`;
    setPrinting(true);
    try {
      const uri = await postForPdf(
        "/api/app/admin/overtime-entries/print",
        {
          entries: selectedVisible,
          columns: PRINT_COLUMNS.map((c) => c.id).filter((id) =>
            printColumns.has(id),
          ),
          subtitle,
        },
        filename,
      );
      const saved = await savePdfToDevice(uri, filename);
      setReport({ uri, filename, saved: saved != null });
    } catch (e: any) {
      Alert.alert("Download failed", e?.message ?? "Please try again.");
    } finally {
      setPrinting(false);
    }
  };

  const closePrint = () => {
    setPrintOpen(false);
    setReport(null);
  };

  const runPdfAction = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (e: any) {
      Alert.alert("Couldn't open the PDF", e?.message ?? "Please try again.");
    }
  };

  const setDetailPaid = async (paid: boolean) => {
    if (!detail) return;
    setDetailBusy(true);
    try {
      await apiAdminSetOvertimeEntryPaid(detail.id, paid);
      setDetail(null);
      load(true);
    } catch (e: any) {
      Alert.alert("Update failed", e?.message ?? "Please try again.");
    } finally {
      setDetailBusy(false);
    }
  };

  const deleteDetail = () => {
    if (!detail) return;
    setConfirmDelete({ entries: [detail], fromDetail: true });
    setDetail(null);
  };

  const hasFilters = !!(searchText.trim() || filterSupervisor);
  const selectionCount = selectedVisible.length;

  return (
    <AuthStyleBackground>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Overtime
          </Text>
          <View style={styles.headerActions}>
            <Pressable
              style={[styles.headerBtn, { borderColor: colors.rowBorder }]}
              onPress={() => router.push("/(admin-stack)/overtime" as any)}
            >
              <Ionicons
                name="checkmark-done-outline"
                size={16}
                color={colors.textPrimary}
              />
              <Text
                style={[styles.headerBtnText, { color: colors.textPrimary }]}
              >
                Approvals
              </Text>
              {pendingRequests > 0 && (
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>
                    {pendingRequests > 99 ? "99+" : pendingRequests}
                  </Text>
                </View>
              )}
            </Pressable>
            <Pressable
              style={[styles.headerBtn, styles.addBtn]}
              onPress={() => setShowAdd(true)}
            >
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={[styles.headerBtnText, { color: "#fff" }]}>New</Text>
            </Pressable>
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
          <View
            style={[
              styles.searchBox,
              {
                borderColor: colors.rowBorder,
                backgroundColor: colors.inputBg,
              },
            ]}
          >
            <Ionicons name="search" size={18} color={colors.textSecondary} />
            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Search foreman, site or note…"
              placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
              style={[styles.searchInput, { color: colors.textPrimary }]}
              autoCapitalize="none"
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
          <FilterTrigger
            label={filterSupervisor ? filterSupervisor.name : "All Supervisors"}
            active={!!filterSupervisor}
            colors={colors}
            icon="people-outline"
            onPress={() => setPicker("supervisor")}
          />
          <FilterTrigger
            label={period.name}
            active={period.id !== periods[0].id}
            colors={colors}
            icon="calendar-outline"
            onPress={() => setPicker("period")}
          />
        </View>

        <View style={styles.filterBar}>
          <View style={[styles.segment, { borderColor: colors.rowBorder }]}>
            {(["workDate", "createdAt"] as const).map((value) => {
              const active = dateField === value;
              return (
                <Pressable
                  key={value}
                  onPress={() => setDateField(value)}
                  style={[
                    styles.segmentItem,
                    active && { backgroundColor: ACCENT },
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      { color: active ? "#fff" : colors.textSecondary },
                    ]}
                  >
                    {value === "workDate" ? "Day worked" : "Date added"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={[styles.segment, { borderColor: colors.rowBorder }]}>
            {(["UNPAID", "PAID", "ALL"] as const).map((value) => {
              const active = paidFilter === value;
              return (
                <Pressable
                  key={value}
                  onPress={() => setPaidFilter(value)}
                  style={[
                    styles.segmentItem,
                    active && { backgroundColor: ACCENT },
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      { color: active ? "#fff" : colors.textSecondary },
                    ]}
                  >
                    {value === "UNPAID"
                      ? "Unpaid"
                      : value === "PAID"
                        ? "Paid"
                        : "All"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <SearchablePickerModal
          visible={picker === "supervisor"}
          title="Filter by Supervisor"
          searchPlaceholder="Search supervisors…"
          allLabel="All Supervisors"
          options={supervisors}
          selectedId={filterSupervisor?.id ?? null}
          onSelect={setFilterSupervisor}
          onClose={() => setPicker(null)}
          colors={colors}
          isDark={isDark}
        />
        <SearchablePickerModal
          visible={picker === "period"}
          title="Period"
          searchPlaceholder="Search periods…"
          showAllOption={false}
          options={periods}
          selectedId={period.id}
          onSelect={(option) => {
            const next = periods.find((p) => p.id === option?.id);
            if (next) setPeriod(next);
          }}
          onClose={() => setPicker(null)}
          colors={colors}
          isDark={isDark}
        />

        <View style={styles.listHeadingRow}>
          <Pressable
            onPress={toggleAll}
            style={styles.selectAll}
            disabled={filtered.length === 0}
          >
            <Ionicons
              name={allSelected ? "checkbox" : "square-outline"}
              size={20}
              color={allSelected ? ACCENT : colors.textSecondary}
            />
            <Text style={[styles.selectAllText, { color: colors.textPrimary }]}>
              {allSelected ? "Deselect all" : "Select all"}
            </Text>
          </Pressable>
          <Text style={[styles.countText, { color: colors.textSecondary }]}>
            {filtered.length} entr{filtered.length === 1 ? "y" : "ies"}
          </Text>
        </View>

        {loading && !refreshing ? (
          <LoadingOverlay title="Loading overtime…" message="Please wait" />
        ) : error ? (
          <View style={styles.stateWrap}>
            <Ionicons name="alert-circle" size={48} color="#ef4444" />
            <Text style={[styles.errorText, { color: colors.textPrimary }]}>
              {error}
            </Text>
            <Pressable onPress={() => load()} style={styles.retryBtn}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.stateWrap}>
            <Ionicons name="time-outline" size={64} color={colors.emptyText} />
            <Text style={[styles.emptyText, { color: colors.emptyText }]}>
              {hasFilters
                ? "No overtime matches your filters"
                : paidFilter === "UNPAID"
                  ? "No unpaid overtime"
                  : "No overtime for this period"}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <EntryCard
                item={item}
                colors={colors}
                selected={selectedIds.has(item.id)}
                onToggle={() => toggle(item.id)}
                onPress={() => setDetail(item)}
              />
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => load(true)}
              />
            }
          />
        )}

        {selectionCount > 0 && (
          <View
            style={[
              styles.bottomBar,
              {
                backgroundColor: colors.barBg,
                borderTopColor: colors.rowBorder,
                paddingBottom: Math.max(insets.bottom, 12),
              },
            ]}
          >
            <View style={styles.bottomSummary}>
              <Text
                style={[
                  styles.bottomSummaryText,
                  { color: colors.textPrimary },
                ]}
              >
                {selectionCount} selected · {formatCurrency(selectedTotal)}
              </Text>
              <Pressable onPress={() => setSelectedIds(new Set())} hitSlop={6}>
                <Text style={styles.clearText}>Clear</Text>
              </Pressable>
            </View>
            {bulkBusy ? (
              <ActivityIndicator color={ACCENT} style={{ height: 44 }} />
            ) : (
              <View style={styles.bottomActions}>
                <Pressable
                  style={[
                    styles.bulkBtn,
                    { backgroundColor: PAID_COLOR, flex: 1 },
                  ]}
                  onPress={() => bulkSetPaid(true)}
                >
                  <Ionicons name="cash-outline" size={16} color="#fff" />
                  <Text style={styles.bulkBtnText}>Mark paid</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.bulkBtn,
                    styles.bulkBtnOutline,
                    { borderColor: colors.rowBorder },
                  ]}
                  onPress={() => bulkSetPaid(false)}
                >
                  <Text
                    style={[styles.bulkBtnText, { color: colors.textPrimary }]}
                  >
                    Unpaid
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.bulkBtn,
                    styles.bulkBtnOutline,
                    { borderColor: colors.rowBorder },
                  ]}
                  onPress={() => setPrintOpen(true)}
                  accessibilityLabel="Download PDF"
                >
                  <Ionicons
                    name="download-outline"
                    size={18}
                    color={colors.textPrimary}
                  />
                </Pressable>
                <Pressable
                  style={[styles.bulkBtn, { backgroundColor: "#dc2626" }]}
                  onPress={bulkDelete}
                  accessibilityLabel="Delete"
                >
                  <Ionicons name="trash-outline" size={16} color="#fff" />
                </Pressable>
              </View>
            )}
          </View>
        )}
      </View>

      <PrintOptionsModal
        visible={printOpen}
        count={selectionCount}
        columns={printColumns}
        printing={printing}
        report={report}
        colors={colors}
        onToggle={(id) =>
          setPrintColumns((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
              // Keep at least one column so the report isn't empty.
              if (next.size > 1) next.delete(id);
            } else next.add(id);
            return next;
          })
        }
        onReset={() => setPrintColumns(new Set(PRINT_COLUMNS.map((c) => c.id)))}
        onDownload={downloadReport}
        onOpen={() => report && runPdfAction(() => openPdf(report.uri))}
        onShare={() =>
          report &&
          runPdfAction(() => sharePdf(report.uri, "Share overtime report"))
        }
        onClose={closePrint}
      />

      <ConfirmDeleteModal
        entries={confirmDelete?.entries ?? null}
        deleting={deleting}
        colors={colors}
        onCancel={cancelDelete}
        onConfirm={runConfirmedDelete}
      />

      <EntryDetailModal
        entry={detail}
        busy={detailBusy}
        colors={colors}
        onClose={() => setDetail(null)}
        onSetPaid={setDetailPaid}
        onDelete={deleteDetail}
        onEdit={() => {
          setEditing(detail);
          setDetail(null);
        }}
      />

      <EntryFormModal
        visible={showAdd || !!editing}
        entry={editing}
        colors={colors}
        isDark={isDark}
        sites={sites}
        foremen={foremen}
        prices={prices}
        onClose={() => {
          setShowAdd(false);
          setEditing(null);
        }}
        onSaved={() => {
          setShowAdd(false);
          setEditing(null);
          load(true);
        }}
      />
    </AuthStyleBackground>
  );
}

function FilterTrigger({
  label,
  active,
  colors,
  icon,
  onPress,
}: {
  label: string;
  active: boolean;
  colors: Colors;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[
        styles.filterTrigger,
        { borderColor: colors.rowBorder, backgroundColor: colors.inputBg },
      ]}
      onPress={onPress}
    >
      {icon && <Ionicons name={icon} size={15} color={colors.textSecondary} />}
      <Text
        style={[
          styles.filterTriggerText,
          { color: active ? colors.textPrimary : colors.textSecondary },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
    </Pressable>
  );
}

function DetailRow({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: Colors;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
        {label}
      </Text>
      <Text style={[styles.detailValue, { color: colors.textPrimary }]}>
        {value}
      </Text>
    </View>
  );
}

function ConfirmDeleteModal({
  entries,
  deleting,
  colors,
  onCancel,
  onConfirm,
}: {
  entries: OvertimeEntryDto[] | null;
  deleting: boolean;
  colors: Colors;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const count = entries?.length ?? 0;
  const single = count === 1 ? entries![0] : null;
  const total = (entries ?? []).reduce((sum, e) => sum + e.totalCost, 0);
  const paidCount = (entries ?? []).filter((e) => e.paidAt).length;
  const foremen = Array.from(
    new Set((entries ?? []).map((e) => e.foremanName)),
  );

  return (
    <Modal
      visible={count > 0}
      transparent
      animationType="fade"
      onRequestClose={deleting ? undefined : onCancel}
    >
      <View style={styles.confirmOverlay}>
        <View style={[styles.confirmCard, { backgroundColor: colors.sheetBg }]}>
          <View style={styles.confirmIcon}>
            <Ionicons name="trash-outline" size={28} color="#dc2626" />
          </View>
          <Text style={[styles.confirmTitle, { color: colors.textPrimary }]}>
            Delete {count} overtime entr{count === 1 ? "y" : "ies"}?
          </Text>

          <View
            style={[styles.confirmSummary, { borderColor: colors.rowBorder }]}
          >
            {single ? (
              <>
                <Text
                  style={[styles.confirmMain, { color: colors.textPrimary }]}
                >
                  {single.foremanName}
                </Text>
                <Text
                  style={[styles.confirmLine, { color: colors.textSecondary }]}
                >
                  {siteLabel(single.siteCode, single.siteName)}
                </Text>
                <Text
                  style={[styles.confirmLine, { color: colors.textSecondary }]}
                >
                  {dateLabel(single.workDate)} · {single.numberOfEmployees} guy
                  {single.numberOfEmployees === 1 ? "" : "s"} ·{" "}
                  {single.hoursWorked} h
                </Text>
              </>
            ) : (
              <>
                <Text
                  style={[styles.confirmMain, { color: colors.textPrimary }]}
                >
                  {count} entries from {foremen.length} foreman
                  {foremen.length === 1 ? "" : "s"}
                </Text>
                <Text
                  style={[styles.confirmLine, { color: colors.textSecondary }]}
                  numberOfLines={2}
                >
                  {foremen.slice(0, 3).join(", ")}
                  {foremen.length > 3 ? ` +${foremen.length - 3} more` : ""}
                </Text>
              </>
            )}
            <Text style={styles.confirmAmount}>{formatCurrency(total)}</Text>
          </View>

          {paidCount > 0 && (
            <View style={styles.confirmWarning}>
              <Ionicons name="warning-outline" size={16} color="#b45309" />
              <Text style={styles.confirmWarningText}>
                {single
                  ? "This entry is already marked paid."
                  : `${paidCount} of these ${paidCount === 1 ? "is" : "are"} already marked paid.`}
              </Text>
            </View>
          )}

          <Text style={[styles.confirmNote, { color: colors.textSecondary }]}>
            This cannot be undone.
          </Text>

          <View style={styles.confirmActions}>
            <Pressable
              style={[
                styles.confirmBtn,
                styles.bulkBtnOutline,
                { borderColor: colors.rowBorder },
              ]}
              onPress={onCancel}
              disabled={deleting}
            >
              <Text
                style={[styles.confirmBtnText, { color: colors.textPrimary }]}
              >
                Cancel
              </Text>
            </Pressable>
            <Pressable
              style={[styles.confirmBtn, { backgroundColor: "#dc2626" }]}
              onPress={onConfirm}
              disabled={deleting}
            >
              {deleting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[styles.confirmBtnText, { color: "#fff" }]}>
                  Delete
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function PrintOptionsModal({
  visible,
  count,
  columns,
  printing,
  report,
  colors,
  onToggle,
  onReset,
  onDownload,
  onOpen,
  onShare,
  onClose,
}: {
  visible: boolean;
  count: number;
  columns: Set<PrintColumnId>;
  printing: boolean;
  report: { filename: string; saved: boolean } | null;
  colors: Colors;
  onToggle: (id: PrintColumnId) => void;
  onReset: () => void;
  onDownload: () => void;
  onOpen: () => void;
  onShare: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.sheetOverlay} onPress={onClose} />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.sheetBg,
            paddingBottom: insets.bottom + 16,
          },
        ]}
      >
        <View style={styles.sheetHandle} />
        {report ? (
          <View>
            <View style={styles.readyHeader}>
              <Ionicons name="checkmark-circle" size={40} color={ACCENT} />
              <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
                Report ready
              </Text>
              <Text
                style={[styles.readyText, { color: colors.textSecondary }]}
                numberOfLines={2}
              >
                {report.saved
                  ? `Saved to your phone as ${report.filename}`
                  : report.filename}
              </Text>
              <Text style={[styles.readyHint, { color: colors.textSecondary }]}>
                Open it to view or print, or share it to WhatsApp or email.
              </Text>
            </View>
            <View style={styles.sheetActions}>
              <Pressable
                style={[
                  styles.bulkBtn,
                  { flex: 1, height: 48, backgroundColor: ACCENT },
                ]}
                onPress={onOpen}
              >
                <Ionicons name="document-text-outline" size={18} color="#fff" />
                <Text style={styles.bulkBtnText}>Open</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.bulkBtn,
                  styles.bulkBtnOutline,
                  { flex: 1, height: 48, borderColor: colors.rowBorder },
                ]}
                onPress={onShare}
              >
                <Ionicons
                  name="share-outline"
                  size={18}
                  color={colors.textPrimary}
                />
                <Text
                  style={[styles.bulkBtnText, { color: colors.textPrimary }]}
                >
                  Share
                </Text>
              </Pressable>
            </View>
            <Pressable onPress={onClose} style={styles.doneBtn} hitSlop={8}>
              <Text style={[styles.doneText, { color: colors.textSecondary }]}>
                Done
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.sheetHeader}>
              <View>
                <Text
                  style={[styles.sheetTitle, { color: colors.textPrimary }]}
                >
                  Print columns
                </Text>
                <Text style={[styles.subText, { color: colors.textSecondary }]}>
                  Choose what appears on the printed report.
                </Text>
              </View>
              <Pressable onPress={onReset} hitSlop={8}>
                <Text style={styles.resetText}>Reset</Text>
              </Pressable>
            </View>

            <View style={styles.columnGrid}>
              {PRINT_COLUMNS.map((c) => {
                const on = columns.has(c.id);
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => onToggle(c.id)}
                    style={[
                      styles.columnChip,
                      on
                        ? {
                            backgroundColor: `${ACCENT}1f`,
                            borderColor: ACCENT,
                          }
                        : { borderColor: colors.rowBorder },
                    ]}
                  >
                    <Ionicons
                      name={on ? "checkbox" : "square-outline"}
                      size={18}
                      color={on ? ACCENT : colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.columnChipText,
                        { color: colors.textPrimary },
                      ]}
                    >
                      {c.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              style={[styles.saveBtn, printing && { opacity: 0.6 }]}
              onPress={onDownload}
              disabled={printing}
            >
              {printing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <View style={styles.printBtnRow}>
                  <Ionicons name="download-outline" size={18} color="#fff" />
                  <Text style={styles.saveBtnText}>
                    Download PDF ({count} entr{count === 1 ? "y" : "ies"})
                  </Text>
                </View>
              )}
            </Pressable>
          </>
        )}
      </View>
    </Modal>
  );
}

function EntryDetailModal({
  entry,
  busy,
  colors,
  onClose,
  onSetPaid,
  onDelete,
  onEdit,
}: {
  entry: OvertimeEntryDto | null;
  busy: boolean;
  colors: Colors;
  onClose: () => void;
  onSetPaid: (paid: boolean) => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const insets = useSafeAreaInsets();
  const paid = !!entry?.paidAt;

  return (
    <Modal
      visible={!!entry}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.sheetOverlay} onPress={onClose} />
      {entry && (
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.sheetBg,
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
              {formatCurrency(entry.totalCost)}
            </Text>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: `${paid ? PAID_COLOR : UNPAID_COLOR}1f` },
              ]}
            >
              <Text
                style={[
                  styles.statusText,
                  { color: paid ? PAID_COLOR : UNPAID_COLOR },
                ]}
              >
                {paid ? "Paid" : "Unpaid"}
              </Text>
            </View>
          </View>

          <DetailRow
            label="Foreman"
            value={entry.foremanName}
            colors={colors}
          />
          <DetailRow
            label="Site"
            value={siteLabel(entry.siteCode, entry.siteName)}
            colors={colors}
          />
          {entry.supervisorName && (
            <DetailRow
              label="Supervisor"
              value={entry.supervisorName}
              colors={colors}
            />
          )}
          <DetailRow
            label="Date"
            value={dateLabel(entry.workDate)}
            colors={colors}
          />
          <DetailRow
            label="Guys × hours"
            value={`${entry.numberOfEmployees} × ${entry.hoursWorked} h`}
            colors={colors}
          />
          <DetailRow
            label="Rate"
            value={`${formatCurrency(entry.rateAtCreation)}/h (${entry.overtimePriceLabel})`}
            colors={colors}
          />
          {entry.paidAt && (
            <DetailRow
              label="Paid"
              value={`${new Date(entry.paidAt).toLocaleDateString()}${entry.paidBy ? ` by ${entry.paidBy}` : ""}`}
              colors={colors}
            />
          )}
          <DetailRow
            label="Added"
            value={`${addedLabel(entry.createdAt)}${entry.createdBy ? ` by ${entry.createdBy}` : ""}`}
            colors={colors}
          />
          {entry.note ? (
            <DetailRow label="Note" value={entry.note} colors={colors} />
          ) : null}

          {busy ? (
            <ActivityIndicator
              color={ACCENT}
              style={{ marginTop: 18, height: 48 }}
            />
          ) : (
            <View style={styles.sheetActions}>
              <Pressable
                style={[
                  styles.bulkBtn,
                  { flex: 1, height: 48 },
                  paid
                    ? [styles.bulkBtnOutline, { borderColor: colors.rowBorder }]
                    : { backgroundColor: PAID_COLOR },
                ]}
                onPress={() => onSetPaid(!paid)}
              >
                <Ionicons
                  name={paid ? "arrow-undo-outline" : "cash-outline"}
                  size={16}
                  color={paid ? colors.textPrimary : "#fff"}
                />
                <Text
                  style={[
                    styles.bulkBtnText,
                    paid && { color: colors.textPrimary },
                  ]}
                >
                  {paid ? "Mark unpaid" : "Mark paid"}
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.bulkBtn,
                  styles.bulkBtnOutline,
                  { borderColor: colors.rowBorder, height: 48 },
                ]}
                onPress={onEdit}
              >
                <Ionicons
                  name="create-outline"
                  size={16}
                  color={colors.textPrimary}
                />
                <Text
                  style={[styles.bulkBtnText, { color: colors.textPrimary }]}
                >
                  Edit
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.bulkBtn,
                  { backgroundColor: "#dc2626", height: 48 },
                ]}
                onPress={onDelete}
                accessibilityLabel="Delete"
              >
                <Ionicons name="trash-outline" size={16} color="#fff" />
              </Pressable>
            </View>
          )}
        </View>
      )}
    </Modal>
  );
}

function EntryFormModal({
  visible,
  entry,
  colors,
  isDark,
  sites,
  foremen,
  prices,
  onClose,
  onSaved,
}: {
  visible: boolean;
  /** The entry being edited; null when adding a new one. */
  entry: OvertimeEntryDto | null;
  colors: Colors;
  isDark: boolean;
  sites: SearchablePickerOption[];
  foremen: SearchablePickerOption[];
  prices: OvertimePriceDto[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const insets = useSafeAreaInsets();
  const dateOptions = useMemo(() => {
    const today = localISO(new Date());
    const options = Array.from({ length: 60 }, (_, i) => {
      const iso = shiftISO(today, -i);
      return {
        id: iso,
        name: i === 0 ? `Today, ${dateLabel(iso)}` : dateLabel(iso),
      };
    });
    // An older entry keeps its own date selectable.
    if (entry && !options.some((o) => o.id === entry.workDate)) {
      options.push({ id: entry.workDate, name: dateLabel(entry.workDate) });
    }
    return options;
  }, [entry]);

  // The entry's rate may since have been deactivated; keep it choosable.
  const priceOptions = useMemo(() => {
    if (!entry || prices.some((p) => p.id === entry.overtimePriceId)) {
      return prices;
    }
    return [
      ...prices,
      {
        id: entry.overtimePriceId,
        label: entry.overtimePriceLabel,
        rate: entry.rateAtCreation,
        isActive: false,
      },
    ];
  }, [entry, prices]);

  const [site, setSite] = useState<SearchablePickerOption | null>(null);
  const [foreman, setForeman] = useState<SearchablePickerOption | null>(null);
  const [priceId, setPriceId] = useState<string | null>(null);
  const [workDate, setWorkDate] = useState(dateOptions[0].id);
  const [guys, setGuys] = useState("");
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");
  const [picker, setPicker] = useState<
    "site" | "foreman" | "price" | "date" | null
  >(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (entry) {
      setSite({ id: entry.siteId, name: entry.siteName, code: entry.siteCode });
      setForeman({ id: entry.foremanId, name: entry.foremanName });
      setPriceId(entry.overtimePriceId);
      setWorkDate(entry.workDate);
      setGuys(String(entry.numberOfEmployees));
      setHours(String(entry.hoursWorked));
      setNote(entry.note ?? "");
      return;
    }
    setSite(null);
    setForeman(null);
    setPriceId(prices[0]?.id ?? null);
    setWorkDate(dateOptions[0].id);
    setGuys("");
    setHours("");
    setNote("");
  }, [visible, entry, prices, dateOptions]);

  const price = priceOptions.find((p) => p.id === priceId) ?? null;
  const guysNum = parseInt(guys, 10);
  const hoursNum = parseFloat(hours.replace(",", "."));
  const total =
    price && guysNum > 0 && hoursNum > 0
      ? price.rate * guysNum * hoursNum
      : null;
  const canSave =
    !!site && !!foreman && !!price && guysNum >= 1 && hoursNum > 0;

  const save = async () => {
    if (!canSave || !site || !foreman || !price) return;
    setSaving(true);
    const input = {
      siteId: site.id,
      foremanId: foreman.id,
      overtimePriceId: price.id,
      workDate,
      numberOfEmployees: guysNum,
      hoursWorked: hoursNum,
    };
    try {
      if (entry) {
        await apiAdminUpdateOvertimeEntry(entry.id, {
          ...input,
          note: note.trim() || null,
        });
      } else {
        await apiAdminCreateOvertimeEntry({
          ...input,
          note: note.trim() || undefined,
        });
      }
      onSaved();
    } catch (e: any) {
      Alert.alert(
        entry ? "Couldn't save changes" : "Couldn't add overtime",
        e?.message ?? "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const fieldStyle = [
    styles.formField,
    { borderColor: colors.rowBorder, backgroundColor: colors.inputBg },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={styles.sheetOverlay} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            styles.formSheet,
            {
              backgroundColor: colors.sheetBg,
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
              {entry ? "Edit overtime" : "New overtime"}
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>
              Site
            </Text>
            <Pressable style={fieldStyle} onPress={() => setPicker("site")}>
              <Text
                style={[
                  styles.formFieldText,
                  { color: site ? colors.textPrimary : colors.textSecondary },
                ]}
                numberOfLines={1}
              >
                {site ? siteLabel(site.code, site.name) : "Choose a site"}
              </Text>
              <Ionicons
                name="chevron-down"
                size={16}
                color={colors.textSecondary}
              />
            </Pressable>

            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>
              Foreman
            </Text>
            <Pressable style={fieldStyle} onPress={() => setPicker("foreman")}>
              <Text
                style={[
                  styles.formFieldText,
                  {
                    color: foreman ? colors.textPrimary : colors.textSecondary,
                  },
                ]}
                numberOfLines={1}
              >
                {foreman ? foreman.name : "Choose a foreman"}
              </Text>
              <Ionicons
                name="chevron-down"
                size={16}
                color={colors.textSecondary}
              />
            </Pressable>

            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>
              Date
            </Text>
            <Pressable style={fieldStyle} onPress={() => setPicker("date")}>
              <Text
                style={[styles.formFieldText, { color: colors.textPrimary }]}
              >
                {dateLabel(workDate)}
              </Text>
              <Ionicons
                name="calendar-outline"
                size={16}
                color={colors.textSecondary}
              />
            </Pressable>

            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>
              Rate
            </Text>
            <Pressable style={fieldStyle} onPress={() => setPicker("price")}>
              <Text
                style={[
                  styles.formFieldText,
                  { color: price ? colors.textPrimary : colors.textSecondary },
                ]}
                numberOfLines={1}
              >
                {price
                  ? `${price.label} · ${formatCurrency(price.rate)}/h`
                  : "No active overtime rate set up"}
              </Text>
              <Ionicons
                name="chevron-down"
                size={16}
                color={colors.textSecondary}
              />
            </Pressable>

            <View style={styles.formRow}>
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.formLabel, { color: colors.textSecondary }]}
                >
                  Guys
                </Text>
                <TextInput
                  value={guys}
                  onChangeText={(t) => setGuys(t.replace(/[^0-9]/g, ""))}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                  style={[
                    fieldStyle,
                    styles.formInput,
                    { color: colors.textPrimary },
                  ]}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.formLabel, { color: colors.textSecondary }]}
                >
                  Hours
                </Text>
                <TextInput
                  value={hours}
                  onChangeText={(t) => setHours(t.replace(/[^0-9.,]/g, ""))}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                  style={[
                    fieldStyle,
                    styles.formInput,
                    { color: colors.textPrimary },
                  ]}
                />
              </View>
            </View>

            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>
              Note (optional)
            </Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Anything the office should know"
              placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
              style={[
                fieldStyle,
                styles.formInput,
                styles.noteInput,
                { color: colors.textPrimary },
              ]}
              multiline
            />

            <View style={[styles.totalRow, { borderColor: colors.rowBorder }]}>
              <Text
                style={[styles.totalLabel, { color: colors.textSecondary }]}
              >
                Total
              </Text>
              <Text style={[styles.totalValue, { color: colors.textPrimary }]}>
                {total != null ? formatCurrency(total) : "-"}
              </Text>
            </View>

            <Pressable
              style={[styles.saveBtn, (!canSave || saving) && { opacity: 0.5 }]}
              onPress={save}
              disabled={!canSave || saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>
                  {entry ? "Save changes" : "Add overtime"}
                </Text>
              )}
            </Pressable>
          </ScrollView>
        </View>

        <SearchablePickerModal
          visible={picker === "site"}
          title="Choose a site"
          searchPlaceholder="Search sites or job number…"
          showAllOption={false}
          options={sites}
          selectedId={site?.id ?? null}
          onSelect={setSite}
          onClose={() => setPicker(null)}
          colors={colors}
          isDark={isDark}
        />
        <SearchablePickerModal
          visible={picker === "foreman"}
          title="Choose a foreman"
          searchPlaceholder="Search foremen…"
          showAllOption={false}
          options={foremen}
          selectedId={foreman?.id ?? null}
          onSelect={setForeman}
          onClose={() => setPicker(null)}
          colors={colors}
          isDark={isDark}
        />
        <SearchablePickerModal
          visible={picker === "date"}
          title="Choose a date"
          searchPlaceholder="Search dates…"
          showAllOption={false}
          options={dateOptions}
          selectedId={workDate}
          onSelect={(option) => option && setWorkDate(option.id)}
          onClose={() => setPicker(null)}
          colors={colors}
          isDark={isDark}
        />
        <SearchablePickerModal
          visible={picker === "price"}
          title="Choose a rate"
          searchPlaceholder="Search rates…"
          showAllOption={false}
          options={priceOptions.map((p) => ({
            id: p.id,
            name: `${p.label} · ${formatCurrency(p.rate)}/h`,
          }))}
          selectedId={priceId}
          onSelect={(option) => option && setPriceId(option.id)}
          onClose={() => setPicker(null)}
          colors={colors}
          isDark={isDark}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
  },
  title: { fontSize: 18, fontWeight: "900" },
  headerActions: { flexDirection: "row", gap: 8 },
  headerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 5,
    borderWidth: 1,
  },
  addBtn: { backgroundColor: ACCENT, borderColor: ACCENT },
  headerBtnText: { fontSize: 13, fontWeight: "800" },
  countBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
  },
  countBadgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },

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
    paddingBottom: 10,
    gap: 8,
  },
  filterTrigger: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 5,
    borderWidth: 1,
  },
  filterTriggerText: { flex: 1, fontSize: 13, fontWeight: "700" },
  segment: {
    flex: 1,
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 5,
    overflow: "hidden",
    height: 40,
  },
  segmentItem: { flex: 1, alignItems: "center", justifyContent: "center" },
  segmentText: { fontSize: 12, fontWeight: "800" },

  listHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginTop: 2,
    marginBottom: 10,
  },
  selectAll: { flexDirection: "row", alignItems: "center", gap: 6 },
  selectAllText: { fontSize: 14, fontWeight: "800" },
  countText: { fontSize: 13, fontWeight: "700" },

  listContent: { paddingHorizontal: 16, paddingBottom: 32 },

  card: { padding: 14, borderWidth: 1, borderRadius: 5, marginBottom: 12 },
  cardTopRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  checkWrap: { paddingTop: 11 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
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
  subText: { fontSize: 11, fontWeight: "600", marginTop: 1 },
  siteRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  siteText: { flex: 1, fontSize: 13, fontWeight: "800" },
  cardRight: { alignItems: "flex-end", gap: 6, flexShrink: 0 },
  amount: { fontSize: 15, fontWeight: "900" },
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
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    gap: 8,
  },
  footerText: { fontSize: 12, fontWeight: "700" },
  addedText: { fontSize: 11, fontWeight: "600", marginTop: 2 },
  sourceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(107,114,128,0.15)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  sourceText: { fontSize: 10, fontWeight: "800", color: "#6b7280" },

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

  bottomBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    gap: 10,
  },
  bottomSummary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  bottomSummaryText: { fontSize: 14, fontWeight: "800" },
  clearText: { fontSize: 13, fontWeight: "800", color: "#dc2626" },
  bottomActions: { flexDirection: "row", gap: 8 },
  bulkBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 5,
  },
  bulkBtnOutline: { borderWidth: 1, backgroundColor: "transparent" },
  bulkBtnText: { color: "#fff", fontSize: 14, fontWeight: "900" },

  sheetOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  formSheet: { maxHeight: "90%" },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(148,163,184,0.5)",
    marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sheetTitle: { fontSize: 20, fontWeight: "900" },
  sheetActions: { flexDirection: "row", gap: 10, marginTop: 18 },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 7,
  },
  detailLabel: { fontSize: 13, fontWeight: "600" },
  detailValue: { flex: 1, fontSize: 13, fontWeight: "800", textAlign: "right" },

  formLabel: {
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 6,
    marginTop: 10,
  },
  formField: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 5,
    borderWidth: 1,
  },
  formFieldText: { flex: 1, fontSize: 14, fontWeight: "700" },
  formInput: { fontSize: 15, fontWeight: "700" },
  noteInput: { height: 72, paddingTop: 10, textAlignVertical: "top" },
  formRow: { flexDirection: "row", gap: 10 },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    marginTop: 16,
    paddingTop: 12,
  },
  totalLabel: { fontSize: 14, fontWeight: "700" },
  totalValue: { fontSize: 20, fontWeight: "900" },
  saveBtn: {
    marginTop: 16,
    height: 50,
    borderRadius: 5,
    backgroundColor: ACCENT,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "900" },
  printBtnRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  confirmOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    padding: 24,
  },
  confirmCard: { borderRadius: 14, padding: 20, alignItems: "center" },
  confirmIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(220,38,38,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  confirmTitle: { fontSize: 18, fontWeight: "900", textAlign: "center" },
  confirmSummary: {
    alignSelf: "stretch",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginTop: 14,
    alignItems: "center",
    gap: 2,
  },
  confirmMain: { fontSize: 15, fontWeight: "800", textAlign: "center" },
  confirmLine: { fontSize: 12, fontWeight: "600", textAlign: "center" },
  confirmAmount: {
    fontSize: 20,
    fontWeight: "900",
    color: "#dc2626",
    marginTop: 6,
  },
  confirmWarning: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(245,158,11,0.15)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 10,
  },
  confirmWarningText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    color: "#b45309",
  },
  confirmNote: { fontSize: 12, fontWeight: "600", marginTop: 10 },
  confirmActions: {
    alignSelf: "stretch",
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  confirmBtn: {
    flex: 1,
    height: 48,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmBtnText: { fontSize: 15, fontWeight: "900" },
  readyHeader: { alignItems: "center", gap: 6, paddingVertical: 8 },
  readyText: { fontSize: 13, fontWeight: "700", textAlign: "center" },
  readyHint: { fontSize: 12, fontWeight: "500", textAlign: "center" },
  doneBtn: { alignSelf: "center", marginTop: 14, padding: 6 },
  doneText: { fontSize: 14, fontWeight: "800" },
  resetText: { fontSize: 13, fontWeight: "800", color: ACCENT },
  columnGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  columnChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    width: "48%",
    paddingHorizontal: 10,
    height: 42,
    borderRadius: 5,
    borderWidth: 1,
  },
  columnChipText: { fontSize: 14, fontWeight: "700" },
});
