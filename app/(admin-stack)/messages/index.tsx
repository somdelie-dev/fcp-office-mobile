import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import LoadingOverlay from "@/components/LoadingOverlay";
import {
  AUDIENCE_LABEL,
  MESSAGE_ACCENT,
  messageThemes,
  relativeTime,
  type MessageColors,
} from "@/lib/adminMessages";
import { apiAdminMessages, type SentMessageDto } from "@/lib/apiClient";
import { useTheme } from "@/lib/themeContext";

function MessageCard({
  item,
  colors,
  onPress,
}: {
  item: SentMessageDto;
  colors: MessageColors;
  onPress: () => void;
}) {
  const allRead = item.readCount >= item.recipientCount;
  const ratio =
    item.recipientCount > 0 ? item.readCount / item.recipientCount : 0;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.cardBg,
          borderColor: colors.rowBorder,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <View style={styles.cardTop}>
        <View style={styles.iconWrap}>
          <Ionicons name="megaphone-outline" size={18} color="#3b82f6" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.titleRow}>
            <Text
              style={[styles.cardTitle, { color: colors.textPrimary }]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            <Text style={[styles.time, { color: colors.textSecondary }]}>
              {relativeTime(item.createdAt)}
            </Text>
          </View>
          <Text
            style={[styles.cardBody, { color: colors.textSecondary }]}
            numberOfLines={2}
          >
            {item.body}
          </Text>
        </View>
      </View>

      <View style={[styles.cardFooter, { borderTopColor: colors.rowBorder }]}>
        <View style={styles.audienceBadge}>
          <Ionicons name="people-outline" size={12} color="#6b7280" />
          <Text style={styles.audienceText}>
            {AUDIENCE_LABEL[item.audience]}
          </Text>
        </View>
        <View style={styles.readWrap}>
          <View style={[styles.readTrack, { backgroundColor: colors.inputBg }]}>
            <View
              style={[
                styles.readFill,
                {
                  width: `${Math.round(ratio * 100)}%`,
                  backgroundColor: allRead ? MESSAGE_ACCENT : "#3b82f6",
                },
              ]}
            />
          </View>
          <Text
            style={[
              styles.readText,
              { color: allRead ? MESSAGE_ACCENT : colors.textSecondary },
            ]}
          >
            Read {item.readCount}/{item.recipientCount}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function AdminMessagesScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const colors = messageThemes[theme];
  const isDark = theme === "dark";

  const [messages, setMessages] = useState<SentMessageDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError(null);
    try {
      const res = await apiAdminMessages();
      setMessages(res.messages ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Could not load messages.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Reload on focus so read counts and newly sent messages are current.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter(
      (m) =>
        m.title.toLowerCase().includes(q) || m.body.toLowerCase().includes(q),
    );
  }, [messages, search]);

  return (
    <AuthStyleBackground>
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              Messages
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Send notices to foremen and supervisors
            </Text>
          </View>
          <Pressable
            style={styles.newBtn}
            onPress={() => router.push("/(admin-stack)/messages/new" as any)}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.newBtnText}>New</Text>
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
          <View
            style={[
              styles.searchBox,
              {
                borderColor: colors.rowBorder,
                backgroundColor: colors.inputBg,
              },
            ]}
          >
            <Ionicons name="search" size={18} color={colors.textSecondary} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search sent messages…"
              placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
              style={[styles.searchInput, { color: colors.textPrimary }]}
              autoCapitalize="none"
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")} hitSlop={8}>
                <Ionicons
                  name="close-circle"
                  size={18}
                  color={colors.textSecondary}
                />
              </Pressable>
            )}
          </View>
        </View>

        {loading ? (
          <LoadingOverlay title="Loading messages…" message="Please wait" />
        ) : error && messages.length === 0 ? (
          <View style={styles.stateWrap}>
            <Ionicons name="alert-circle" size={48} color="#ef4444" />
            <Text style={[styles.errorText, { color: colors.textPrimary }]}>
              {error}
            </Text>
            <Pressable onPress={() => load()} style={styles.retryBtn}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => (
              <MessageCard
                item={item}
                colors={colors}
                onPress={() =>
                  router.push({
                    pathname: "/(admin-stack)/messages/[id]",
                    params: { id: item.id },
                  } as any)
                }
              />
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => load(true)}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Ionicons
                  name="mail-open-outline"
                  size={64}
                  color={colors.emptyText}
                />
                <Text style={[styles.emptyText, { color: colors.emptyText }]}>
                  {search.trim()
                    ? "No messages match your search"
                    : "No messages sent yet"}
                </Text>
                {!search.trim() && (
                  <Pressable
                    style={styles.retryBtn}
                    onPress={() =>
                      router.push("/(admin-stack)/messages/new" as any)
                    }
                  >
                    <Text style={styles.retryText}>Write a message</Text>
                  </Pressable>
                )}
              </View>
            }
          />
        )}
      </View>
    </AuthStyleBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: { fontSize: 18, fontWeight: "900" },
  subtitle: { fontSize: 12, fontWeight: "600", marginTop: 2 },
  newBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 5,
    backgroundColor: MESSAGE_ACCENT,
  },
  newBtnText: { color: "#fff", fontSize: 14, fontWeight: "800" },

  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 5,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14 },

  listContent: { paddingHorizontal: 16, paddingBottom: 32, flexGrow: 1 },
  card: { padding: 14, borderWidth: 1, borderRadius: 5, marginBottom: 12 },
  cardTop: { flexDirection: "row", gap: 12 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(59,130,246,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: "800" },
  time: { fontSize: 11, fontWeight: "600" },
  cardBody: { fontSize: 13, lineHeight: 18, marginTop: 3 },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  audienceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(107,114,128,0.15)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    flexShrink: 1,
  },
  audienceText: { fontSize: 11, fontWeight: "800", color: "#6b7280" },
  readWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  readTrack: { width: 60, height: 6, borderRadius: 3, overflow: "hidden" },
  readFill: { height: 6, borderRadius: 3 },
  readText: { fontSize: 12, fontWeight: "800" },

  stateWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
    paddingTop: 60,
  },
  errorText: { fontSize: 16, textAlign: "center", marginTop: 12 },
  emptyText: { fontSize: 16, textAlign: "center", marginTop: 16 },
  retryBtn: {
    marginTop: 16,
    backgroundColor: MESSAGE_ACCENT,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 5,
  },
  retryText: { color: "#fff", fontWeight: "700" },
});
