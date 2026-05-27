/**
 * Offline Status Banner Component
 *
 * Shows when user is offline with count of pending syncs
 */

import { useNetworkStatus, usePendingQueue } from "@/lib/offline/hooks";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export function OfflineBanner() {
  const networkStatus = useNetworkStatus();
  const { count } = usePendingQueue();
  const router = useRouter();

  if (networkStatus === "online" && count === 0) {
    return null;
  }

  return (
    <Pressable
      style={[
        styles.banner,
        networkStatus === "offline" && styles.offlineBanner,
      ]}
      onPress={() => {
        if (count > 0) {
          router.push("/(foreman-stack)/sync-queue");
        }
      }}
    >
      <View style={styles.bannerContent}>
        <MaterialCommunityIcons
          name={networkStatus === "offline" ? "wifi-off" : "cloud-upload"}
          size={18}
          color={networkStatus === "offline" ? "#ef4444" : "#f59e0b"}
        />
        <Text style={styles.bannerText}>
          {networkStatus === "offline"
            ? "Offline"
            : `${count} pending sync${count !== 1 ? "s" : ""}`}
        </Text>
      </View>
      {count > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count}</Text>
        </View>
      )}
    </Pressable>
  );
}

/**
 * Header Icon for Sync Queue (to be added to header right)
 */
export function SyncQueueIcon() {
  const { count } = usePendingQueue();
  const router = useRouter();

  if (count === 0) {
    return null;
  }

  return (
    <Pressable
      style={styles.headerIcon}
      onPress={() => router.push("/(foreman-stack)/sync-queue")}
    >
      <MaterialCommunityIcons
        name="cloud-upload-outline"
        size={22}
        color="#f59e0b"
      />
      <View style={styles.headerBadge}>
        <Text style={styles.headerBadgeText}>{count}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderBottomColor: "#f59e0b",
    borderBottomWidth: 1,
  },
  offlineBanner: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderBottomColor: "#ef4444",
  },
  bannerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  bannerText: {
    color: "#f3f4f6",
    fontSize: 14,
    fontWeight: "600",
  },
  badge: {
    backgroundColor: "#f59e0b",
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#000",
    fontSize: 12,
    fontWeight: "700",
  },
  headerIcon: {
    position: "relative",
    padding: 8,
    marginRight: 8,
  },
  headerBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    backgroundColor: "#ef4444",
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
});
