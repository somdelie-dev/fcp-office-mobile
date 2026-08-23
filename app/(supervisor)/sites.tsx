import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import LoadingOverlay from "@/components/LoadingOverlay";
import {
  apiSupervisorSites,
  type SupervisorSiteListItemDto,
} from "@/lib/apiClient";
import { useDataCache } from "@/lib/dataCache";
import { useTheme } from "@/lib/themeContext";
import { Ionicons } from "@expo/vector-icons";

const themes = {
  dark: {
    bg: "#0b1220",
    bgSecondary: "#0f172a",
    border: "#1f2a44",
    textPrimary: "white",
    textSecondary: "#94a3b8",
    textTertiary: "#cbd5e1",
    accent: "#22c55e",
    success: "#16a34a",
    error: "#dc2626",
    buttonBg: "rgba(34, 197, 94, 0.1)",
    inputBg: "rgba(15, 23, 42, 0.8)",
  },
  light: {
    bg: "#f8fafc",
    bgSecondary: "#ffffff",
    border: "#e2e8f0",
    textPrimary: "#0f172a",
    textSecondary: "#64748b",
    textTertiary: "#475569",
    accent: "#16A34A",
    success: "#22c55e",
    error: "#ef4444",
    buttonBg: "#f5f5f5",
    inputBg: "#f5f5f5",
  },
};

