import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import {
  apiSupervisorFaceVerifications,
  type FaceVerificationEmployeeDto,
  type FaceVerificationStatus,
} from "@/lib/apiClient";
import { useTheme } from "@/lib/themeContext";

const themes = {
  dark: {
    textPrimary: "#e5e7eb",
    textSecondary: "#94a3b8",
    cardBg: "#1e293b",
    cardBorder: "#334155",
    searchBg: "#1e293b",
    searchBorder: "#334155",
    placeholderBg: "#312e81",
    placeholderText: "#818cf8",
    filterBg: "#1e293b",
    filterBorder: "#334155",
  },
  light: {
    textPrimary: "#111",
    textSecondary: "#666",
    cardBg: "#fff",
    cardBorder: "#e2e8f0",
    searchBg: "#f5f5f5",
    searchBorder: "#e0e0e0",
    placeholderBg: "#e0e7ff",
    placeholderText: "#4f46e5",
    filterBg: "#f5f5f5",
    filterBorder: "#e0e0e0",
  },
};

const STATUS_META: Record<
  FaceVerificationStatus,
  { label: string; color: string; bg: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  MISSING: { label: "Missing", color: "#dc2626", bg: "#fee2e2", icon: "close-circle" },
  PENDING: { label: "Pending review", color: "#b45309", bg: "#fef3c7", icon: "time" },
  RECOGNISED: { label: "Recognised", color: "#16a34a", bg: "#dcfce7", icon: "checkmark-circle" },
};

type FilterKey = "ALL" | FaceVerificationStatus;

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function StatusBadge({ status }: { status: FaceVerificationStatus }) {
  const meta = STATUS_META[status];
  return (
    <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
      <Ionicons name={meta.icon} size={12} color={meta.color} />
      <Text style={[styles.statusBadgeText, { color: meta.color }]}>
        {meta.label}
      </Text>
    </View>
  );
}

function EmployeeRow({
  item,
  colors,
  onPress,
}: {
  item: FaceVerificationEmployeeDto;
  colors: (typeof themes)["light"];
  onPress: () => void;
}) {
  const initials = getInitials(item.fullName);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.cardBg, borderColor: colors.cardBorder },
        pressed && { opacity: 0.85 },
      ]}
    >
      {item.photoUrl ? (
        <Image source={{ uri: item.photoUrl }} style={styles.avatar} />
      ) : (
        <View
          style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: colors.placeholderBg }]}
        >
          <Text style={[styles.avatarInitials, { color: colors.placeholderText }]}>
            {initials}
          </Text>
        </View>
      )}

      <View style={styles.rowInfo}>
        <Text style={[styles.rowName, { color: colors.textPrimary }]} numberOfLines={1}>
          {item.fullName}
        </Text>
        <Text style={[styles.rowMeta, { color: colors.textSecondary }]} numberOfLines={1}>
          #{item.code}
          {item.faceStatus !== "MISSING" &&
            ` · ${item.completedPoses}/${item.totalPoses} poses`}
        </Text>
        <StatusBadge status={item.faceStatus} />
      </View>

      <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
    </Pressable>
  );
}

/**
 * Employee face-verification status list. Rendered both as its own route
 * (deep link / back-compat) and embedded as the "Face" tab of the supervisor
 * Scan Outs screen — keep it self-contained (own header, search, filters) so
 * either host can drop it in without extra wiring.
 */
