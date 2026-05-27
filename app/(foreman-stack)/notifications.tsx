import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNotifications, type AppNotification } from "../../lib/useNotifications";
import { useTheme } from "../../lib/themeContext";

const TYPE_ICON: Record<string, { name: any; color: string }> = {
  PHOTO_REJECTED: { name: "image-outline", color: "#ef4444" },
  PHOTO_REQUESTED: { name: "camera-outline", color: "#f59e0b" },
  TIMESHEET_APPROVED: { name: "checkmark-circle-outline", color: "#22c55e" },
  TIMESHEET_REJECTED: { name: "close-circle-outline", color: "#ef4444" },
  TIMESHEET_SUBMITTED: { name: "document-text-outline", color: "#3b82f6" },
  GENERAL: { name: "notifications-outline", color: "#6b7280" },
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function NotifItem({
  item,
  isDark,
  onPress,
}: {
  item: AppNotification;
  isDark: boolean;
  onPress: () => void;
}) {
  const icon = TYPE_ICON[item.type] ?? TYPE_ICON.GENERAL;

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.item,
        {
          backgroundColor: item.isRead
            ? isDark ? "#1e293b" : "#f8fafc"
            : isDark ? "#1e3a5f" : "#eff6ff",
          borderLeftColor: item.isRead ? "transparent" : icon.color,
        },
      ]}
    >
      <View
        style={[
          styles.iconWrap,
          { backgroundColor: icon.color + "22" },
        ]}
      >
        <Ionicons name={icon.name} size={20} color={icon.color} />
      </View>
      <View style={styles.itemContent}>
        <View style={styles.itemHeader}>
          <Text
            style={[
              styles.itemTitle,
              { color: isDark ? "#f1f5f9" : "#0f172a" },
              !item.isRead && { fontWeight: "700" },
            ]}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <Text style={styles.itemTime}>{timeAgo(item.createdAt)}</Text>
        </View>
        <Text
          style={[styles.itemMessage, { color: isDark ? "#94a3b8" : "#475569" }]}
          numberOfLines={2}
        >
          {item.message}
        </Text>
      </View>
      {!item.isRead && <View style={[styles.dot, { backgroundColor: icon.color }]} />}
    </Pressable>
  );
}

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const { notifications, unreadCount, loading, refresh, markAllRead, markRead } =
    useNotifications();

  // Mark all as read when screen is opened
  useEffect(() => {
    if (unreadCount > 0) {
      markAllRead();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleItemPress = (item: AppNotification) => {
    if (!item.isRead) markRead([item.id]);

    if (item.type === "PHOTO_REJECTED" || item.type === "PHOTO_REQUESTED") {
      router.push({
        pathname: "/(foreman-stack)/SiteDayPhotoScreen",
        params: { siteId: item.siteId ?? "" },
      });
    }
  };

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top,
          backgroundColor: isDark ? "#0f172a" : "#f1f5f9",
        },
      ]}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: isDark ? "#1e293b" : "#e2e8f0" }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Ionicons
            name="chevron-back"
            size={24}
            color={isDark ? "#f1f5f9" : "#0f172a"}
          />
        </Pressable>
        <Text style={[styles.headerTitle, { color: isDark ? "#f1f5f9" : "#0f172a" }]}>
          Notifications
        </Text>
        {unreadCount > 0 ? (
          <Pressable onPress={markAllRead} hitSlop={12}>
            <Text style={styles.markAllText}>Mark all read</Text>
          </Pressable>
        ) : (
          <View style={{ width: 72 }} />
        )}
      </View>

      {loading && notifications.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color="#3b82f6" />
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.center}>
          <Ionicons
            name="notifications-off-outline"
            size={48}
            color={isDark ? "#334155" : "#cbd5e1"}
          />
          <Text style={[styles.emptyText, { color: isDark ? "#475569" : "#94a3b8" }]}>
            No notifications yet
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(n) => n.id}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={refresh} tintColor="#3b82f6" />
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          ItemSeparatorComponent={() => (
            <View style={{ height: 1, backgroundColor: isDark ? "#1e293b" : "#e2e8f0" }} />
          )}
          renderItem={({ item }) => (
            <NotifItem
              item={item}
              isDark={isDark}
              onPress={() => handleItemPress(item)}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: { width: 32 },
  headerTitle: { fontSize: 17, fontWeight: "700" },
  markAllText: { fontSize: 13, color: "#3b82f6", fontWeight: "600" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  emptyText: { fontSize: 15 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderLeftWidth: 3,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
  },
  itemContent: { flex: 1 },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 3,
  },
  itemTitle: { fontSize: 14, flex: 1, marginRight: 8 },
  itemTime: { fontSize: 11, color: "#94a3b8" },
  itemMessage: { fontSize: 13, lineHeight: 18 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
