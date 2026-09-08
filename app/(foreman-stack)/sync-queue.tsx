/**
 * Sync Queue Debug Screen
 *
 * Shows:
 * - Network status
 * - Pending queue items with error messages
 * - Statistics (total, pending, synced, failed)
 * - Retry and cancel buttons
 */

import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import { GlassCard } from "@/components/GlassCard";
import { useNetworkStatus, usePendingQueue } from "@/lib/offline/hooks";
import { cancelQueueItem } from "@/lib/offline/queue";
import { getOfflineStats } from "@/lib/offline/storage";
import { forceSyncNow } from "@/lib/offline/sync";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

export default function SyncQueueScreen() {
  const networkStatus = useNetworkStatus();
  const { items, count, loading, refresh } = usePendingQueue();
  const [syncing, setSyncing] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const loadStats = useCallback(async () => {
    try {
      const s = await getOfflineStats();
      setStats(s);
    } catch (e) {
      console.error("Failed to load stats:", e);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadStats();
      refresh();
    }, [loadStats, refresh]),
  );

  const handleForceSyncNow = async () => {
    setSyncing(true);
    try {
      await forceSyncNow();
      await refresh();
      await loadStats();
    } catch (e) {
      console.error("Sync error:", e);
    } finally {
      setSyncing(false);
    }
  };

  const handleCancel = async (itemId: string) => {
    try {
      await cancelQueueItem(itemId);
      await refresh();
      await loadStats();
    } catch (e) {
      console.error("Failed to cancel item:", e);
    }
  };

  return (
    <AuthStyleBackground>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        {/* Network Status Card */}
        <GlassCard style={styles.card}>
          <View style={styles.networkHeader}>
            <MaterialCommunityIcons
              name={networkStatus === "online" ? "wifi" : "wifi-off"}
              size={24}
              color={networkStatus === "online" ? "#10b981" : "#ef4444"}
            />
            <Text
              style={[
                styles.networkStatus,
                {
                  color: networkStatus === "online" ? "#10b981" : "#ef4444",
                },
              ]}
            >
              {networkStatus === "online" ? "Online" : "Offline"}
            </Text>
          </View>
          <Text style={styles.networkDescription}>
            {networkStatus === "online"
              ? "Connected to server. Syncing in progress..."
              : "No network connection. Changes will sync when online."}
          </Text>
        </GlassCard>

        {/* Stats Card */}
        {!statsLoading && stats && (
          <GlassCard style={styles.card}>
            <Text style={styles.cardTitle}>Sync Statistics</Text>

            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Total Queue</Text>
                <Text style={styles.statValue}>{stats.queue.total}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Pending</Text>
                <Text style={[styles.statValue, { color: "#f59e0b" }]}>
                  {stats.queue.pending}
                </Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Synced</Text>
                <Text style={[styles.statValue, { color: "#10b981" }]}>
                  {stats.queue.done}
                </Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Failed</Text>
                <Text style={[styles.statValue, { color: "#ef4444" }]}>
                  {stats.queue.failed}
                </Text>
              </View>
            </View>
          </GlassCard>
        )}

        {/* Sync Button */}
        <Pressable
          style={[styles.syncButton, syncing && styles.syncButtonDisabled]}
          disabled={syncing}
          onPress={handleForceSyncNow}
        >
          {syncing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="refresh" size={20} color="#fff" />
          )}
          <Text style={styles.syncButtonText}>
            {syncing ? "Syncing..." : "Force Sync Now"}
          </Text>
        </Pressable>

        {/* Queue Items */}
        <View style={styles.queueSection}>
          <Text style={styles.sectionTitle}>Queue Items ({count} pending)</Text>

          {loading ? (
            <ActivityIndicator
              size="large"
              color="#8b5cf6"
              style={styles.loader}
            />
          ) : items.length === 0 ? (
            <GlassCard style={styles.card}>
              <Text style={styles.emptyText}>No pending items</Text>
            </GlassCard>
          ) : (
            <FlatList
              scrollEnabled={false}
              data={items}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <GlassCard style={[styles.card, styles.queueItemCard] as any}>
                  <View style={styles.queueItemHeader}>
                    <View style={styles.queueItemTypeAndStatus}>
                      <Text style={styles.queueItemType}>{item.type}</Text>
                      <View
                        style={[
                          styles.statusBadge,
                          {
                            backgroundColor: getStatusColor(item.status),
                          },
                        ]}
                      >
                        <Text style={styles.statusBadgeText}>
                          {item.status}
                        </Text>
                      </View>
                    </View>
                    {item.status === "failed" && (
                      <Pressable
                        style={styles.cancelButton}
                        onPress={() => handleCancel(item.id)}
                      >
                        <Ionicons name="close" size={18} color="#ef4444" />
                      </Pressable>
                    )}
                  </View>

                  {item.lastError && (
                    <Text style={styles.errorText}>
                      Error: {item.lastError}
                    </Text>
                  )}

                  <View style={styles.queueItemMeta}>
                    <Text style={styles.metaText}>
                      Attempts: {item.attemptCount}
                    </Text>
                    <Text style={styles.metaText}>
                      Created: {new Date(item.createdAt).toLocaleTimeString()}
                    </Text>
                  </View>

                  {item.payload && (
                    <View style={styles.payloadSection}>
                      <Text style={styles.payloadLabel}>Payload:</Text>
                      <Text style={styles.payloadText}>
                        {JSON.stringify(item.payload, null, 2)}
                      </Text>
                    </View>
                  )}
                </GlassCard>
              )}
            />
          )}
        </View>
      </ScrollView>
    </AuthStyleBackground>
  );
}

