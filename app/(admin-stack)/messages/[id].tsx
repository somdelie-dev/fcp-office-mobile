import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import LoadingOverlay from "@/components/LoadingOverlay";
import {
  AUDIENCE_LABEL,
  MESSAGE_ACCENT,
  dateTimeLabel,
  messageThemes,
  peopleLabel,
  type MessageColors,
} from "@/lib/adminMessages";
import {
  apiAdminDeleteMessage,
  apiAdminMessageDetail,
  type MessageRecipientStatusDto,
  type SentMessageDto,
} from "@/lib/apiClient";
import { useTheme } from "@/lib/themeContext";

type ReadFilter = "ALL" | "READ" | "UNREAD";

function RecipientRow({
  item,
  colors,
}: {
  item: MessageRecipientStatusDto;
  colors: MessageColors;
}) {
  return (
    <View style={[styles.recipientRow, { borderTopColor: colors.rowBorder }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={[styles.recipientName, { color: colors.textPrimary }]}
          numberOfLines={1}
        >
          {item.name}
        </Text>
        <Text style={[styles.recipientRole, { color: colors.textSecondary }]}>
          {item.role === "FOREMAN"
            ? "Foreman"
            : item.role === "SUPERVISOR"
              ? "Supervisor"
              : item.role}
        </Text>
      </View>
      {item.isRead ? (
        <View style={styles.statusRead}>
          <Ionicons name="checkmark-done" size={14} color={MESSAGE_ACCENT} />
          <Text style={[styles.statusText, { color: MESSAGE_ACCENT }]}>
            {item.readAt ? `Read ${dateTimeLabel(item.readAt)}` : "Read"}
          </Text>
        </View>
      ) : (
        <View style={styles.statusUnread}>
          <Ionicons name="time-outline" size={14} color="#f59e0b" />
          <Text style={[styles.statusText, { color: "#f59e0b" }]}>
            Not read
          </Text>
        </View>
      )}
    </View>
  );
}

export default function MessageDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const colors = messageThemes[theme];

  const [message, setMessage] = useState<SentMessageDto | null>(null);
  const [recipients, setRecipients] = useState<MessageRecipientStatusDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ReadFilter>("ALL");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!id) return;
      if (isRefresh) setRefreshing(true);
      setError(null);
      try {
        const res = await apiAdminMessageDetail(id);
        setMessage(res.message);
        setRecipients(res.recipients ?? []);
      } catch (e: any) {
        setError(e?.message ?? "Could not load the message.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [id],
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const readCount = recipients.filter((r) => r.isRead).length;
  const total = recipients.length;
  const visible = useMemo(
    () =>
      recipients.filter((r) =>
        filter === "READ" ? r.isRead : filter === "UNREAD" ? !r.isRead : true,
      ),
    [recipients, filter],
  );

  const deleteMessage = async () => {
    if (!message) return;
    setDeleting(true);
    try {
      await apiAdminDeleteMessage(message.id);
      setConfirmDelete(false);
      router.back();
    } catch (e: any) {
      Alert.alert(
        "Delete failed",
        e?.message ?? "Could not delete the message.",
      );
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <AuthStyleBackground>
        <LoadingOverlay title="Loading message…" message="Please wait" />
      </AuthStyleBackground>
    );
  }

  if (!message) {
    return (
      <AuthStyleBackground>
        <View style={styles.stateWrap}>
          <Ionicons name="alert-circle" size={48} color="#ef4444" />
          <Text style={[styles.errorText, { color: colors.textPrimary }]}>
            {error ?? "Message not found."}
          </Text>
          <Pressable onPress={() => load()} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      </AuthStyleBackground>
    );
  }

  const ratio = total > 0 ? readCount / total : 0;
  const filters: { key: ReadFilter; label: string }[] = [
    { key: "ALL", label: `All (${total})` },
    { key: "READ", label: `Read (${readCount})` },
    { key: "UNREAD", label: `Not read (${total - readCount})` },
  ];

  const header = (
    <View>
      <View
        style={[
          styles.messageCard,
          { backgroundColor: colors.cardBg, borderColor: colors.rowBorder },
        ]}
      >
        <View style={styles.messageHead}>
          <Text style={[styles.messageTitle, { color: colors.textPrimary }]}>
            {message.title}
          </Text>
          <Pressable
            onPress={() => setConfirmDelete(true)}
            style={styles.deleteIconBtn}
            hitSlop={8}
            accessibilityLabel="Delete message"
          >
            <Ionicons name="trash-outline" size={18} color="#dc2626" />
          </Pressable>
        </View>
        <Text style={[styles.messageBody, { color: colors.textPrimary }]}>
          {message.body}
        </Text>
        <View style={[styles.metaRow, { borderTopColor: colors.rowBorder }]}>
          <View style={styles.audienceBadge}>
            <Ionicons name="people-outline" size={12} color="#6b7280" />
            <Text style={styles.audienceText}>
              {AUDIENCE_LABEL[message.audience]}
            </Text>
          </View>
          <Text style={[styles.metaText, { color: colors.textSecondary }]}>
            {dateTimeLabel(message.createdAt)} · {message.sentBy}
          </Text>
        </View>
      </View>

      <View style={styles.readHeader}>
        <Text style={[styles.readTitle, { color: colors.textPrimary }]}>
          Read by {readCount} of {total}
        </Text>
        <Text style={[styles.readPercent, { color: colors.textSecondary }]}>
          {Math.round(ratio * 100)}%
        </Text>
      </View>
      <View style={[styles.readTrack, { backgroundColor: colors.inputBg }]}>
        <View
          style={[
            styles.readFill,
            {
              width: `${Math.round(ratio * 100)}%`,
              backgroundColor: readCount >= total ? MESSAGE_ACCENT : "#3b82f6",
            },
          ]}
        />
      </View>

      <View style={styles.filterRow}>
        {filters.map((f) => {
          const active = filter === f.key;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[
                styles.filterChip,
                active
                  ? {
                      backgroundColor: MESSAGE_ACCENT,
                      borderColor: MESSAGE_ACCENT,
                    }
                  : {
                      borderColor: colors.rowBorder,
                      backgroundColor: colors.inputBg,
                    },
              ]}
            >
              <Text
                style={[
                  styles.filterText,
                  { color: active ? "#fff" : colors.textSecondary },
                ]}
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  return (
    <AuthStyleBackground>
      <FlatList
        data={visible}
        keyExtractor={(r) => r.userId}
        ListHeaderComponent={header}
        renderItem={({ item }) => <RecipientRow item={item} colors={colors} />}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
          />
        }
        ListEmptyComponent={
          <Text style={[styles.noneText, { color: colors.textSecondary }]}>
            {filter === "UNREAD" ? "Everyone has read it." : "No one here yet."}
          </Text>
        }
      />

      <Modal
        visible={confirmDelete}
        transparent
        animationType="fade"
        onRequestClose={deleting ? undefined : () => setConfirmDelete(false)}
      >
        <View style={styles.confirmOverlay}>
          <View
            style={[styles.confirmCard, { backgroundColor: colors.sheetBg }]}
          >
            <View style={styles.confirmIcon}>
              <Ionicons name="trash-outline" size={28} color="#dc2626" />
            </View>
            <Text style={[styles.confirmTitle, { color: colors.textPrimary }]}>
              Delete this message?
            </Text>
            <Text style={[styles.confirmNote, { color: colors.textSecondary }]}>
              &quot;{message.title}&quot; will be removed from the sent list and
              from the notifications of all {peopleLabel(total)} who received
              it. Phone notifications already delivered cannot be pulled back.
            </Text>
            <View style={styles.confirmActions}>
              <Pressable
                style={[
                  styles.confirmBtn,
                  styles.outlineBtn,
                  { borderColor: colors.rowBorder },
                ]}
                onPress={() => setConfirmDelete(false)}
                disabled={deleting}
              >
                <Text
                  style={[styles.confirmBtnText, { color: colors.textPrimary }]}
                >
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                style={[styles.confirmBtn, { backgroundColor: "#dc2626" }]}
                onPress={deleteMessage}
                disabled={deleting}
              >
                {deleting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={[styles.confirmBtnText, { color: "#fff" }]}>
                    Delete
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </AuthStyleBackground>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32 },
  messageCard: { borderWidth: 1, borderRadius: 5, padding: 14 },
  messageHead: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  messageTitle: { flex: 1, fontSize: 18, fontWeight: "900" },
  deleteIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 5,
    backgroundColor: "rgba(220,38,38,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  messageBody: { fontSize: 14, lineHeight: 21, marginTop: 8 },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
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
  },
  audienceText: { fontSize: 11, fontWeight: "800", color: "#6b7280" },
  metaText: { fontSize: 11, fontWeight: "600" },

  readHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 18,
    marginBottom: 6,
  },
  readTitle: { fontSize: 15, fontWeight: "900" },
  readPercent: { fontSize: 13, fontWeight: "800" },
  readTrack: { height: 8, borderRadius: 4, overflow: "hidden" },
  readFill: { height: 8, borderRadius: 4 },

  filterRow: { flexDirection: "row", gap: 8, marginTop: 14, marginBottom: 6 },
  filterChip: {
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 5,
    borderWidth: 1,
    justifyContent: "center",
  },
  filterText: { fontSize: 12, fontWeight: "800" },

  recipientRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  recipientName: { fontSize: 14, fontWeight: "800" },
  recipientRole: { fontSize: 11, fontWeight: "600", marginTop: 1 },
  statusRead: { flexDirection: "row", alignItems: "center", gap: 4 },
  statusUnread: { flexDirection: "row", alignItems: "center", gap: 4 },
  statusText: { fontSize: 12, fontWeight: "800" },
  noneText: { textAlign: "center", paddingVertical: 24, fontSize: 14 },

  stateWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  errorText: { fontSize: 16, textAlign: "center", marginTop: 12 },
  retryBtn: {
    marginTop: 16,
    backgroundColor: MESSAGE_ACCENT,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 5,
  },
  retryText: { color: "#fff", fontWeight: "700" },

  confirmOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    padding: 24,
  },
  confirmCard: { borderRadius: 14, padding: 20, alignItems: "center" },
  confirmIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(220,38,38,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  confirmTitle: { fontSize: 18, fontWeight: "900", textAlign: "center" },
  confirmNote: {
    fontSize: 13,
    fontWeight: "500",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 19,
  },
  confirmActions: {
    alignSelf: "stretch",
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },
  confirmBtn: {
    flex: 1,
    height: 48,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  outlineBtn: { borderWidth: 1, backgroundColor: "transparent" },
  confirmBtnText: { fontSize: 15, fontWeight: "900" },
});
