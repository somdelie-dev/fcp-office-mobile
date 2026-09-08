import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useRouter } from "expo-router";

import {
  apiSupervisorRecentScanOuts,
  type SupervisorScanOutDto,
} from "@/lib/apiClient";
import { useTheme } from "@/lib/themeContext";

const themes = {
  dark: {
    textPrimary: "#e5e7eb",
    textSecondary: "#94a3b8",
    cardBg: "#1e293b",
    cardBorder: "#334155",
    inputBg: "#1e293b",
    inputBorder: "#334155",
    emptyText: "#64748b",
    avatarBg: "#312e81",
    avatarText: "#818cf8",
  },
  light: {
    textPrimary: "#111",
    textSecondary: "#666",
    cardBg: "#fff",
    cardBorder: "#e2e8f0",
    inputBg: "#fff",
    inputBorder: "#e2e8f0",
    emptyText: "#94a3b8",
    avatarBg: "#e0e7ff",
    avatarText: "#4f46e5",
  },
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  VERIFIED: { bg: "rgba(16,185,129,0.2)", text: "#10b981" },
  PENDING_REVIEW: { bg: "rgba(251,191,36,0.2)", text: "#f59e0b" },
  REJECTED: { bg: "rgba(239,68,68,0.2)", text: "#ef4444" },
};

type ScanGroup = { dateKey: string; heading: string; scans: SupervisorScanOutDto[] };

function getHeading(dateISO: string) {
  const date = new Date(`${dateISO.slice(0, 10)}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.getTime() === today.getTime()) return "Today";
  if (date.getTime() === yesterday.getTime()) return "Yesterday";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "long" });
}

function groupByDate(scans: SupervisorScanOutDto[]): ScanGroup[] {
  const groups = new Map<string, ScanGroup>();
  for (const s of scans) {
    const dateKey = s.scannedOutAtISO.slice(0, 10);
    if (!groups.has(dateKey)) {
      groups.set(dateKey, {
        dateKey,
        heading: getHeading(s.scannedOutAtISO),
        scans: [],
      });
    }
    groups.get(dateKey)!.scans.push(s);
  }
  return [...groups.values()].sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const second = parts.length > 1 ? (parts[1][0] ?? "") : "";
  return (first + second).toUpperCase();
}

/** Employees who scanned out via face recognition, across the supervisor's sites. */
export function FaceScanOutsPanel() {
  const { theme } = useTheme();
  const colors = themes[theme];
  const router = useRouter();

  const [scanOuts, setScanOuts] = useState<SupervisorScanOutDto[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await apiSupervisorRecentScanOuts("FACE");
      setScanOuts(res.scanOuts ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load face scan-outs.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return scanOuts;
    return scanOuts.filter(
      (s) =>
        s.employeeName.toLowerCase().includes(query) ||
        s.siteName.toLowerCase().includes(query),
    );
  }, [scanOuts, search]);

  const grouped = useMemo(() => groupByDate(visible), [visible]);

  return (
    <View style={styles.container}>
      <View style={styles.startButtonSection}>
        <Pressable
          onPress={() => router.push("/(supervisor-stack)/scan-out-face")}
          style={styles.startButton}
        >
          <Ionicons name="scan" size={18} color="#fff" />
          <Text style={styles.startButtonText}>Start Face Scan-Out</Text>
        </Pressable>
      </View>

      <View style={styles.searchSection}>
        <View
          style={[
            styles.searchContainer,
            { backgroundColor: colors.inputBg, borderColor: colors.inputBorder },
          ]}
        >
          <Ionicons name="search-outline" size={20} color={colors.textSecondary} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search name or site"
            placeholderTextColor={colors.textSecondary}
            style={[styles.searchInput, { color: colors.textPrimary }]}
            returnKeyType="search"
            autoCapitalize="none"
          />
          {!!search && (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
            </Pressable>
          )}
        </View>
      </View>

      {loading && !refreshing ? (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color="#16A34A" />
        </View>
      ) : error ? (
        <View style={styles.centerFill}>
          <Ionicons name="alert-circle" size={48} color="#ef4444" />
          <Text style={[styles.errorText, { color: colors.textPrimary }]}>{error}</Text>
          <Pressable onPress={() => load()} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : grouped.length === 0 ? (
        <View style={styles.centerFill}>
          <Ionicons name="scan-outline" size={64} color={colors.emptyText} />
          <Text style={[styles.emptyText, { color: colors.emptyText }]}>
            {search.trim()
              ? "No face scan-outs match your search"
              : "No face scan-outs in the last 7 days"}
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />
          }
        >
          {grouped.map((group) => (
            <View
              key={group.dateKey}
              style={[styles.groupCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}
            >
              <View style={[styles.groupHeader, { borderBottomColor: colors.cardBorder }]}>
                <Text style={[styles.groupHeading, { color: colors.textPrimary }]}>
                  {group.heading}
                </Text>
              </View>
              {group.scans.map((s) => {
                const statusColors =
                  STATUS_COLORS[s.verificationStatus ?? ""] ?? STATUS_COLORS.PENDING_REVIEW;
                return (
                  <View
                    key={s.id}
                    style={[styles.row, { borderBottomColor: colors.cardBorder }]}
                  >
                    {s.faceImageUrl ? (
                      <Image source={{ uri: s.faceImageUrl }} style={styles.avatar} />
                    ) : (
                      <View
                        style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.avatarBg }]}
                      >
                        <Text style={[styles.avatarFallbackText, { color: colors.avatarText }]}>
                          {initials(s.employeeName)}
                        </Text>
                      </View>
                    )}
                    <View style={styles.rowInfo}>
                      <Text
                        style={[styles.rowName, { color: colors.textPrimary }]}
                        numberOfLines={1}
                      >
                        {s.employeeName}
                      </Text>
                      <Text
                        style={[styles.rowMeta, { color: colors.textSecondary }]}
                        numberOfLines={1}
                      >
                        {s.siteName} • {formatTime(s.scannedOutAtISO)}
                        {s.confidence != null ? ` • ${Math.round(s.confidence * 100)}%` : ""}
                      </Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: statusColors.bg }]}>
                      <Text style={[styles.statusBadgeText, { color: statusColors.text }]}>
                        {s.verificationStatus === "VERIFIED"
                          ? "Verified"
                          : s.verificationStatus === "REJECTED"
                            ? "Rejected"
                            : "Review"}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  startButtonSection: { paddingHorizontal: 12, paddingBottom: 12 },
  startButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#16A34A",
    borderRadius: 5,
    paddingVertical: 12,
  },
  startButtonText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  searchSection: { paddingHorizontal: 12, paddingBottom: 12 },
  searchContainer: {
    minHeight: 40,
    borderRadius: 5,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 8 },

  centerFill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 10,
  },
  errorText: { fontSize: 16, textAlign: "center" },
  retryBtn: {
    marginTop: 6,
    backgroundColor: "#16A34A",
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: { color: "#fff", fontWeight: "600" },
  emptyText: { fontSize: 16, textAlign: "center" },

  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 12, paddingBottom: 32, gap: 12 },

  groupCard: { borderRadius: 5, borderWidth: 1, overflow: "hidden" },
  groupHeader: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 1 },
  groupHeading: { fontSize: 16, fontWeight: "700" },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
  },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  avatarFallbackText: { fontWeight: "800", fontSize: 13 },

  rowInfo: { flex: 1, gap: 2 },
  rowName: { fontSize: 14, fontWeight: "700" },
  rowMeta: { fontSize: 12 },

  statusBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  statusBadgeText: { fontWeight: "800", fontSize: 11 },
});
