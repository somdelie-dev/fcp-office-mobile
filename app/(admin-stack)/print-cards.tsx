import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import LoadingOverlay from "@/components/LoadingOverlay";
import { apiEmployees, type ApiEmployee } from "@/lib/apiClient";
import { getThumbnailUrl } from "@/lib/cloudinaryImage";
import {
  CARDS_PER_SHEET,
  buildPrintSheet,
  downloadEmployeeCard,
} from "@/lib/employeeCards";
import { sharePdf } from "@/lib/pdfFiles";
import { useTheme } from "@/lib/themeContext";

const ACCENT = "#22c55e";

const themes = {
  dark: {
    textPrimary: "#e5e7eb",
    textSecondary: "#94a3b8",
    cardBg: "rgba(15,23,42,0.85)",
    emptyText: "#64748b",
    rowBorder: "rgba(148,163,184,0.15)",
    inputBg: "rgba(255,255,255,0.08)",
    barBg: "rgba(11,24,38,0.97)",
  },
  light: {
    textPrimary: "#111",
    textSecondary: "#666",
    cardBg: "rgba(255,255,255,0.9)",
    emptyText: "#94a3b8",
    rowBorder: "rgba(0,0,0,0.08)",
    inputBg: "rgba(0,0,0,0.04)",
    barBg: "rgba(255,255,255,0.97)",
  },
};

type Colors = (typeof themes)["light"];
type StatusFilter = "active" | "all";

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

function sheetsFor(count: number) {
  return Math.ceil(count / CARDS_PER_SHEET);
}

function PersonRow({
  item,
  colors,
  selected,
  downloading,
  onToggle,
  onDownload,
}: {
  item: ApiEmployee;
  colors: Colors;
  selected: boolean;
  downloading: boolean;
  onToggle: () => void;
  onDownload: () => void;
}) {
  const avatar = avatarPaletteFor(item.id);

  return (
    <Pressable
      onPress={onToggle}
      style={[
        styles.personCard,
        {
          backgroundColor: colors.cardBg,
          borderColor: selected ? ACCENT : colors.rowBorder,
        },
      ]}
    >
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

      {item.photoUrl ? (
        <Image
          source={{ uri: getThumbnailUrl(item.photoUrl) ?? item.photoUrl }}
          style={styles.avatar}
        />
      ) : (
        <View style={[styles.avatar, { backgroundColor: avatar.bg }]}>
          <Text style={[styles.avatarText, { color: avatar.fg }]}>
            {initialsFor(item.fullName)}
          </Text>
        </View>
      )}

      <View style={styles.personInfo}>
        <Text
          style={[styles.personName, { color: colors.textPrimary }]}
          numberOfLines={1}
        >
          {item.fullName}
        </Text>
        <View style={styles.personMetaRow}>
          <Text style={[styles.personCode, { color: colors.textSecondary }]}>
            {item.code}
          </Text>
          {!item.active && (
            <View style={styles.inactiveBadge}>
              <Text style={styles.inactiveText}>Inactive</Text>
            </View>
          )}
        </View>
      </View>

      <Pressable
        style={[styles.actionBtn, { backgroundColor: "#2563eb" }]}
        onPress={onDownload}
        disabled={downloading}
        hitSlop={6}
      >
        {downloading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Ionicons name="download-outline" size={16} color="#fff" />
        )}
      </Pressable>
    </Pressable>
  );
}

