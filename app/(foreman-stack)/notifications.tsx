import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
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

import {
  useNotifications,
  type AppNotification,
} from "../../lib/useNotifications";
import { useTheme } from "../../lib/themeContext";

const TYPE_ICON: Record<string, { name: any; color: string }> = {
  PHOTO_REJECTED: {
    name: "image-outline",
    color: "#ef4444",
  },
  PHOTO_REQUESTED: {
    name: "camera-outline",
    color: "#f59e0b",
  },
  TIMESHEET_APPROVED: {
    name: "checkmark-circle-outline",
    color: "#22c55e",
  },
  TIMESHEET_REJECTED: {
    name: "close-circle-outline",
    color: "#ef4444",
  },
  TIMESHEET_SUBMITTED: {
    name: "document-text-outline",
    color: "#3b82f6",
  },
  SCAN_OUT_REMINDER: {
    name: "time-outline",
    color: "#f59e0b",
  },
  FACE_VERIFICATION_MISSING: {
    name: "scan-outline",
    color: "#ef4444",
  },
  GENERAL: {
    name: "notifications-outline",
    color: "#6b7280",
  },
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();

  const mins = Math.floor(diff / 60_000);

  if (mins < 1) return "just now";

  if (mins < 60) {
    return `${mins}m ago`;
  }

  const hrs = Math.floor(mins / 60);

  if (hrs < 24) {
    return `${hrs}h ago`;
  }

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
      style={({ pressed }) => [
        styles.item,
        {
          backgroundColor: item.isRead
            ? isDark
              ? "#111c2c"
              : "#ffffff"
            : isDark
              ? "#172b43"
              : "#eff6ff",

          borderLeftColor: item.isRead ? "transparent" : icon.color,
        },

        pressed && {
          opacity: 0.75,
        },
      ]}
    >
      <View
        style={[
          styles.iconWrap,
          {
            backgroundColor: icon.color + "22",
          },
        ]}
      >
        <Ionicons name={icon.name} size={20} color={icon.color} />
      </View>

      <View style={styles.itemContent}>
        <View style={styles.itemHeader}>
          <Text
            style={[
              styles.itemTitle,
              {
                color: isDark ? "#f1f5f9" : "#0f172a",
              },
              !item.isRead && {
                fontWeight: "700",
              },
            ]}
            numberOfLines={1}
          >
            {item.title}
          </Text>

          <Text style={styles.itemTime}>{timeAgo(item.createdAt)}</Text>
        </View>

        <Text
          style={[
            styles.itemMessage,
            {
              color: isDark ? "#94a3b8" : "#475569",
            },
          ]}
          numberOfLines={2}
        >
          {item.message}
        </Text>
      </View>

      {!item.isRead && (
        <View
          style={[
            styles.dot,
            {
              backgroundColor: icon.color,
            },
          ]}
        />
      )}
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

  const handleItemPress = (item: AppNotification) => {
    if (!item.isRead) {
      markRead([item.id]);
    }

    if (item.type === "PHOTO_REJECTED" || item.type === "PHOTO_REQUESTED") {
      router.push({
        pathname: "/(foreman-stack)/SiteDayPhotoScreen",
        params: {
          siteId: item.siteId ?? "",
        },
      });

      return;
    }

    if (
      item.type === "SCAN_OUT_REMINDER" ||
      item.type === "FACE_VERIFICATION_MISSING"
    ) {
      router.push("/(foreman)/workers");

      return;
    }
  };

  const handleMarkAllRead = () => {
    if (unreadCount > 0) {
      markAllRead();
    }
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: isDark ? "#0f172a" : "#f1f5f9",
        },
      ]}
    >
      {/* -------------------------------------------------
          HEADER
      -------------------------------------------------- */}

      <View
        style={[
          styles.header,
          {
            borderBottomColor: isDark ? "#1e293b" : "#e2e8f0",
            backgroundColor: isDark ? "#0f172a" : "#f8fafc",
          },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={8}
        >
          <Ionicons
            name="chevron-back"
            size={24}
            color={isDark ? "#f1f5f9" : "#0f172a"}
          />
        </Pressable>

        <View style={styles.headerCenter}>
          <Text
            style={[
              styles.headerTitle,
              {
                color: isDark ? "#f1f5f9" : "#0f172a",
              },
            ]}
          >
            Notifications
          </Text>

          {unreadCount > 0 && (
            <View
              style={[
                styles.unreadBadge,
                {
                  backgroundColor: "#22c55e",
                },
              ]}
            >
              <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>

        <Pressable onPress={handleMarkAllRead} hitSlop={8}>
          <Text style={styles.markAllText}>Mark all</Text>
        </Pressable>
      </View>

      {/* -------------------------------------------------
          CONTENT
      -------------------------------------------------- */}

      {loading && notifications.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color="#22c55e" />

          <Text
            style={[
              styles.loadingText,
              {
                color: isDark ? "#64748b" : "#94a3b8",
              },
            ]}
          >
            Loading notifications...
          </Text>
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.center}>
          <View
            style={[
              styles.emptyIcon,
              {
                backgroundColor: isDark ? "#172033" : "#e2e8f0",
              },
            ]}
          >
            <Ionicons
              name="notifications-off-outline"
              size={34}
              color={isDark ? "#475569" : "#94a3b8"}
            />
          </View>

          <Text
            style={[
              styles.emptyTitle,
              {
                color: isDark ? "#f1f5f9" : "#0f172a",
              },
            ]}
          >
            No notifications yet
          </Text>

          <Text
            style={[
              styles.emptyText,
              {
                color: isDark ? "#64748b" : "#94a3b8",
              },
            ]}
          >
            You're all caught up.
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(n) => n.id}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={refresh}
              tintColor="#22c55e"
            />
          }
          contentContainerStyle={{
            paddingBottom: insets.bottom + 16,
          }}
          ItemSeparatorComponent={() => (
            <View
              style={{
                height: 1,
                backgroundColor: isDark ? "#1e293b" : "#e2e8f0",
              }}
            />
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
  container: {
    flex: 1,
  },

  header: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },

  backBtn: {
    width: 40,
    height: 40,
    alignItems: "flex-start",
    justifyContent: "center",
  },

  headerCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },

  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
  },

  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
  },

  unreadBadgeText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "800",
  },

  markAllText: {
    color: "#22c55e",
    fontSize: 13,
    fontWeight: "700",
  },

  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderLeftWidth: 3,
  },

  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },

  itemContent: {
    flex: 1,
    minWidth: 0,
  },

  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },

  itemTitle: {
    fontSize: 14,
    flex: 1,
    marginRight: 8,
  },

  itemTime: {
    fontSize: 11,
    color: "#94a3b8",
  },

  itemMessage: {
    fontSize: 13,
    lineHeight: 18,
  },

  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 30,
  },

  loadingText: {
    fontSize: 13,
  },

  emptyIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },

  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
  },

  emptyText: {
    fontSize: 14,
  },
});
