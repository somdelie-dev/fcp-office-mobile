import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import LoadingOverlay from "@/components/LoadingOverlay";
import {
  apiAdminCreateManualScans,
  apiAdminManualScanScannedIds,
  apiAdminSiteForemen,
  apiAdminSitesCached,
  apiEmployeesCached,
  type AdminSiteListItemDto,
  type ApiEmployee,
  type SiteForemanAssignmentDto,
} from "@/lib/apiClient";
import { useTheme } from "@/lib/themeContext";

const themes = {
  dark: {
    textPrimary: "#e5e7eb",
    textSecondary: "#94a3b8",
    cardBg: "rgba(15,23,42,0.85)",
    border: "rgba(148,163,184,0.15)",
    inputBg: "rgba(255,255,255,0.06)",
    accent: "#22c55e",
    emptyText: "#64748b",
  },
  light: {
    textPrimary: "#111",
    textSecondary: "#666",
    cardBg: "rgba(255,255,255,0.9)",
    border: "rgba(0,0,0,0.08)",
    inputBg: "rgba(0,0,0,0.03)",
    accent: "#16A34A",
    emptyText: "#94a3b8",
  },
};

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isoDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function prettyDate(dateISO: string) {
  const d = new Date(`${dateISO}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateISO;
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const second = parts.length > 1 ? (parts[1][0] ?? "") : "";
  return (first + second).toUpperCase();
}

/**
 * Admin's manual attendance-scan tool - "scan for a forgetful foreman": add
 * a completed scan for one or more employees without a physical QR scan,
 * for a chosen site/foreman/work date. Backed by the existing
 * apiAdminCreateManualScans (POST /api/admin/attendance-scans/manual) -
 * this screen was the missing piece; the API and the Home quick action
 * linking here already existed.
 */
export default function AdminManualScanScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const colors = themes[theme];

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [workDate, setWorkDate] = useState(todayISO());

  const [sites, setSites] = useState<AdminSiteListItemDto[]>([]);
  const [selectedSite, setSelectedSite] = useState<AdminSiteListItemDto | null>(
    null,
  );
  const [siteModalOpen, setSiteModalOpen] = useState(false);
  const [siteSearch, setSiteSearch] = useState("");

  const [foremen, setForemen] = useState<SiteForemanAssignmentDto[]>([]);
  const [foremenLoading, setForemenLoading] = useState(false);
  const [selectedForemanId, setSelectedForemanId] = useState<string | null>(
    null,
  );
  const [foremanModalOpen, setForemanModalOpen] = useState(false);

  const [employees, setEmployees] = useState<ApiEmployee[]>([]);
  const [scannedIds, setScannedIds] = useState<Set<string>>(new Set());
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(
    new Set(),
  );
  const [reason, setReason] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [sitesRes, employeesRes] = await Promise.all([
          apiAdminSitesCached({ isActive: true }),
          apiEmployeesCached(),
        ]);
        setSites(sitesRes.sites ?? []);
        setEmployees(employeesRes.employees ?? []);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load sites/personnel.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const loadScannedIds = useCallback(async (dateISO: string) => {
    try {
      const res = await apiAdminManualScanScannedIds(dateISO);
      setScannedIds(new Set(res.scannedEmployeeIds ?? []));
    } catch {
      // Advisory only — submit still catches real duplicates server-side.
      setScannedIds(new Set());
    }
  }, []);

  useEffect(() => {
    loadScannedIds(workDate);
  }, [workDate, loadScannedIds]);

  const loadForemenForSite = useCallback(async (siteId: string) => {
    setForemenLoading(true);
    setError(null);
    try {
      const res = await apiAdminSiteForemen(siteId);
      const list = res.foremen ?? [];
      setForemen(list);
      setSelectedForemanId(list.length ? list[0].foremanId : null);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load foremen for this site.");
      setForemen([]);
      setSelectedForemanId(null);
    } finally {
      setForemenLoading(false);
    }
  }, []);

  const dateOptions = useMemo(
    () => [
      { label: "Today", value: todayISO() },
      { label: "Yesterday", value: isoDaysAgo(1) },
      { label: prettyDate(isoDaysAgo(2)), value: isoDaysAgo(2) },
    ],
    [],
  );

  const filteredSites = useMemo(() => {
    const q = siteSearch.trim().toLowerCase();
    if (!q) return sites;
    return sites.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.code ?? "").toLowerCase().includes(q),
    );
  }, [sites, siteSearch]);

  const filteredEmployees = useMemo(() => {
    const q = employeeSearch.trim().toLowerCase();
    const active = employees.filter((e) => e.active);
    if (!q) return active;
    return active.filter(
      (e) =>
        e.fullName.toLowerCase().includes(q) ||
        e.code.toLowerCase().includes(q),
    );
  }, [employees, employeeSearch]);

  const toggleEmployee = useCallback((id: string) => {
    setSelectedEmployeeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const canSubmit =
    !!selectedSite &&
    !!selectedForemanId &&
    selectedEmployeeIds.size > 0 &&
    !submitting;

  const submit = useCallback(async () => {
    if (!selectedSite || !selectedForemanId || selectedEmployeeIds.size === 0)
      return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await apiAdminCreateManualScans({
        siteId: selectedSite.id,
        foremanId: selectedForemanId,
        employeeIds: Array.from(selectedEmployeeIds),
        workDates: [workDate],
        reason: reason.trim() || undefined,
      });

      setSelectedEmployeeIds(new Set());
      setReason("");
      await loadScannedIds(workDate);

      const skippedNote = res.skipped.length
        ? `\n\nSkipped:\n${res.skipped.map((s) => `${s.employeeName} — ${s.reason}`).join("\n")}`
        : "";
      Alert.alert(
        "Manual scans recorded",
        `${res.scans.length} scan${res.scans.length === 1 ? "" : "s"} created for ${prettyDate(workDate)}.${skippedNote}`,
      );
    } catch (e: any) {
      setError(e?.message ?? "Failed to create manual scans.");
      Alert.alert("Failed", e?.message ?? "Failed to create manual scans.");
    } finally {
      setSubmitting(false);
    }
  }, [
    selectedSite,
    selectedForemanId,
    selectedEmployeeIds,
    workDate,
    reason,
    loadScannedIds,
  ]);

  if (loading) {
    return (
      <AuthStyleBackground>
        <LoadingOverlay
          icon="⏳"
          title="Loading…"
          message="Please wait while we fetch sites and personnel"
        />
      </AuthStyleBackground>
    );
  }

  return (
    <AuthStyleBackground>
      <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.wrap}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backPill}>
            <Ionicons name="chevron-back" size={16} color="#111" />
            <Text style={styles.backText}>Back</Text>
          </Pressable>
          <Text style={[styles.h1, { color: colors.textPrimary }]}>
            Manual Scan
          </Text>
        </View>

        <View
          style={[
            styles.infoBox,
            { borderColor: colors.border, backgroundColor: colors.cardBg },
          ]}
        >
          <Ionicons name="information-circle" size={18} color={colors.accent} />
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            Record an attendance scan for a forgetful foreman — no QR card
            needed. Pick the site, foreman, and work date, then select who
            was there.
          </Text>
        </View>

        {error ? (
          <View
            style={[
              styles.errorBox,
              { borderColor: colors.border, backgroundColor: colors.cardBg },
            ]}
          >
            <Ionicons name="alert-circle" size={18} color="#ef4444" />
            <Text style={[styles.errorText, { color: colors.textPrimary }]}>
              {error}
            </Text>
          </View>
        ) : null}

        <View
          style={[
            styles.card,
            { borderColor: colors.border, backgroundColor: colors.cardBg },
          ]}
        >
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            Work date
          </Text>
          <View style={styles.dateRow}>
            {dateOptions.map((opt) => {
              const selected = workDate === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => setWorkDate(opt.value)}
                  style={[
                    styles.dateChip,
                    {
                      borderColor: selected ? colors.accent : colors.border,
                      backgroundColor: selected
                        ? colors.accent + "22"
                        : colors.inputBg,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.dateChipText,
                      { color: selected ? colors.accent : colors.textPrimary },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.selectorRow}>
            <Pressable
              onPress={() => setSiteModalOpen(true)}
              style={[
                styles.selectorBtn,
                { borderColor: colors.border, backgroundColor: colors.inputBg },
              ]}
            >
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                Site
              </Text>
              <Text
                style={[styles.selectorValue, { color: colors.textPrimary }]}
                numberOfLines={1}
              >
                {selectedSite ? selectedSite.name : "Choose site"}
              </Text>
            </Pressable>

            <Pressable
              disabled={!selectedSite}
              onPress={() => setForemanModalOpen(true)}
              style={[
                styles.selectorBtn,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.inputBg,
                  opacity: selectedSite ? 1 : 0.5,
                },
              ]}
            >
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                Foreman
              </Text>
              <Text
                style={[styles.selectorValue, { color: colors.textPrimary }]}
                numberOfLines={1}
              >
                {selectedForemanId
                  ? (foremen.find((f) => f.foremanId === selectedForemanId)
                      ?.name ?? "Foreman")
                  : "Choose foreman"}
              </Text>
            </Pressable>
          </View>

          <Text style={[styles.label, { color: colors.textSecondary, marginTop: 4 }]}>
            Reason (optional)
          </Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="e.g. Foreman forgot to scan this personnel in"
            placeholderTextColor={colors.textSecondary}
            style={[
              styles.reasonInput,
              {
                borderColor: colors.border,
                backgroundColor: colors.inputBg,
                color: colors.textPrimary,
              },
            ]}
            multiline
          />
        </View>

        <View
          style={[
            styles.card,
            { borderColor: colors.border, backgroundColor: colors.cardBg, padding: 0 },
          ]}
        >
          <View style={[styles.listHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.listHeaderTitle, { color: colors.textPrimary }]}>
              Personnel ({selectedEmployeeIds.size} selected)
            </Text>
          </View>

          <View style={{ padding: 12, paddingBottom: 0 }}>
            <TextInput
              value={employeeSearch}
              onChangeText={setEmployeeSearch}
              placeholder="Search name or code…"
              placeholderTextColor={colors.textSecondary}
              style={[
                styles.searchInput,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.inputBg,
                  color: colors.textPrimary,
                },
              ]}
              autoCapitalize="none"
            />
          </View>

          {/* Plain map, not a nested FlatList — a VirtualizedList inside a
              ScrollView of the same orientation ends up swallowing the
              scroll gesture over its own bounds instead of handing it up to
              the page, which is why only this section used to scroll. */}
          <View style={{ padding: 12, paddingTop: 8, gap: 8 }}>
            {filteredEmployees.length === 0 ? (
              <Text style={{ color: colors.emptyText, fontWeight: "700", padding: 8 }}>
                No personnel match your search.
              </Text>
            ) : (
              filteredEmployees.map((item) => {
                const selected = selectedEmployeeIds.has(item.id);
                const alreadyScanned = scannedIds.has(item.id);
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => toggleEmployee(item.id)}
                    style={[
                      styles.employeeRow,
                      {
                        borderColor: selected ? colors.accent : colors.border,
                        backgroundColor: selected
                          ? colors.accent + "18"
                          : colors.inputBg,
                      },
                    ]}
                  >
                    <Ionicons
                      name={selected ? "checkbox" : "square-outline"}
                      size={20}
                      color={selected ? colors.accent : colors.textSecondary}
                    />
                    {item.photoUrl ? (
                      <Image source={{ uri: item.photoUrl }} style={styles.avatar} />
                    ) : (
                      <View style={[styles.avatar, styles.avatarFallback]}>
                        <Text style={styles.avatarFallbackText}>
                          {initials(item.fullName)}
                        </Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[styles.employeeName, { color: colors.textPrimary }]}
                        numberOfLines={1}
                      >
                        {item.fullName}
                      </Text>
                      <Text
                        style={[styles.employeeCode, { color: colors.textSecondary }]}
                      >
                        {item.code}
                      </Text>
                    </View>
                    {alreadyScanned && (
                      <View style={styles.scannedBadge}>
                        <Text style={styles.scannedBadgeText}>SCANNED</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })
            )}
          </View>
        </View>
      </ScrollView>

      {/* Outside the ScrollView so it's always visible, not scrolled past
          the employee list. */}
      <View
        style={[
          styles.footer,
          { backgroundColor: colors.cardBg, borderTopColor: colors.border },
        ]}
      >
        <Pressable
          onPress={submit}
          disabled={!canSubmit}
          style={[
            styles.submitBtn,
            { backgroundColor: colors.accent, opacity: canSubmit ? 1 : 0.5 },
          ]}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.submitBtnText}>
              Record {selectedEmployeeIds.size || ""} Scan
              {selectedEmployeeIds.size === 1 ? "" : "s"}
            </Text>
          )}
        </Pressable>
      </View>
      </View>

      {/* Site picker */}
      <Modal
        visible={siteModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSiteModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: theme === "dark" ? "#0f172a" : "#fff" },
            ]}
          >
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                Select Site
              </Text>
              <Pressable onPress={() => setSiteModalOpen(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
            <View style={{ padding: 12 }}>
              <TextInput
                value={siteSearch}
                onChangeText={setSiteSearch}
                placeholder="Search site (name / code)…"
                placeholderTextColor={colors.textSecondary}
                style={[
                  styles.searchInput,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.inputBg,
                    color: colors.textPrimary,
                  },
                ]}
                autoCapitalize="none"
              />
            </View>
            <FlatList
              data={filteredSites}
              keyExtractor={(s) => s.id}
              style={{ maxHeight: 460, paddingHorizontal: 12 }}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable
                  onPress={async () => {
                    setSelectedSite(item);
                    setSiteModalOpen(false);
                    await loadForemenForSite(item.id);
                    setForemanModalOpen(true);
                  }}
                  style={[styles.siteOption, { borderColor: colors.border }]}
                >
                  <Text style={[styles.siteOptionName, { color: colors.textPrimary }]}>
                    {item.name}
                  </Text>
                  {!!item.code && (
                    <Text
                      style={[styles.siteOptionCode, { color: colors.textSecondary }]}
                    >
                      {item.code}
                    </Text>
                  )}
                </Pressable>
              )}
              ListEmptyComponent={
                <Text style={{ color: colors.textSecondary, padding: 16, fontWeight: "700" }}>
                  No sites match your search.
                </Text>
              }
            />
          </View>
        </View>
      </Modal>

      {/* Foreman picker */}
      <Modal
        visible={foremanModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setForemanModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: theme === "dark" ? "#0f172a" : "#fff" },
            ]}
          >
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                Select Foreman
              </Text>
              <Pressable
                onPress={() => setForemanModalOpen(false)}
                style={styles.closeBtn}
              >
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
            {foremenLoading ? (
              <LoadingOverlay icon="⏳" title="Loading foremen…" message="Please wait" />
            ) : (
              <FlatList
                data={foremen}
                keyExtractor={(f) => f.foremanId}
                style={{ maxHeight: 460, paddingHorizontal: 12 }}
                renderItem={({ item }) => {
                  const selected = item.foremanId === selectedForemanId;
                  return (
                    <Pressable
                      onPress={() => {
                        setSelectedForemanId(item.foremanId);
                        setForemanModalOpen(false);
                      }}
                      style={[
                        styles.foremanOption,
                        {
                          borderColor: selected ? colors.accent : colors.border,
                          backgroundColor: selected
                            ? colors.accent + "18"
                            : colors.inputBg,
                        },
                      ]}
                    >
                      <Text
                        style={[styles.foremanOptionName, { color: colors.textPrimary }]}
                      >
                        {item.name}
                      </Text>
                    </Pressable>
                  );
                }}
                ListEmptyComponent={
                  <Text
                    style={{ color: colors.textSecondary, padding: 16, fontWeight: "700" }}
                  >
                    No foremen assigned to this site.
                  </Text>
                }
              />
            )}
          </View>
        </View>
      </Modal>
    </AuthStyleBackground>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, paddingBottom: 40, gap: 12 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  backPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.08)",
  },
  backText: { fontWeight: "800", color: "#111", fontSize: 13 },
  h1: { fontSize: 18, fontWeight: "900" },

  infoBox: {
    flexDirection: "row",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "flex-start",
  },
  infoText: { flex: 1, fontWeight: "700", fontSize: 12, lineHeight: 17 },

  errorBox: {
    flexDirection: "row",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  errorText: { flex: 1, fontWeight: "800" },

  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
  label: { fontWeight: "800", fontSize: 12 },

  dateRow: { flexDirection: "row", gap: 8 },
  dateChip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9 },
  dateChipText: { fontWeight: "800", fontSize: 12 },

  selectorRow: { flexDirection: "row", gap: 10 },
  selectorBtn: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  selectorValue: { fontWeight: "900", fontSize: 13 },

  reasonInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontWeight: "700",
    minHeight: 44,
    textAlignVertical: "top",
  },

  listHeader: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1 },
  listHeaderTitle: { fontWeight: "900", fontSize: 13 },

  searchInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },

  employeeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },
  avatar: { width: 34, height: 34, borderRadius: 17 },
  avatarFallback: {
    backgroundColor: "rgba(34,197,94,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarFallbackText: { fontWeight: "900", fontSize: 12, color: "#16A34A" },
  employeeName: { fontWeight: "800", fontSize: 13 },
  employeeCode: { fontWeight: "700", fontSize: 11, marginTop: 1 },

  scannedBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "rgba(148,163,184,0.2)",
  },
  scannedBadgeText: { fontSize: 9, fontWeight: "900", color: "#64748b" },

  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
  },
  submitBtn: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  submitBtnText: { color: "#fff", fontWeight: "900", fontSize: 14 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  modalCard: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 20,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  modalTitle: { fontWeight: "900", fontSize: 16 },
  closeBtn: { padding: 6 },

  siteOption: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
  },
  siteOptionName: { fontWeight: "900", fontSize: 14 },
  siteOptionCode: { fontWeight: "700", fontSize: 12, marginTop: 2 },

  foremanOption: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
    marginHorizontal: 0,
  },
  foremanOptionName: { fontWeight: "900", fontSize: 14 },
});