function SiteRow({
  item,
  onPress,
  onAssign,
  isLast,
  theme,
}: {
  item: SupervisorSiteListItemDto;
  onPress: () => void;
  onAssign: () => void;
  isLast: boolean;
  theme: (typeof themes)["dark"];
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.rowPressable,
        {
          borderColor: theme.border,
          opacity: pressed ? 0.6 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.siteRow,
          !isLast && {
            borderBottomWidth: 1,
            borderBottomColor: theme.border,
          },
        ]}
      >
        <View style={styles.siteContent}>
          <View style={styles.siteTextContainer}>
            <Text style={[styles.jobNumber, { color: theme.textPrimary }]}>
              {item.code ?? "Not set"}
            </Text>
            <Text style={[styles.siteName, { color: theme.textPrimary }]}>
              {item.name}
            </Text>
            {/* <Text style={[styles.siteMeta, { color: theme.textSecondary }]}>
              {item.location ?? "Location not set"}
            </Text> */}
            <Text style={[styles.foremenText, { color: theme.textSecondary }]}>
              Foremen assigned:{" "}
              <Text style={{ fontWeight: "700", color: theme.textPrimary }}>
                {item.foremenCount}
              </Text>
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Assign foreman to ${item.name}`}
            onPress={(event) => {
              event.stopPropagation();
              onAssign();
            }}
            style={[
              styles.assignButton,
              { backgroundColor: theme.buttonBg, borderColor: theme.accent },
            ]}
          >
            <Ionicons
              name="person-add-outline"
              size={16}
              color={theme.accent}
            />
            <Text style={[styles.assignButtonText, { color: theme.accent }]}>
              Assign Foreman
            </Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

export default function SupervisorSitesScreen() {
  const router = useRouter();
  const searchInputRef = useRef<TextInput>(null);
  const { supervisorSites, setSupervisorSites, isFresh } = useDataCache();
  const { theme } = useTheme();
  const colors = themes[theme];

  const [q, setQ] = useState("");
  const [rows, setRows] = useState<SupervisorSiteListItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchActive, setSearchActive] = useState(false);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const matchingRows = s
      ? rows.filter((r) => {
          return (
            r.name.toLowerCase().includes(s) ||
            String(r.code ?? "")
              .toLowerCase()
              .includes(s) ||
            String(r.location ?? "")
              .toLowerCase()
              .includes(s)
          );
        })
      : rows;

    return [...matchingRows].sort((a, b) =>
      String(b.code ?? "").localeCompare(String(a.code ?? ""), undefined, {
        numeric: true,
      }),
    );
  }, [rows, q]);

  const load = useCallback(
    async (forceRefresh = false) => {
      // Check if we have fresh cached data
      if (
        !forceRefresh &&
        supervisorSites &&
        isFresh(supervisorSites.timestamp)
      ) {
        setRows(supervisorSites.data);
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const res = await apiSupervisorSites({ show: "active" });
        setRows(res.sites ?? []);
        setSupervisorSites(res.sites ?? []);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load sites.");
        setRows([]);
      } finally {
        setLoading(false);
      }
    },
    [supervisorSites, isFresh, setSupervisorSites],
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await apiSupervisorSites({ show: "active" });
      setRows(res.sites ?? []);
      setSupervisorSites(res.sites ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to refresh.");
    } finally {
      setRefreshing(false);
    }
  }, [setSupervisorSites]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <AuthStyleBackground>
      <View style={styles.container}>
        {/* Header Section */}
        <View style={styles.headerSection}>
          <View style={styles.headerTop}>
            <View>
              <Text style={[styles.pageTitle, { color: colors.textPrimary }]}>
                Sites
              </Text>
              <Text
                style={[styles.pageSubtitle, { color: colors.textSecondary }]}
              >
                Active sites under your supervision
              </Text>
            </View>
            <TouchableOpacity
              onPress={refresh}
              disabled={refreshing}
              style={[
                styles.refreshButton,
                {
                  backgroundColor: colors.inputBg,
                  borderColor: colors.border,
                },
              ]}
            >
              {refreshing ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Text
                  style={[styles.refreshButtonText, { color: colors.accent }]}
                >
                  ↻
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Professional Search Bar */}
        <View style={styles.searchSection}>
          <Pressable
            onPress={() => searchInputRef.current?.focus()}
            style={[
              styles.searchContainer,
              {
                backgroundColor: colors.inputBg,
                borderColor: searchActive ? colors.accent : colors.border,
              },
            ]}
          >
            <Text style={styles.searchIconText} pointerEvents="none">
              🔍
            </Text>
            <TextInput
              ref={searchInputRef}
              style={[styles.searchInputField, { color: colors.textPrimary }]}
              placeholder="Search by job number, name, or location..."
              placeholderTextColor={colors.textSecondary}
              value={q}
              onChangeText={setQ}
              onFocus={() => setSearchActive(true)}
              onBlur={() => setSearchActive(false)}
              selectionColor={colors.accent}
              editable={true}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
            />
            {q.length > 0 && (
              <TouchableOpacity
                onPress={() => {
                  setQ("");
                  searchInputRef.current?.focus();
                }}
                style={styles.clearButton}
              >
                <Text
                  style={[
                    styles.clearButtonText,
                    { color: colors.textSecondary },
                  ]}
                >
                  ✕
                </Text>
              </TouchableOpacity>
            )}
          </Pressable>
          {filtered.length > 0 && (
            <Text style={[styles.resultCount, { color: colors.textSecondary }]}>
              {filtered.length} site{filtered.length !== 1 ? "s" : ""} found
            </Text>
          )}
        </View>

        {/* Error Message */}
        {error && (
          <Text
            style={[
              styles.errorMessage,
              {
                backgroundColor: colors.error + "15",
                color: colors.error,
              },
            ]}
          >
            {error}
          </Text>
        )}

        {/* Sites List */}
        <FlatList
          data={filtered}
          keyExtractor={(x) => x.id}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={colors.accent}
            />
          }
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            loading ? (
              <LoadingOverlay
                icon="⏳"
                title="Loading sites…"
                message="Please wait while we fetch your sites"
              />
            ) : (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyIcon}>{q ? "🔍" : "📍"}</Text>
                <Text
                  style={[styles.emptyTitle, { color: colors.textPrimary }]}
                >
                  {q ? "No sites found" : "No sites"}
                </Text>
                <Text
                  style={[styles.emptyMessage, { color: colors.textSecondary }]}
                >
                  {q
                    ? "Try adjusting your search criteria"
                    : "No active sites available"}
                </Text>
              </View>
            )
          }
          renderItem={({ item, index }) => (
            <SiteRow
              item={item}
              isLast={index === filtered.length - 1}
              theme={colors}
              onPress={() =>
                router.push({
                  pathname: "/(supervisor-stack)/sites/[id]",
                  params: { id: item.id },
                })
              }
              onAssign={() =>
                router.push({
                  pathname: "/(supervisor-stack)/sites/[id]",
                  params: { id: item.id, assign: "1" },
                })
              }
            />
          )}
        />
      </View>
    </AuthStyleBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
  },

  // Header Styles
  headerSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  pageSubtitle: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: "600",
  },
  refreshButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  refreshButtonText: {
    fontSize: 20,
    fontWeight: "600",
  },

  // Search Styles
  searchSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    minHeight: 48,
  },
  searchContainerActive: {
    borderColor: "#007AFF",
    backgroundColor: "#fff",
    ...Platform.select({
      ios: {
        shadowColor: "#007AFF",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  searchIconText: {
    fontSize: 18,
    marginRight: 10,
  },
  searchInputField: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
    padding: 0,
    margin: 0,
  },
  clearButton: {
    padding: 8,
    marginLeft: 8,
  },
  clearButtonText: {
    fontSize: 18,
    fontWeight: "600",
  },
  resultCount: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "600",
  },

  // Error Message
  errorMessage: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderRadius: 8,
    fontWeight: "600",
    fontSize: 13,
  },

  // List Styles
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    flexGrow: 1,
  },

  // Empty State
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  emptyMessage: {
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
    lineHeight: 20,
  },

  // Site Row Styles
  rowPressable: {
    opacity: 1,
    borderWidth: 2,
    borderRadius: 8,
    paddingHorizontal: 8,
    marginBottom: 12,
  },
  rowPressed: {
    opacity: 0.6,
  },
  siteRow: {
    paddingVertical: 14,
    paddingHorizontal: 0,
  },
  siteContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 6,
  },
  siteTextContainer: {
    flex: 1,
  },
  jobNumber: {
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 4,
  },
  siteName: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
  },
  siteMeta: {
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 6,
  },
  foremenText: {
    fontSize: 12,
    fontWeight: "500",
  },

  assignButton: {
    minHeight: 40,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  assignButtonText: {
    fontWeight: "700",
    fontSize: 12,
  },
});