function getStatusColor(status: string): string {
  switch (status) {
    case "pending":
      return "#f59e0b"; // amber
    case "inflight":
      return "#3b82f6"; // blue
    case "done":
      return "#10b981"; // green
    case "failed":
      return "#ef4444"; // red
    case "canceled":
      return "#6b7280"; // gray
    default:
      return "#9ca3af";
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    marginBottom: 16,
    padding: 16,
  },
  networkHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  networkStatus: {
    fontSize: 18,
    fontWeight: "600",
    marginLeft: 12,
  },
  networkDescription: {
    fontSize: 14,
    color: "#9ca3af",
    marginTop: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#f3f4f6",
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  statItem: {
    width: "48%",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    alignItems: "center",
  },
  statLabel: {
    fontSize: 12,
    color: "#9ca3af",
    marginBottom: 4,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "700",
    color: "#f3f4f6",
  },
  syncButton: {
    flexDirection: "row",
    backgroundColor: "#8b5cf6",
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  syncButtonDisabled: {
    opacity: 0.6,
  },
  syncButtonText: {
    color: "#fff",
    fontWeight: "600",
    marginLeft: 8,
    fontSize: 14,
  },
  queueSection: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#f3f4f6",
    marginBottom: 12,
  },
  loader: {
    marginVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    color: "#9ca3af",
    textAlign: "center",
    paddingVertical: 20,
  },
  queueItemCard: {
    marginBottom: 12,
  },
  queueItemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  queueItemTypeAndStatus: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  queueItemType: {
    fontSize: 14,
    fontWeight: "600",
    color: "#f3f4f6",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#fff",
    textTransform: "uppercase",
  },
  cancelButton: {
    padding: 8,
  },
  errorText: {
    fontSize: 12,
    color: "#fca5a5",
    marginBottom: 8,
    fontStyle: "italic",
  },
  queueItemMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  metaText: {
    fontSize: 12,
    color: "#d1d5db",
  },
  payloadSection: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
  },
  payloadLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#9ca3af",
    marginBottom: 4,
  },
  payloadText: {
    fontSize: 11,
    color: "#d1d5db",
    fontFamily: "monospace",
  },
});
