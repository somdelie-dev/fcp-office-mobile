"use client";

import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import {
  ChevronLeft,
  ChevronRight,
  Globe,
  LogIn,
  Search,
} from "lucide-react-native";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
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
  apiAdminAuditLogs,
  type AuditLogEntryDto,
  type AuditLogsResponse,
  type RecentLoginDto,
} from "@/lib/apiClient";
import { useTheme } from "@/lib/themeContext";

const themes = {
  dark: {
    textPrimary: "#e5e7eb",
    textSecondary: "#94a3b8",
    cardBg: "rgba(15,23,42,0.85)",
    emptyText: "#64748b",
    rowBorder: "rgba(148,163,184,0.15)",
    inputBg: "rgba(30,41,59,0.8)",
    inputBorder: "rgba(100,116,139,0.3)",
    badgeBg: "rgba(100,116,139,0.25)",
    badgeText: "#cbd5e1",
    loginBg: "rgba(16,185,129,0.12)",
    appOpenBg: "rgba(59,130,246,0.12)",
    metaText: "#64748b",
    roleBg: "rgba(139,92,246,0.2)",
    roleText: "#a78bfa",
    dropdownBg: "rgba(15,23,42,0.95)",
    dropdownItem: "rgba(30,41,59,0.9)",
    dropdownItemActive: "rgba(59,130,246,0.2)",
  },
  light: {
    textPrimary: "#111",
    textSecondary: "#666",
    cardBg: "rgba(255,255,255,0.9)",
    emptyText: "#94a3b8",
    rowBorder: "rgba(0,0,0,0.08)",
    inputBg: "rgba(255,255,255,0.9)",
    inputBorder: "rgba(0,0,0,0.15)",
    badgeBg: "rgba(0,0,0,0.06)",
    badgeText: "#475569",
    loginBg: "rgba(16,185,129,0.08)",
    appOpenBg: "rgba(59,130,246,0.08)",
    metaText: "#94a3b8",
    roleBg: "rgba(139,92,246,0.1)",
    roleText: "#7c3aed",
    dropdownBg: "rgba(255,255,255,0.98)",
    dropdownItem: "rgba(255,255,255,0.95)",
    dropdownItemActive: "rgba(59,130,246,0.1)",
  },
};

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString("en-ZA", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTimestampFull(iso: string) {
  return new Date(iso).toLocaleString("en-ZA", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getMetadataParts(m: Record<string, any>): string | null {
  const parts: string[] = [];
  if (m.siteName) parts.push(`Site: ${m.siteName}`);
  if (m.employeeName) parts.push(`Guy: ${m.employeeName}`);
  if (m.foremanName) parts.push(`Foreman: ${m.foremanName}`);
  if (m.dayRate) parts.push(`Rate: R${m.dayRate}`);
  if (m.path) parts.push(m.path);
  if (m.reason) parts.push(`Reason: ${m.reason}`);
  if (parts.length > 0) return parts.join(" · ");
  const { siteName, employeeName, foremanName, ...rest } = m;
  return Object.keys(rest).length > 0 ? JSON.stringify(rest) : null;
}

/* ─── Recent Login Row ─── */
function RecentLoginRow({
  item,
  colors,
}: {
  item: RecentLoginDto;
  colors: (typeof themes)["dark"];
}) {
  const isLogin = item.action === "LOGIN";
  return (
    <View
      style={[
        styles.loginRow,
        {
          backgroundColor: isLogin ? colors.loginBg : colors.appOpenBg,
          borderBottomColor: colors.rowBorder,
        },
      ]}
    >
      <View style={styles.loginLeft}>
        {isLogin ? (
          <LogIn size={16} color="#10b981" strokeWidth={2.2} />
        ) : (
          <Globe size={16} color="#22c55e" strokeWidth={2.2} />
        )}
        <Text
          style={[styles.loginName, { color: colors.textPrimary }]}
          numberOfLines={1}
        >
          {item.actor?.name || item.actor?.email || "Unknown"}
        </Text>
        {item.actor?.role && (
          <View style={[styles.roleBadge, { backgroundColor: colors.roleBg }]}>
            <Text style={[styles.roleBadgeText, { color: colors.roleText }]}>
              {item.actor.role}
            </Text>
          </View>
        )}
        <View style={[styles.badge, { backgroundColor: colors.badgeBg }]}>
          <Text style={[styles.badgeText, { color: colors.badgeText }]}>
            {isLogin ? "Login" : "Opened App"}
          </Text>
        </View>
      </View>
      <Text style={[styles.timestamp, { color: colors.metaText }]}>
        {formatTimestamp(item.createdAt)}
      </Text>
    </View>
  );
}

/* ─── Log Entry Row ─── */
function LogEntryRow({
  item,
  colors,
}: {
  item: AuditLogEntryDto;
  colors: (typeof themes)["dark"];
}) {
  const metaStr =
    item.metadata && typeof item.metadata === "object"
      ? getMetadataParts(item.metadata)
      : null;

  return (
    <View style={[styles.logRow, { borderBottomColor: colors.rowBorder }]}>
      <View style={styles.logMain}>
        {/* Action badge + entity */}
        <View style={styles.logHeader}>
          <View style={[styles.badge, { backgroundColor: colors.badgeBg }]}>
            <Text
              style={[
                styles.badgeText,
                { color: colors.badgeText, fontFamily: "monospace" },
              ]}
            >
              {item.action}
            </Text>
          </View>
          <Text
            style={[styles.logEntity, { color: colors.textPrimary }]}
            numberOfLines={1}
          >
            {item.entity}
            {item.entityName
              ? ` — ${item.entityName}`
              : item.entityId
                ? ` #${item.entityId.slice(0, 8)}`
                : ""}
          </Text>
        </View>

        {/* Actor */}
        <View style={styles.actorRow}>
          <Text style={[styles.actorLabel, { color: colors.textSecondary }]}>
            by{" "}
          </Text>
          <Text style={[styles.actorName, { color: colors.textPrimary }]}>
            {item.actor?.name || item.actor?.email || "System"}
          </Text>
          {item.actor?.role && (
            <View
              style={[styles.roleBadge, { backgroundColor: colors.roleBg }]}
            >
              <Text style={[styles.roleBadgeText, { color: colors.roleText }]}>
                {item.actor.role}
              </Text>
            </View>
          )}
        </View>

        {/* Metadata */}
        {metaStr && (
          <Text
            style={[styles.metaText, { color: colors.metaText }]}
            numberOfLines={2}
          >
            {metaStr}
          </Text>
        )}
      </View>

      <Text style={[styles.timestamp, { color: colors.metaText }]}>
        {formatTimestampFull(item.createdAt)}
      </Text>
    </View>
  );
}

/* ─── Main Screen ─── */
export default function ActivityLogsScreen() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const colors = themes[isDark ? "dark" : "light"];

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [logs, setLogs] = useState<AuditLogEntryDto[]>([]);
  const [recentLogins, setRecentLogins] = useState<RecentLoginDto[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [actions, setActions] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [filterModalVisible, setFilterModalVisible] = useState(false);

  const fetchLogs = useCallback(async (p = 1, s = "", a = "") => {
    try {
      const data: AuditLogsResponse = await apiAdminAuditLogs({
        page: p,
        search: s || undefined,
        action: a || undefined,
      });
      setLogs(data.logs);
      setTotal(data.total);
      setPage(data.page);
      setTotalPages(data.totalPages);
      setActions(data.actions);
      setRecentLogins(data.recentLogins ?? []);
    } catch (e: any) {
      console.error("Failed to load audit logs:", e);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    await fetchLogs(1, search, actionFilter);
    setLoading(false);
  }, [fetchLogs, search, actionFilter]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchLogs(1, search, actionFilter);
    setRefreshing(false);
  }, [fetchLogs, search, actionFilter]);

  const doSearch = useCallback(() => {
    setPage(1);
    setLoading(true);
    fetchLogs(1, search, actionFilter).finally(() => setLoading(false));
  }, [fetchLogs, search, actionFilter]);

  const goPage = useCallback(
    (p: number) => {
      setPage(p);
      setLoading(true);
      fetchLogs(p, search, actionFilter).finally(() => setLoading(false));
    },
    [fetchLogs, search, actionFilter],
  );

  if (loading && !refreshing && logs.length === 0) {
    return (
      <AuthStyleBackground>
        <LoadingOverlay
          icon="📋"
          title="Loading activity logs…"
          message="Fetching audit events"
        />
      </AuthStyleBackground>
    );
  }

  return (
    <AuthStyleBackground>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Recent Logins */}
        {recentLogins.length > 0 && (
          <GlassCard style={[styles.card, { backgroundColor: colors.cardBg }]}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <LogIn size={18} color="#10b981" strokeWidth={2.2} />
                <View>
                  <Text
                    style={[styles.sectionTitle, { color: colors.textPrimary }]}
                  >
                    Recent Logins & App Opens
                  </Text>
                  <Text
                    style={[styles.sectionSub, { color: colors.textSecondary }]}
                  >
                    Last 10 admin sessions
                  </Text>
                </View>
              </View>
            </View>
            <View
              style={[styles.listContainer, { borderColor: colors.rowBorder }]}
            >
              {recentLogins.map((l) => (
                <RecentLoginRow key={l.id} item={l} colors={colors} />
              ))}
            </View>
          </GlassCard>
        )}

        {/* Activity Logs */}
        <GlassCard style={[styles.card, { backgroundColor: colors.cardBg }]}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Ionicons
                name="document-text-outline"
                size={18}
                color={colors.textPrimary}
              />
              <View>
                <Text
                  style={[styles.sectionTitle, { color: colors.textPrimary }]}
                >
                  Activity Logs
                </Text>
                <Text
                  style={[styles.sectionSub, { color: colors.textSecondary }]}
                >
                  Track who did what and when
                </Text>
              </View>
            </View>
          </View>

          {/* Search + Filter row */}
          <View style={styles.filterRow}>
            <View
              style={[
                styles.searchBox,
                {
                  backgroundColor: colors.inputBg,
                  borderColor: colors.inputBorder,
                },
              ]}
            >
              <Search size={16} color={colors.textSecondary} />
              <TextInput
                style={[styles.searchInput, { color: colors.textPrimary }]}
                placeholder="Search user, action, entity…"
                placeholderTextColor={colors.textSecondary}
                value={search}
                onChangeText={setSearch}
                onSubmitEditing={doSearch}
                returnKeyType="search"
                autoCapitalize="none"
              />
            </View>
            <View style={styles.filterButtons}>
              <Pressable
                style={({ pressed }) => [
                  styles.filterBtn,
                  {
                    backgroundColor: pressed
                      ? "rgba(59,130,246,0.25)"
                      : actionFilter
                        ? "rgba(59,130,246,0.15)"
                        : colors.badgeBg,
                  },
                ]}
                onPress={() => setFilterModalVisible(true)}
              >
                <Ionicons
                  name="funnel-outline"
                  size={16}
                  color={actionFilter ? "#22c55e" : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.filterBtnText,
                    {
                      color: actionFilter ? "#22c55e" : colors.textSecondary,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {actionFilter || "Filter"}
                </Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.searchBtn,
                  {
                    backgroundColor: pressed
                      ? "rgba(59,130,246,0.3)"
                      : "rgba(59,130,246,0.15)",
                  },
                ]}
                onPress={doSearch}
              >
                <Search size={16} color="#22c55e" />
              </Pressable>
            </View>
          </View>

          {/* Results */}
          {loading ? (
            <View style={styles.emptyContainer}>
              <ActivityIndicator size="large" color="#22c55e" />
            </View>
          ) : logs.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: colors.emptyText }]}>
                No audit logs found.
              </Text>
            </View>
          ) : (
            <View
              style={[styles.listContainer, { borderColor: colors.rowBorder }]}
            >
              {logs.map((log) => (
                <LogEntryRow key={log.id} item={log} colors={colors} />
              ))}
            </View>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <View style={styles.paginationRow}>
              <Text style={[styles.paginationText, { color: colors.metaText }]}>
                {total} log{total !== 1 ? "s" : ""} · Page {page} of{" "}
                {totalPages}
              </Text>
              <View style={styles.paginationButtons}>
                <Pressable
                  style={({ pressed }) => [
                    styles.pageBtn,
                    {
                      backgroundColor: pressed
                        ? "rgba(59,130,246,0.2)"
                        : colors.badgeBg,
                      opacity: page <= 1 ? 0.4 : 1,
                    },
                  ]}
                  disabled={page <= 1}
                  onPress={() => goPage(page - 1)}
                >
                  <ChevronLeft size={18} color={colors.textSecondary} />
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.pageBtn,
                    {
                      backgroundColor: pressed
                        ? "rgba(59,130,246,0.2)"
                        : colors.badgeBg,
                      opacity: page >= totalPages ? 0.4 : 1,
                    },
                  ]}
                  disabled={page >= totalPages}
                  onPress={() => goPage(page + 1)}
                >
                  <ChevronRight size={18} color={colors.textSecondary} />
                </Pressable>
              </View>
            </View>
          )}
        </GlassCard>
      </ScrollView>

      {/* Action Filter Modal */}
      <Modal
        visible={filterModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setFilterModalVisible(false)}
        >
          <Pressable
            style={[
              styles.dropdownContainer,
              { backgroundColor: colors.dropdownBg },
            ]}
            onPress={() => {}}
          >
            <Text style={[styles.dropdownTitle, { color: colors.textPrimary }]}>
              Filter by Action
            </Text>
            <ScrollView
              style={styles.dropdownScroll}
              showsVerticalScrollIndicator={false}
            >
              <Pressable
                style={[
                  styles.dropdownItem,
                  {
                    backgroundColor: !actionFilter
                      ? colors.dropdownItemActive
                      : colors.dropdownItem,
                  },
                ]}
                onPress={() => {
                  setActionFilter("");
                  setFilterModalVisible(false);
                  setPage(1);
                  setLoading(true);
                  fetchLogs(1, search, "").finally(() => setLoading(false));
                }}
              >
                <Text
                  style={[
                    styles.dropdownItemText,
                    { color: colors.textPrimary },
                  ]}
                >
                  All actions
                </Text>
                {!actionFilter && (
                  <Ionicons name="checkmark" size={18} color="#22c55e" />
                )}
              </Pressable>
              {actions.map((a) => (
                <Pressable
                  key={a}
                  style={[
                    styles.dropdownItem,
                    {
                      backgroundColor:
                        actionFilter === a
                          ? colors.dropdownItemActive
                          : colors.dropdownItem,
                    },
                  ]}
                  onPress={() => {
                    setActionFilter(a);
                    setFilterModalVisible(false);
                    setPage(1);
                    setLoading(true);
                    fetchLogs(1, search, a).finally(() => setLoading(false));
                  }}
                >
                  <Text
                    style={[
                      styles.dropdownItemText,
                      {
                        color: colors.textPrimary,
                        fontFamily: "monospace",
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {a}
                  </Text>
                  {actionFilter === a && (
                    <Ionicons name="checkmark" size={18} color="#22c55e" />
                  )}
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </AuthStyleBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  card: {
    borderRadius: 16,
    padding: 16,
  },
  sectionHeader: {
    marginBottom: 14,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  sectionSub: {
    fontSize: 12,
    marginTop: 2,
  },
  listContainer: {
    borderWidth: 1,
    borderRadius: 10,
    overflow: "hidden",
  },

  /* Recent login rows */
  loginRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  loginLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  loginName: {
    fontSize: 13,
    fontWeight: "600",
    flexShrink: 1,
  },

  /* Badges */
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  roleBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  roleBadgeText: {
    fontSize: 9,
    fontWeight: "700",
  },

  /* Log entry rows */
  logRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  logMain: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  logHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  logEntity: {
    fontSize: 13,
    fontWeight: "600",
    flexShrink: 1,
  },
  actorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexWrap: "wrap",
  },
  actorLabel: {
    fontSize: 11,
  },
  actorName: {
    fontSize: 11,
    fontWeight: "600",
  },
  metaText: {
    fontSize: 11,
    marginTop: 2,
  },
  timestamp: {
    fontSize: 10,
    textAlign: "right",
    minWidth: 60,
  },

  /* Filters */
  filterRow: {
    marginBottom: 12,
    gap: 8,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 40,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
  },
  filterButtons: {
    flexDirection: "row",
    gap: 8,
  },
  filterBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  filterBtnText: {
    fontSize: 12,
    fontWeight: "600",
  },
  searchBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  /* Pagination */
  paginationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  paginationText: {
    fontSize: 11,
  },
  paginationButtons: {
    flexDirection: "row",
    gap: 8,
  },
  pageBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  /* Empty state */
  emptyContainer: {
    paddingVertical: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 14,
  },

  /* Modal / Dropdown */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  dropdownContainer: {
    width: "100%",
    maxHeight: 400,
    borderRadius: 16,
    padding: 16,
  },
  dropdownTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
  },
  dropdownScroll: {
    maxHeight: 340,
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  dropdownItemText: {
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
  },
});