export default function PrintCardsScreen() {
  const { theme } = useTheme();
  const colors = themes[theme];
  const isDark = theme === "dark";
  const insets = useSafeAreaInsets();

  const [employees, setEmployees] = useState<ApiEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [sheet, setSheet] = useState<{ uri: string; count: number } | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await apiEmployees();
      const list = [...(res.employees ?? [])].sort((a, b) =>
        a.fullName.localeCompare(b.fullName),
      );
      setEmployees(list);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load people.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const filtered = useMemo(() => {
    let list = employees;
    if (statusFilter === "active") list = list.filter((e) => e.active);
    const q = searchText.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (e) =>
          e.fullName.toLowerCase().includes(q) ||
          e.code.toLowerCase().includes(q),
      );
    }
    return list;
  }, [employees, statusFilter, searchText]);

  const selectedEmployees = useMemo(
    () => employees.filter((e) => selectedIds.has(e.id)),
    [employees, selectedIds],
  );

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((e) => selectedIds.has(e.id));

  const toggle = useCallback((id: string) => {
    setSheet(null);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAllVisible = useCallback(() => {
    setSheet(null);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) filtered.forEach((e) => next.delete(e.id));
      else filtered.forEach((e) => next.add(e.id));
      return next;
    });
  }, [allVisibleSelected, filtered]);

  const clearSelection = useCallback(() => {
    setSheet(null);
    setSelectedIds(new Set());
  }, []);

  const handleDownloadOne = useCallback(async (emp: ApiEmployee) => {
    setDownloadingId(emp.id);
    try {
      const uri = await downloadEmployeeCard(emp);
      await sharePdf(uri, `${emp.fullName} card`);
    } catch (e: any) {
      Alert.alert("Download Failed", e?.message ?? "Could not download card.");
    } finally {
      setDownloadingId(null);
    }
  }, []);

  const handleGenerate = useCallback(async () => {
    if (selectedEmployees.length === 0) return;
    setGenerating(true);
    setSheet(null);
    setProgress({ done: 0, total: selectedEmployees.length });
    try {
      const uri = await buildPrintSheet(selectedEmployees, (done, total) =>
        setProgress({ done, total }),
      );
      setSheet({ uri, count: selectedEmployees.length });
    } catch (e: any) {
      Alert.alert("Print Sheet Failed", e?.message ?? "Please try again.");
    } finally {
      setGenerating(false);
      setProgress(null);
    }
  }, [selectedEmployees]);

  const handleShareSheet = useCallback(async () => {
    if (!sheet) return;
    try {
      await sharePdf(sheet.uri, "Save or print card sheet");
    } catch (e: any) {
      Alert.alert("Share Failed", e?.message ?? "Failed to share the PDF.");
    }
  }, [sheet]);

  const selectedCount = selectedEmployees.length;
  const generateLabel = generating
    ? progress && progress.done < progress.total
      ? `Downloading cards ${progress.done}/${progress.total}…`
      : "Building print sheet…"
    : selectedCount === 0
      ? "Select people to print"
      : `Generate Print PDF (${selectedCount} card${selectedCount === 1 ? "" : "s"})`;

  return (
    <AuthStyleBackground>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Quick Print Cards
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Pick people to print an A4 sheet, 8 cards per page, or download a
            single card.
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
              placeholder="Search personnel name or code…"
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
          {(["active", "all"] as const).map((value) => {
            const active = statusFilter === value;
            return (
              <Pressable
                key={value}
                onPress={() => setStatusFilter(value)}
                style={[
                  styles.filterPill,
                  active
                    ? { backgroundColor: ACCENT, borderColor: ACCENT }
                    : {
                        backgroundColor: colors.inputBg,
                        borderColor: colors.rowBorder,
                      },
                ]}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    { color: active ? "#fff" : colors.textSecondary },
                  ]}
                >
                  {value === "active" ? "Active only" : "Everyone"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.listHeadingRow}>
          <Pressable
            onPress={toggleAllVisible}
            style={styles.selectAll}
            disabled={filtered.length === 0}
          >
            <Ionicons
              name={allVisibleSelected ? "checkbox" : "square-outline"}
              size={20}
              color={allVisibleSelected ? ACCENT : colors.textSecondary}
            />
            <Text style={[styles.selectAllText, { color: colors.textPrimary }]}>
              {allVisibleSelected ? "Deselect shown" : "Select shown"}
            </Text>
          </Pressable>
          <View style={styles.listHeadingRight}>
            <Text style={[styles.countText, { color: colors.textSecondary }]}>
              {filtered.length} {filtered.length === 1 ? "person" : "people"}
            </Text>
            {selectedCount > 0 && (
              <Pressable onPress={clearSelection} hitSlop={6}>
                <Text style={styles.clearText}>Clear</Text>
              </Pressable>
            )}
          </View>
        </View>

        {loading && !refreshing ? (
          <LoadingOverlay title="Loading people…" message="Please wait" />
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
            <Ionicons name="id-card-outline" size={64} color={colors.emptyText} />
            <Text style={[styles.emptyText, { color: colors.emptyText }]}>
              {searchText.trim() ? "No people match your search" : "No people found"}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <PersonRow
                item={item}
                colors={colors}
                selected={selectedIds.has(item.id)}
                downloading={downloadingId === item.id}
                onToggle={() => toggle(item.id)}
                onDownload={() => handleDownloadOne(item)}
              />
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />
            }
          />
        )}

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
          {sheet ? (
            <View style={styles.readyRow}>
              <Ionicons name="checkmark-circle" size={20} color={ACCENT} />
              <Text style={[styles.readyText, { color: colors.textPrimary }]}>
                {sheet.count} card{sheet.count === 1 ? "" : "s"} on{" "}
                {sheetsFor(sheet.count)} sheet
                {sheetsFor(sheet.count) === 1 ? "" : "s"}. Print duplex, flip on
                long edge.
              </Text>
            </View>
          ) : selectedCount > 0 ? (
            <Text style={[styles.summaryText, { color: colors.textSecondary }]}>
              {selectedCount} selected · {sheetsFor(selectedCount)} A4 sheet
              {sheetsFor(selectedCount) === 1 ? "" : "s"}
            </Text>
          ) : null}

          {sheet ? (
            <View style={styles.bottomActions}>
              <Pressable
                style={[styles.secondaryBtn, { borderColor: colors.rowBorder }]}
                onPress={handleGenerate}
              >
                <Ionicons name="refresh" size={16} color={colors.textPrimary} />
                <Text style={[styles.secondaryBtnText, { color: colors.textPrimary }]}>
                  Rebuild
                </Text>
              </Pressable>
              <Pressable
                style={[styles.primaryBtn, { flex: 1 }]}
                onPress={handleShareSheet}
              >
                <Ionicons name="share-outline" size={18} color="#fff" />
                <Text style={styles.primaryBtnText}>Save / Print PDF</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={[
                styles.primaryBtn,
                (selectedCount === 0 || generating) && styles.primaryBtnDisabled,
              ]}
              onPress={handleGenerate}
              disabled={selectedCount === 0 || generating}
            >
              {generating ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="print-outline" size={18} color="#fff" />
              )}
              <Text style={styles.primaryBtnText}>{generateLabel}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </AuthStyleBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 },
  title: { fontSize: 18, fontWeight: "900" },
  subtitle: { fontSize: 12, fontWeight: "600", marginTop: 4 },

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
  filterPill: {
    paddingHorizontal: 14,
    height: 34,
    borderRadius: 5,
    borderWidth: 1,
    justifyContent: "center",
  },
  filterPillText: { fontSize: 13, fontWeight: "800" },

  listHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  selectAll: { flexDirection: "row", alignItems: "center", gap: 6 },
  selectAllText: { fontSize: 14, fontWeight: "800" },
  listHeadingRight: { flexDirection: "row", alignItems: "center", gap: 12 },
  countText: { fontSize: 13, fontWeight: "700" },
  clearText: { fontSize: 13, fontWeight: "800", color: "#dc2626" },

  listContent: { paddingHorizontal: 16, paddingBottom: 24 },

  personCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderWidth: 1,
    borderRadius: 5,
    marginBottom: 10,
    gap: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 14, fontWeight: "900" },
  personInfo: { flex: 1, minWidth: 0 },
  personName: { fontSize: 15, fontWeight: "800" },
  personMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  personCode: { fontSize: 11, fontWeight: "600" },
  inactiveBadge: {
    backgroundColor: "rgba(107,114,128,0.15)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  inactiveText: { fontSize: 10, fontWeight: "800", color: "#6b7280" },
  actionBtn: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 5,
  },

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
  summaryText: { fontSize: 13, fontWeight: "700", textAlign: "center" },
  readyRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  readyText: { flex: 1, fontSize: 13, fontWeight: "700" },
  bottomActions: { flexDirection: "row", gap: 10 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderRadius: 5,
    backgroundColor: ACCENT,
  },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "900" },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 48,
    paddingHorizontal: 16,
    borderRadius: 5,
    borderWidth: 1,
  },
  secondaryBtnText: { fontSize: 14, fontWeight: "800" },
});
