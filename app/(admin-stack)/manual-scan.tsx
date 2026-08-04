import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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

import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import { GlassCard } from "@/components/GlassCard";
import LoadingOverlay from "@/components/LoadingOverlay";
import {
  apiAdminCreateManualScans,
  apiAdminManualScanScannedIds,
  apiAdminSiteForemen,
  apiAdminSites,
  apiEmployees,
  type ApiEmployee,
  type AdminManualScanResultDto,
  type AdminSiteListItemDto,
  type SiteForemanAssignmentDto,
} from "@/lib/apiClient";
import { useTheme } from "@/lib/themeContext";

const themes = {
  dark: {
    textPrimary: "#e5e7eb",
    textSecondary: "#94a3b8",
    inputBg: "rgba(15,23,42,0.85)",
    inputBorder: "rgba(148,163,184,0.25)",
    chipBg: "rgba(255,255,255,0.08)",
    sheetBg: "#1e293b",
    rowBorder: "rgba(148,163,184,0.15)",
  },
  light: {
    textPrimary: "#111",
    textSecondary: "#666",
    inputBg: "rgba(255,255,255,0.9)",
    inputBorder: "rgba(0,0,0,0.1)",
    chipBg: "rgba(0,0,0,0.06)",
    sheetBg: "#fff",
    rowBorder: "rgba(0,0,0,0.08)",
  },
};

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function recentDateOptions(days: number) {
  const out: { value: string; label: string }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const label =
      i === 0
        ? "Today"
        : i === 1
          ? "Yesterday"
          : d.toLocaleDateString("en-US", {
              weekday: "short",
              day: "numeric",
              month: "short",
            });
    out.push({ value: toDateStr(d), label });
  }
  return out;
}

type PickerKind = "site" | "foreman" | "dates" | "employees" | null;

