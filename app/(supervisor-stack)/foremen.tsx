import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Dimensions,
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
  apiSupervisorAllForemen,
  type ForemanOptionDto,
} from "@/lib/apiClient";

const { width } = Dimensions.get("window");

function ForemanRow({
  item,
  isLast,
}: {
  item: ForemanOptionDto;
  isLast: boolean;
}) {
  return (
    <View style={[styles.foremanRow, !isLast && styles.foremanRowBorder]}>
      <View style={styles.foremanContent}>
        <View style={styles.foremanTextContainer}>
          <Text style={styles.foremanName} numberOfLines={1}>
            {item.name}
          </Text>
          {item.email ? (
            <Text style={styles.foremanEmail} numberOfLines={1}>
              {item.email}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export default function SupervisorForemenScreen() {
  const searchInputRef = useRef<TextInput>(null);

  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ForemanOptionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchActive, setSearchActive] = useState(false);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => {
      return (
        r.name.toLowerCase().includes(s) ||
        String(r.email ?? "")
          .toLowerCase()
          .includes(s)
      );
    });
  }, [rows, q]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiSupervisorAllForemen();
      setRows(res.foremen ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load foremen.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await apiSupervisorAllForemen();
      setRows(res.foremen ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to refresh.");
    } finally {
      setRefreshing(false);
    }
  }, []);

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
          <Text style={styles.pageTitle}>Foremen</Text>
          <Text style={styles.pageSubtitle}>
            Overview of all foremen you supervise
          </Text>
        </View>

        {/* Professional Search Bar */}
        <View style={styles.searchSection}>
          <Pressable
            onPress={() => searchInputRef.current?.focus()}
            style={[
              styles.searchContainer,
              searchActive && styles.searchContainerActive,
            ]}
          >
            <Text style={styles.searchIconText} pointerEvents="none">
              🔍
            </Text>
            <TextInput
              ref={searchInputRef}
              style={styles.searchInputField}
              placeholder="Search by name or email…"
              placeholderTextColor="#999"
              value={q}
              onChangeText={setQ}
              onFocus={() => setSearchActive(true)}
              onBlur={() => setSearchActive(false)}
              selectionColor="#007AFF"
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
                <Text style={styles.clearButtonText}>✕</Text>
              </TouchableOpacity>
            )}
          </Pressable>
          {filtered.length > 0 && (
            <Text style={styles.resultCount}>
              {filtered.length} foreman{filtered.length !== 1 ? "s" : ""} found
            </Text>
          )}
        </View>

        {/* Error Message */}
        {error && <Text style={styles.errorMessage}>{error}</Text>}

        {/* Foremen List */}
        <FlatList
          data={filtered}
          keyExtractor={(x) => x.foremanId}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} />
          }
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            loading ? (
              <LoadingOverlay
                icon="⏳"
                title="Loading foremen…"
                message="Please wait while we fetch your foremen"
              />
            ) : (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyIcon}>{q ? "🔍" : "👤"}</Text>
                <Text style={styles.emptyTitle}>
                  {q ? "No foremen found" : "No foremen"}
                </Text>
                <Text style={styles.emptyMessage}>
                  {q
                    ? "Try adjusting your search criteria"
                    : "No foremen available"}
                </Text>
              </View>
            )
          }
          renderItem={({ item, index }) => (
            <ForemanRow item={item} isLast={index === filtered.length - 1} />
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
  pageTitle: {
    fontSize: 28,
    fontWeight: "900",
    color: "#111",
    letterSpacing: -0.5,
  },
  pageSubtitle: {
    marginTop: 6,
    fontSize: 14,
    color: "#666",
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
    backgroundColor: "#f5f5f5",
    borderWidth: 1.5,
    borderColor: "#e0e0e0",
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
    color: "#666",
  },
  searchInputField: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
    color: "#111",
    padding: 0,
    margin: 0,
  },
  clearButton: {
    padding: 8,
    marginLeft: 8,
  },
  clearButtonText: {
    fontSize: 18,
    color: "#999",
    fontWeight: "600",
  },
  resultCount: {
    marginTop: 8,
    fontSize: 12,
    color: "#999",
    fontWeight: "600",
  },

  // Error Message
  errorMessage: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "rgba(176, 0, 32, 0.08)",
    color: "#b00020",
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
    color: "#111",
    marginBottom: 8,
    textAlign: "center",
  },
  emptyMessage: {
    fontSize: 14,
    color: "#999",
    fontWeight: "500",
    textAlign: "center",
    lineHeight: 20,
  },

  // Foreman Row Styles
  foremanRow: {
    paddingVertical: 14,
    paddingHorizontal: 0,
  },
  foremanRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  foremanContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  foremanTextContainer: {
    flex: 1,
  },
  foremanName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111",
    marginBottom: 4,
  },
  foremanEmail: {
    fontSize: 13,
    color: "#666",
    fontWeight: "500",
  },
});