export function FaceVerificationsPanel() {
  const { theme } = useTheme();
  const colors = themes[theme];

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [rows, setRows] = useState<FaceVerificationEmployeeDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await apiSupervisorFaceVerifications("active");
      setRows(res.employees);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load face verification status.");
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

  const counts = useMemo(() => {
    const c: Record<FaceVerificationStatus, number> = {
      MISSING: 0,
      PENDING: 0,
      RECOGNISED: 0,
    };
    for (const r of rows) c[r.faceStatus]++;
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    let result = rows;
    if (filter !== "ALL") result = result.filter((r) => r.faceStatus === filter);
    const s = q.trim().toLowerCase();
    if (s) {
      result = result.filter(
        (r) =>
          r.fullName.toLowerCase().includes(s) || r.code.toLowerCase().includes(s),
      );
    }
    return result;
  }, [rows, filter, q]);

  const filters: { key: FilterKey; label: string; count?: number }[] = [
    { key: "ALL", label: "All", count: rows.length },
    { key: "MISSING", label: "Missing", count: counts.MISSING },
    { key: "PENDING", label: "Pending", count: counts.PENDING },
    { key: "RECOGNISED", label: "Recognised", count: counts.RECOGNISED },
  ];

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerSection}>
        <Text style={[styles.pageTitle, { color: colors.textPrimary }]}>
          Face Verification
        </Text>
        <Text style={[styles.pageSubtitle, { color: colors.textSecondary }]}>
          {counts.MISSING} missing · {counts.PENDING} pending · {counts.RECOGNISED} recognised
        </Text>
      </View>

      <View
        style={[
          styles.searchContainer,
          { backgroundColor: colors.searchBg, borderColor: colors.searchBorder },
        ]}
      >
        <Ionicons name="search" size={16} color={colors.textSecondary} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search name or code…"
          placeholderTextColor={colors.textSecondary}
          style={[styles.searchInput, { color: colors.textPrimary }]}
        />
        {q.length > 0 && (
          <Pressable onPress={() => setQ("")} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
          </Pressable>
        )}
      </View>

      <View
        style={[
          styles.segmentedControl,
          { backgroundColor: colors.filterBg, borderColor: colors.filterBorder },
        ]}
      >
        {filters.map((f) => {
          const active = filter === f.key;
          const meta = f.key !== "ALL" ? STATUS_META[f.key] : null;
          const tint = meta?.color ?? "#4f46e5";
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[styles.segment, active && { backgroundColor: tint }]}
            >
              <Text
                style={[
                  styles.segmentLabel,
                  { color: active ? "#fff" : colors.textPrimary },
                ]}
                numberOfLines={1}
              >
                {f.label}
              </Text>
              <Text
                style={[
                  styles.segmentCount,
                  { color: active ? "rgba(255,255,255,0.85)" : colors.textSecondary },
                ]}
              >
                {f.count}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {error ? <Text style={styles.errorMessage}>{error}</Text> : null}

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />
        }
        renderItem={({ item }) => (
          <EmployeeRow
            item={item}
            colors={colors}
            onPress={() =>
              router.push({
                pathname: "/(supervisor-stack)/employees/[id]",
                params: { id: item.id },
              })
            }
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="scan-outline" size={48} color={colors.textSecondary} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              {q.trim() || filter !== "ALL" ? "No matches" : "No guys yet"}
            </Text>
          </View>
        }
      />
    </View>
  );
}

/** Standalone route wrapper — kept for direct navigation / deep links. */
export default function SupervisorFaceVerificationsScreen() {
  return (
    <AuthStyleBackground>
      <FaceVerificationsPanel />
    </AuthStyleBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  centerContainer: { flex: 1, alignItems: "center", justifyContent: "center" },

  headerSection: { paddingTop: 16, paddingBottom: 12 },
  pageTitle: { fontSize: 24, fontWeight: "900", letterSpacing: -0.5 },
  pageSubtitle: { marginTop: 4, fontSize: 13, fontWeight: "600" },

  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  searchInput: { flex: 1, fontSize: 15, fontWeight: "500", padding: 0 },

  segmentedControl: {
    flexDirection: "row",
    marginTop: 12,
    marginBottom: 4,
    padding: 4,
    gap: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  segment: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: 9,
    gap: 1,
  },
  segmentLabel: { fontSize: 12, fontWeight: "800" },
  segmentCount: { fontSize: 10, fontWeight: "700" },

  errorMessage: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "rgba(176, 0, 32, 0.08)",
    color: "#b00020",
    fontWeight: "600",
    fontSize: 13,
  },

  listContent: { paddingBottom: 32, gap: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarPlaceholder: { alignItems: "center", justifyContent: "center" },
  avatarInitials: { fontSize: 16, fontWeight: "800" },

  rowInfo: { flex: 1, gap: 4 },
  rowName: { fontSize: 15, fontWeight: "800" },
  rowMeta: { fontSize: 12, fontWeight: "600" },

  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    marginTop: 2,
  },
  statusBadgeText: { fontSize: 11, fontWeight: "800" },

  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyTitle: { fontSize: 16, fontWeight: "700" },
});
