import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import { GlassCard } from "@/components/GlassCard";
import {
  apiAdminPlantAssignments,
  type PlantAssignmentDto,
} from "@/lib/apiClient";
import { useTheme } from "@/lib/themeContext";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
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

const STATUS_COLORS: Record<string, string> = {
  DEPLOYED: "#10b981",
  RETURNED: "#6b7280",
  TRANSFERRED: "#f59e0b",
  MAINTENANCE: "#ef4444",
};

const STATUS_LABELS: Record<string, string> = {
  DEPLOYED: "Deployed",
  RETURNED: "Returned",
  TRANSFERRED: "Transferred",
  MAINTENANCE: "Maintenance",
};

type FilterStatus = "ALL" | "DEPLOYED" | "RETURNED" | "TRANSFERRED" | "MAINTENANCE";

export default function PlantScreen() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const router = useRouter();

  const textMain = isDark ? "#e5e7eb" : "#111827";
  const textSub = isDark ? "#94a3b8" : "#6b7280";
  const cardBg = isDark ? "rgba(15,23,42,0.95)" : "rgba(255,255,255,0.9)";
  const inputBg = isDark ? "rgba(30,41,59,0.8)" : "#f8fafc";
  const borderColor = isDark ? "rgba(148,163,184,0.2)" : "rgba(0,0,0,0.08)";

  const [assignments, setAssignments] = useState<PlantAssignmentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("DEPLOYED");

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError(null);
    try {
      const res = await apiAdminPlantAssignments(
        statusFilter !== "ALL" ? { status: statusFilter } : undefined,
      );
      setAssignments(res.data ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load plant assignments.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const filtered = assignments.filter((a) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      a.product.name.toLowerCase().includes(q) ||
      a.site.name.toLowerCase().includes(q) ||
      (a.site.code ?? "").toLowerCase().includes(q)
    );
  });

  const filterOptions: FilterStatus[] = ["DEPLOYED", "ALL", "RETURNED", "MAINTENANCE"];

  return (
    <AuthStyleBackground>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color={textMain} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: textMain }]}>Plant & Equipment</Text>
          <Text style={[styles.headerSub, { color: textSub }]}>
            {filtered.length} {statusFilter === "ALL" ? "total" : statusFilter.toLowerCase()}
          </Text>
        </View>
      </View>

      {/* Status filters */}
      <View style={[styles.filterRow, { borderBottomColor: borderColor }]}>
        {filterOptions.map((s) => (
          <Pressable
            key={s}
            onPress={() => setStatusFilter(s)}
            style={[
              styles.filterChip,
              statusFilter === s && { backgroundColor: s === "ALL" ? "#6366f1" : (STATUS_COLORS[s] ?? "#6366f1") },
              statusFilter !== s && {
                backgroundColor: isDark ? "rgba(148,163,184,0.1)" : "rgba(0,0,0,0.05)",
                borderColor,
              },
            ]}
          >
            <Text style={[
              styles.filterChipText,
              { color: statusFilter === s ? "#fff" : textSub },
            ]}>
              {s === "ALL" ? "All" : STATUS_LABELS[s]}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Search */}
      <View style={[styles.searchRow]}>
        <View style={[styles.searchBox, { backgroundColor: inputBg, borderColor }]}>
          <Ionicons name="search" size={16} color={textSub} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search by equipment or site…"
            placeholderTextColor={textSub}
            style={[styles.searchInput, { color: textMain }]}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={16} color={textSub} />
            </Pressable>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#6366f1" />
          <Text style={[styles.loadingText, { color: textSub }]}>Loading plant…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color="#ef4444" />
          <Text style={[styles.errorText, { color: "#ef4444" }]}>{error}</Text>
          <Pressable onPress={() => load()} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(a) => a.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(true); }}
              tintColor="#6366f1"
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="construct-outline" size={56} color={textSub} style={{ opacity: 0.4 }} />
              <Text style={[styles.emptyText, { color: textSub }]}>
                No plant assignments found.
              </Text>
            </View>
          }
          renderItem={({ item: a }) => {
            const statusColor = STATUS_COLORS[a.status] ?? "#6b7280";
            const statusLabel = STATUS_LABELS[a.status] ?? a.status;
            return (
              <GlassCard style={[styles.card, { backgroundColor: cardBg }]}>
                <View style={styles.cardRow}>
                  {a.product.thumbnailUrl ? (
                    <Image
                      source={{ uri: a.product.thumbnailUrl }}
                      style={styles.thumb}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.thumbPlaceholder, { backgroundColor: isDark ? "rgba(99,102,241,0.15)" : "rgba(99,102,241,0.1)" }]}>
                      <Ionicons name="construct" size={24} color="#6366f1" />
                    </View>
                  )}
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.equipmentName, { color: textMain }]} numberOfLines={2}>
                      {a.product.name}
                    </Text>
                    <View style={styles.siteRow}>
                      <Ionicons name="location-outline" size={12} color={textSub} />
                      <Text style={[styles.siteName, { color: textSub }]} numberOfLines={1}>
                        {a.site.code ? `${a.site.code} · ` : ""}{a.site.name}
                      </Text>
                    </View>
                    <Text style={[styles.dateMeta, { color: textSub }]}>
                      Deployed {new Date(a.deployedOn).toLocaleDateString()}
                      {a.returnedOn ? ` · Returned ${new Date(a.returnedOn).toLocaleDateString()}` : ""}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: `${statusColor}20` }]}>
                    <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                    <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
                  </View>
                </View>
                {(a.quantity != null || a.note) && (
                  <View style={[styles.cardFooter, { borderTopColor: borderColor }]}>
                    {a.quantity != null && (
                      <Text style={[styles.footerText, { color: textSub }]}>
                        Qty: {a.quantity}
                      </Text>
                    )}
                    {a.note && (
                      <Text style={[styles.footerText, { color: textSub }]} numberOfLines={1}>
                        {a.note}
                      </Text>
                    )}
                  </View>
                )}
              </GlassCard>
            );
          }}
        />
      )}
    </AuthStyleBackground>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 20, fontWeight: "900" },
  headerSub: { fontSize: 12, fontWeight: "600", marginTop: 1 },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "transparent",
  },
  filterChipText: { fontSize: 12, fontWeight: "800" },
  searchRow: { paddingHorizontal: 16, paddingVertical: 10 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 13, fontWeight: "600" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  loadingText: { fontSize: 14, fontWeight: "600" },
  errorText: { fontSize: 14, fontWeight: "700", textAlign: "center" },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 999, backgroundColor: "#16A34A" },
  retryBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  list: { padding: 16, gap: 10, paddingBottom: 40 },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 80, gap: 12 },
  emptyText: { fontSize: 14, fontWeight: "600" },
  card: { padding: 12, gap: 0 },
  cardRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  thumb: { width: 52, height: 52, borderRadius: 10 },
  thumbPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  equipmentName: { fontSize: 14, fontWeight: "900" },
  siteRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 },
  siteName: { fontSize: 12, fontWeight: "600", flex: 1 },
  dateMeta: { fontSize: 11, fontWeight: "500", marginTop: 2 },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: "800" },
  cardFooter: {
    flexDirection: "row",
    gap: 12,
    borderTopWidth: 1,
    marginTop: 10,
    paddingTop: 8,
  },
  footerText: { fontSize: 12, fontWeight: "600" },
});