export default function AdminManualScanScreen() {
  const { theme } = useTheme();
  const colors = themes[theme];

  const [sites, setSites] = useState<AdminSiteListItemDto[]>([]);
  const [employees, setEmployees] = useState<ApiEmployee[]>([]);
  const [foremen, setForemen] = useState<SiteForemanAssignmentDto[]>([]);

  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [selectedForemanId, setSelectedForemanId] = useState("");
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [workDates, setWorkDates] = useState<string[]>([]);
  const [reason, setReason] = useState("");

  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loadingForemen, setLoadingForemen] = useState(false);
  const [loadingScannedIds, setLoadingScannedIds] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [scannedByDate, setScannedByDate] = useState<
    Record<string, string[]>
  >({});
  const [recentScans, setRecentScans] = useState<AdminManualScanResultDto[]>(
    [],
  );

  const [activePicker, setActivePicker] = useState<PickerKind>(null);

  const load = useCallback(async () => {
    setLoadingOptions(true);
    try {
      const [sitesRes, empRes] = await Promise.all([
        apiAdminSites(),
        apiEmployees(),
      ]);
      setSites(sitesRes.sites ?? []);
      setEmployees(empRes.employees ?? []);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to load sites/employees.");
    } finally {
      setLoadingOptions(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selectedSiteId) {
      setForemen([]);
      setSelectedForemanId("");
      return;
    }
    let cancelled = false;
    async function loadForemen() {
      setLoadingForemen(true);
      setSelectedForemanId("");
      try {
        const res = await apiAdminSiteForemen(selectedSiteId);
        if (cancelled) return;
        const list = res.foremen ?? [];
        setForemen(list);
        if (list.length === 1) setSelectedForemanId(list[0].foremanId);
      } catch (e: any) {
        if (!cancelled) {
          Alert.alert("Error", e?.message ?? "Failed to load foremen.");
        }
      } finally {
        if (!cancelled) setLoadingForemen(false);
      }
    }
    loadForemen();
    return () => {
      cancelled = true;
    };
  }, [selectedSiteId]);

  useEffect(() => {
    if (workDates.length === 0) {
      setScannedByDate({});
      return;
    }
    let cancelled = false;
    async function loadScanned() {
      setLoadingScannedIds(true);
      try {
        const entries = await Promise.all(
          workDates.map(async (date) => {
            try {
              const res = await apiAdminManualScanScannedIds(date);
              return [date, res.scannedEmployeeIds ?? []] as const;
            } catch {
              return [date, []] as const;
            }
          }),
        );
        if (!cancelled) setScannedByDate(Object.fromEntries(entries));
      } finally {
        if (!cancelled) setLoadingScannedIds(false);
      }
    }
    loadScanned();
    return () => {
      cancelled = true;
    };
  }, [workDates]);

  const selectedSite = sites.find((s) => s.id === selectedSiteId);
  const selectedForeman = foremen.find(
    (f) => f.foremanId === selectedForemanId,
  );
  const selectedEmployees = employees.filter((e) =>
    selectedEmployeeIds.includes(e.id),
  );

  const scannedEmployeeIdSet = useMemo(
    () => new Set(Object.values(scannedByDate).flat()),
    [scannedByDate],
  );

  const availableEmployees = useMemo(() => {
    if (workDates.length === 0) return employees;
    return employees.filter((e) =>
      workDates.some((date) => !(scannedByDate[date] ?? []).includes(e.id)),
    );
  }, [employees, workDates, scannedByDate]);

  const dateOptions = useMemo(() => recentDateOptions(30), []);

  const toggleEmployee = useCallback((id: string) => {
    setSelectedEmployeeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const toggleDate = useCallback((value: string) => {
    setWorkDates((prev) =>
      prev.includes(value)
        ? prev.filter((d) => d !== value)
        : [...prev, value].sort(),
    );
  }, []);

  const closePicker = useCallback(() => {
    setActivePicker(null);
  }, []);

  const canSubmit =
    !!selectedSiteId &&
    !!selectedForemanId &&
    selectedEmployeeIds.length > 0 &&
    workDates.length > 0 &&
    !submitting;

  async function handleSubmit() {
    if (!selectedSiteId) return Alert.alert("Missing site", "Please select a site.");
    if (!selectedForemanId)
      return Alert.alert("Missing foreman", "Please select a foreman.");
    if (selectedEmployeeIds.length === 0)
      return Alert.alert("Missing employees", "Please select at least one employee.");
    if (workDates.length === 0)
      return Alert.alert("Missing dates", "Please select at least one date.");

    setSubmitting(true);
    try {
      const res = await apiAdminCreateManualScans({
        siteId: selectedSiteId,
        foremanId: selectedForemanId,
        employeeIds: selectedEmployeeIds,
        workDates,
        reason: reason.trim() || undefined,
      });

      const created = res.scans ?? [];
      const skippedCount = res.skipped?.length ?? 0;
      Alert.alert(
        "Done",
        skippedCount > 0
          ? `${created.length} scan${created.length === 1 ? "" : "s"} created, ${skippedCount} skipped.`
          : `${created.length} scan${created.length === 1 ? "" : "s"} created.`,
      );

      setRecentScans((prev) => [...created, ...prev].slice(0, 10));
      setScannedByDate((prev) => {
        const next = { ...prev };
        for (const scan of created) {
          const date = scan.workDate;
          const empId = scan.employee?.id;
          if (!date || !empId) continue;
          next[date] = Array.from(new Set([...(next[date] ?? []), empId]));
        }
        return next;
      });
      setSelectedEmployeeIds([]);
      setReason("");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to create scans.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingOptions) {
    return (
      <AuthStyleBackground>
        <LoadingOverlay title="Loading…" message="Please wait" />
      </AuthStyleBackground>
    );
  }

  return (
    <AuthStyleBackground>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Manual Scan
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Create attendance scans when a foreman forgot to scan employees.
          </Text>
        </View>

        <GlassCard style={{ gap: 16 }}>
          {/* Site */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>
              Site *
            </Text>
            <Pressable
              onPress={() => setActivePicker("site")}
              style={[
                styles.pickerRow,
                {
                  borderColor: colors.inputBorder,
                  backgroundColor: colors.inputBg,
                },
              ]}
            >
              <Text
                style={[
                  styles.pickerRowText,
                  {
                    color: selectedSite
                      ? colors.textPrimary
                      : colors.textSecondary,
                  },
                ]}
                numberOfLines={1}
              >
                {selectedSite
                  ? `${selectedSite.code ? selectedSite.code + " - " : ""}${selectedSite.name}`
                  : "Select a site…"}
              </Text>
              <Ionicons
                name="chevron-down"
                size={16}
                color={colors.textSecondary}
              />
            </Pressable>
          </View>

          {/* Foreman */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>
              Foreman *
            </Text>
            {loadingForemen ? (
              <View style={styles.inlineLoading}>
                <ActivityIndicator size="small" color="#3b82f6" />
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                  Loading foremen…
                </Text>
              </View>
            ) : selectedSiteId && foremen.length === 0 ? (
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                No foremen assigned to this site.
              </Text>
            ) : (
              <Pressable
                onPress={() => selectedSiteId && setActivePicker("foreman")}
                disabled={!selectedSiteId}
                style={[
                  styles.pickerRow,
                  {
                    borderColor: colors.inputBorder,
                    backgroundColor: colors.inputBg,
                    opacity: selectedSiteId ? 1 : 0.5,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.pickerRowText,
                    {
                      color: selectedForeman
                        ? colors.textPrimary
                        : colors.textSecondary,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {selectedForeman ? selectedForeman.name : "Select foreman…"}
                </Text>
                <Ionicons
                  name="chevron-down"
                  size={16}
                  color={colors.textSecondary}
                />
              </Pressable>
            )}
          </View>

          {/* Work Dates */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>
              Work Dates *
            </Text>
            <Pressable
              onPress={() => setActivePicker("dates")}
              style={[
                styles.pickerRow,
                {
                  borderColor: colors.inputBorder,
                  backgroundColor: colors.inputBg,
                },
              ]}
            >
              <Text
                style={[
                  styles.pickerRowText,
                  {
                    color:
                      workDates.length > 0
                        ? colors.textPrimary
                        : colors.textSecondary,
                  },
                ]}
              >
                {workDates.length > 0
                  ? `${workDates.length} date${workDates.length === 1 ? "" : "s"} selected`
                  : "Select dates…"}
              </Text>
              <Ionicons name="calendar" size={16} color={colors.textSecondary} />
            </Pressable>
            {workDates.length > 0 && (
              <View style={styles.chipWrap}>
                {workDates.map((d) => (
                  <Pressable
                    key={d}
                    onPress={() => toggleDate(d)}
                    style={[styles.chip, { backgroundColor: colors.chipBg }]}
                  >
                    <Text style={[styles.chipText, { color: colors.textPrimary }]}>
                      {d}
                    </Text>
                    <Ionicons name="close" size={12} color={colors.textSecondary} />
                  </Pressable>
                ))}
              </View>
            )}
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              Existing scans are skipped automatically.
            </Text>
          </View>

          {/* Employees */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>
              Employees *{" "}
              {workDates.length > 0 && !loadingScannedIds
                ? `(${availableEmployees.length} available${
                    scannedEmployeeIdSet.size > 0
                      ? `, ${scannedEmployeeIdSet.size} already scanned`
                      : ""
                  })`
                : loadingScannedIds
                  ? "(loading…)"
                  : ""}
            </Text>
            <Pressable
              onPress={() => setActivePicker("employees")}
              style={[
                styles.pickerRow,
                {
                  borderColor: colors.inputBorder,
                  backgroundColor: colors.inputBg,
                },
              ]}
            >
              <Text
                style={[
                  styles.pickerRowText,
                  {
                    color:
                      selectedEmployees.length > 0
                        ? colors.textPrimary
                        : colors.textSecondary,
                  },
                ]}
              >
                {selectedEmployees.length > 0
                  ? `${selectedEmployees.length} employee${selectedEmployees.length === 1 ? "" : "s"} selected`
                  : "Select employees…"}
              </Text>
              <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
            </Pressable>
            {selectedEmployees.length > 0 && (
              <View style={styles.chipWrap}>
                {selectedEmployees.map((e) => (
                  <Pressable
                    key={e.id}
                    onPress={() => toggleEmployee(e.id)}
                    style={[styles.chip, { backgroundColor: colors.chipBg }]}
                  >
                    <Text
                      style={[styles.chipText, { color: colors.textPrimary }]}
                      numberOfLines={1}
                    >
                      {e.fullName}
                    </Text>
                    <Ionicons name="close" size={12} color={colors.textSecondary} />
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          {/* Reason */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>
              Reason (optional)
            </Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="e.g. Foreman forgot to scan the employees"
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={2}
              style={[
                styles.textArea,
                {
                  color: colors.textPrimary,
                  borderColor: colors.inputBorder,
                  backgroundColor: colors.inputBg,
                },
              ]}
            />
          </View>

          <Pressable
            onPress={handleSubmit}
            disabled={!canSubmit}
            style={[styles.submitBtn, !canSubmit && { opacity: 0.5 }]}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="person-add" size={16} color="#fff" />
                <Text style={styles.submitBtnText}>
                  Create{" "}
                  {selectedEmployeeIds.length * workDates.length || ""} Manual
                  Scan
                  {selectedEmployeeIds.length * workDates.length === 1
                    ? ""
                    : "s"}
                </Text>
              </>
            )}
          </Pressable>
        </GlassCard>

        {recentScans.length > 0 && (
          <GlassCard style={{ marginTop: 16, gap: 10 }}>
            <Text style={[styles.recentTitle, { color: colors.textPrimary }]}>
              Recently Created Scans
            </Text>
            {recentScans.map((scan, idx) => (
              <View
                key={`${scan.id}-${idx}`}
                style={[styles.recentRow, { borderColor: colors.rowBorder }]}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.recentName, { color: colors.textPrimary }]}
                  >
                    {scan.employee?.fullName ?? "Unknown"}
                  </Text>
                  <Text
                    style={[
                      styles.recentSub,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {scan.site} - {scan.foreman} - {scan.workDate}
                  </Text>
                </View>
                <Text style={styles.recentBadge}>Created</Text>
              </View>
            ))}
          </GlassCard>
        )}
      </ScrollView>

      {/* Site picker */}
      <Modal
        visible={activePicker === "site"}
        transparent
        animationType="slide"
        onRequestClose={closePicker}
      >
        <PickerSheet
          visible={activePicker === "site"}
          title="Select Site"
          onClose={closePicker}
          colors={colors}
          items={sites}
          keyExtractor={(s) => s.id}
          searchableText={(s) => `${s.code ?? ""} ${s.name}`}
          searchPlaceholder="Search sites…"
          emptyLabel="No sites found."
          renderRow={(item) => (
            <Pressable
              onPress={() => {
                setSelectedSiteId(item.id);
                closePicker();
              }}
              style={[styles.optionRow, { borderColor: colors.rowBorder }]}
            >
              <Text style={[styles.optionText, { color: colors.textPrimary }]}>
                {item.code ? `${item.code} - ` : ""}
                {item.name}
              </Text>
              {selectedSiteId === item.id && (
                <Ionicons name="checkmark" size={18} color="#3b82f6" />
              )}
            </Pressable>
          )}
        />
      </Modal>

      {/* Foreman picker */}
      <Modal
        visible={activePicker === "foreman"}
        transparent
        animationType="slide"
        onRequestClose={closePicker}
      >
        <PickerSheet
          visible={activePicker === "foreman"}
          title="Select Foreman"
          onClose={closePicker}
          colors={colors}
          items={foremen}
          keyExtractor={(f) => f.foremanId}
          emptyLabel="No foremen found."
          renderRow={(item) => (
            <Pressable
              onPress={() => {
                setSelectedForemanId(item.foremanId);
                closePicker();
              }}
              style={[styles.optionRow, { borderColor: colors.rowBorder }]}
            >
              <Text style={[styles.optionText, { color: colors.textPrimary }]}>
                {item.name}
              </Text>
              {selectedForemanId === item.foremanId && (
                <Ionicons name="checkmark" size={18} color="#3b82f6" />
              )}
            </Pressable>
          )}
        />
      </Modal>

      {/* Dates picker */}
      <Modal
        visible={activePicker === "dates"}
        transparent
        animationType="slide"
        onRequestClose={closePicker}
      >
        <PickerSheet
          visible={activePicker === "dates"}
          title="Select Work Dates"
          onClose={closePicker}
          colors={colors}
          doneLabel="Done"
          items={dateOptions}
          keyExtractor={(d) => d.value}
          emptyLabel="No dates found."
          renderRow={(item) => {
            const checked = workDates.includes(item.value);
            return (
              <Pressable
                onPress={() => toggleDate(item.value)}
                style={[styles.optionRow, { borderColor: colors.rowBorder }]}
              >
                <Text
                  style={[styles.optionText, { color: colors.textPrimary }]}
                >
                  {item.label}
                </Text>
                <Ionicons
                  name={checked ? "checkbox" : "square-outline"}
                  size={18}
                  color={checked ? "#3b82f6" : colors.textSecondary}
                />
              </Pressable>
            );
          }}
        />
      </Modal>

      {/* Employees picker */}
      <Modal
        visible={activePicker === "employees"}
        transparent
        animationType="slide"
        onRequestClose={closePicker}
      >
        <PickerSheet
          visible={activePicker === "employees"}
          title="Select Employees"
          onClose={closePicker}
          colors={colors}
          doneLabel="Done"
          items={availableEmployees}
          keyExtractor={(e) => e.id}
          searchableText={(e) => `${e.fullName} ${e.code ?? ""}`}
          searchPlaceholder="Search employees…"
          emptyLabel="No employees found."
          renderRow={(item) => {
            const checked = selectedEmployeeIds.includes(item.id);
            return (
              <Pressable
                onPress={() => toggleEmployee(item.id)}
                style={[styles.optionRow, { borderColor: colors.rowBorder }]}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.optionText, { color: colors.textPrimary }]}
                  >
                    {item.fullName}
                  </Text>
                  {item.code && (
                    <Text
                      style={{
                        fontSize: 11,
                        color: colors.textSecondary,
                        marginTop: 1,
                      }}
                    >
                      {item.code}
                    </Text>
                  )}
                </View>
                <Ionicons
                  name={checked ? "checkbox" : "square-outline"}
                  size={18}
                  color={checked ? "#3b82f6" : colors.textSecondary}
                />
              </Pressable>
            );
          }}
        />
      </Modal>
    </AuthStyleBackground>
  );
}

function PickerSheet<T>({
  visible,
  title,
  onClose,
  colors,
  items,
  keyExtractor,
  renderRow,
  searchableText,
  searchPlaceholder,
  emptyLabel,
  doneLabel,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  colors: (typeof themes)["light"];
  items: T[];
  keyExtractor: (item: T) => string;
  renderRow: (item: T) => React.ReactNode;
  searchableText?: (item: T) => string;
  searchPlaceholder?: string;
  emptyLabel: string;
  doneLabel?: string;
}) {
  // Search text is owned locally so typing only re-renders this component,
  // not the whole screen (avoids the parent screen's larger tree — with its
  // own effects and other modals — reconciling on every keystroke).
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!visible) setSearch("");
  }, [visible]);

  const filtered = useMemo(() => {
    if (!searchableText) return items;
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      searchableText(item).toLowerCase().includes(q),
    );
  }, [items, search, searchableText]);

  return (
    <View style={sheetStyles.backdrop}>
      <View style={[sheetStyles.sheet, { backgroundColor: colors.sheetBg }]}>
        <View style={sheetStyles.handleBar} />
        <View style={sheetStyles.headerRow}>
          <Text style={[sheetStyles.title, { color: colors.textPrimary }]}>
            {title}
          </Text>
          <Pressable onPress={onClose}>
            <Text style={sheetStyles.doneText}>{doneLabel ?? "Close"}</Text>
          </Pressable>
        </View>
        {searchableText && (
          <View
            style={[
              sheetStyles.searchRow,
              {
                borderColor: colors.inputBorder,
                backgroundColor: colors.inputBg,
              },
            ]}
          >
            <Ionicons name="search" size={16} color={colors.textSecondary} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={searchPlaceholder}
              placeholderTextColor={colors.textSecondary}
              style={{ flex: 1, fontSize: 14, color: colors.textPrimary }}
            />
          </View>
        )}
        <View style={{ maxHeight: 420 }}>
          <FlatList
            data={filtered}
            keyExtractor={keyExtractor}
            contentContainerStyle={{ padding: 16, gap: 4 }}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Text
                style={{
                  color: colors.textSecondary,
                  textAlign: "center",
                  paddingTop: 24,
                }}
              >
                {emptyLabel}
              </Text>
            }
            renderItem={({ item }) => <>{renderRow(item)}</>}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  header: { marginBottom: 16 },
  title: { fontSize: 24, fontWeight: "900" },
  subtitle: { fontSize: 13, marginTop: 4 },

  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: "700" },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  pickerRowText: { fontSize: 14, fontWeight: "600", flex: 1, marginRight: 8 },
  inlineLoading: { flexDirection: "row", alignItems: "center", gap: 8 },
  hint: { fontSize: 11, marginTop: 2 },

  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    maxWidth: 200,
  },
  chipText: { fontSize: 12, fontWeight: "600" },

  textArea: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: "top",
  },

  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#3b82f6",
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 4,
  },
  submitBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  recentTitle: { fontSize: 15, fontWeight: "800" },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    paddingVertical: 10,
    gap: 8,
  },
  recentName: { fontSize: 13, fontWeight: "700" },
  recentSub: { fontSize: 11, marginTop: 2 },
  recentBadge: { fontSize: 11, fontWeight: "700", color: "#10b981" },

  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
  },
  optionText: { fontSize: 14, fontWeight: "600" },
});

const sheetStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingBottom: 24,
    maxHeight: "80%",
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#94a3b8",
    alignSelf: "center",
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  title: { fontSize: 17, fontWeight: "800" },
  doneText: { fontSize: 14, fontWeight: "700", color: "#3b82f6" },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 10,
  },
});
