import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import {
  apiCalendarDelete,
  apiCalendarEvent,
  apiCalendarRespond,
  type CalendarEventDto,
} from "@/lib/apiClient";
import { useAuth } from "@/lib/auth";
import {
  CATEGORY_META,
  dayLabel,
  eventTimeRange,
  reminderLabel,
  syncLocalReminders,
} from "@/lib/calendar";
import { catalogueThemes } from "@/lib/paintsCatalogue";
import { useTheme } from "@/lib/themeContext";

const RESPONSE_META = {
  ACCEPTED: { label: "Going", icon: "checkmark-circle", color: "#16a34a" },
  DECLINED: { label: "Can't make it", icon: "close-circle", color: "#dc2626" },
  PENDING: { label: "No answer yet", icon: "time", color: "#d97706" },
} as const;

export default function CalendarEventScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const colors = catalogueThemes[theme];
  const { user } = useAuth();

  const [event, setEvent] = useState<CalendarEventDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = await apiCalendarEvent(id);
      setEvent(res.event);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "This event is no longer available.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const respond = async (response: "ACCEPTED" | "DECLINED") => {
    if (!event) return;
    setBusy(true);
    try {
      await apiCalendarRespond(event.id, response);
      await load();
      syncLocalReminders(user?.id);
    } catch (e: any) {
      Alert.alert(
        "Couldn't save your answer",
        e?.message ?? "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!event) return;
    setBusy(true);
    try {
      await apiCalendarDelete(event.id);
      setConfirmDelete(false);
      syncLocalReminders(user?.id);
      router.back();
    } catch (e: any) {
      Alert.alert("Couldn't delete", e?.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <AuthStyleBackground>
        <ActivityIndicator color="#22c55e" style={{ marginTop: 60 }} />
      </AuthStyleBackground>
    );
  }

  if (!event) {
    return (
      <AuthStyleBackground>
        <View style={styles.center}>
          <Ionicons
            name="calendar-clear-outline"
            size={48}
            color={colors.emptyText}
          />
          <Text style={[styles.errorText, { color: colors.textPrimary }]}>
            {error ?? "Event not found."}
          </Text>
        </View>
      </AuthStyleBackground>
    );
  }

  const meta = CATEGORY_META[event.category];
  const counts = {
    ACCEPTED: event.attendees.filter((a) => a.response === "ACCEPTED").length,
    PENDING: event.attendees.filter((a) => a.response === "PENDING").length,
    DECLINED: event.attendees.filter((a) => a.response === "DECLINED").length,
  };

  return (
    <AuthStyleBackground>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 110 },
        ]}
      >
        <View style={[styles.heroEdge, { backgroundColor: meta.edge }]}>
          <LinearGradient colors={meta.face} style={styles.hero}>
            <View style={styles.heroShine} />
            <View style={styles.heroCat}>
              <Ionicons name={meta.icon} size={14} color="#fff" />
              <Text style={styles.heroCatText}>{meta.label}</Text>
            </View>
            <Text style={styles.heroTitle}>{event.title}</Text>
            <Text style={styles.heroWhen}>
              {dayLabel(new Date(event.startsAt))}
            </Text>
            <Text style={styles.heroTime}>{eventTimeRange(event)}</Text>
          </LinearGradient>
        </View>

        <View
          style={[
            styles.card,
            { backgroundColor: colors.cardBg, borderColor: colors.rowBorder },
          ]}
        >
          {event.location ? (
            <InfoRow
              icon="location-outline"
              text={event.location}
              color={colors.textPrimary}
            />
          ) : null}
          <InfoRow
            icon="alarm-outline"
            text={reminderLabel(event.reminderMinutes)}
            color={colors.textPrimary}
          />
          <InfoRow
            icon="person-outline"
            text={`Created by ${event.isOwner ? "you" : event.createdBy.name}`}
            color={colors.textPrimary}
          />
          {event.description ? (
            <Text style={[styles.notes, { color: colors.textSecondary }]}>
              {event.description}
            </Text>
          ) : null}
        </View>

        {!event.isOwner && (
          <View
            style={[
              styles.card,
              { backgroundColor: colors.cardBg, borderColor: colors.rowBorder },
            ]}
          >
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
              Are you going?
            </Text>
            <View style={styles.respondRow}>
              {(["ACCEPTED", "DECLINED"] as const).map((r) => {
                const on = event.myResponse === r;
                const m = RESPONSE_META[r];
                return (
                  <Pressable
                    key={r}
                    disabled={busy}
                    onPress={() => respond(r)}
                    style={[
                      styles.respondBtn,
                      on
                        ? { backgroundColor: m.color, borderColor: m.color }
                        : { borderColor: colors.rowBorder },
                    ]}
                  >
                    <Ionicons
                      name={m.icon}
                      size={18}
                      color={on ? "#fff" : m.color}
                    />
                    <Text
                      style={[
                        styles.respondText,
                        { color: on ? "#fff" : colors.textPrimary },
                      ]}
                    >
                      {r === "ACCEPTED" ? "Going" : "Can't make it"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        <View
          style={[
            styles.card,
            { backgroundColor: colors.cardBg, borderColor: colors.rowBorder },
          ]}
        >
          <View style={styles.peopleHead}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
              People ({event.attendees.length})
            </Text>
            <Text style={[styles.countsText, { color: colors.textSecondary }]}>
              {counts.ACCEPTED} going · {counts.PENDING} waiting ·{" "}
              {counts.DECLINED} no
            </Text>
          </View>
          {event.attendees.map((a) => {
            const m = RESPONSE_META[a.response];
            return (
              <View
                key={a.userId}
                style={[styles.personRow, { borderTopColor: colors.rowBorder }]}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.personName, { color: colors.textPrimary }]}
                  >
                    {a.name}
                    {a.userId === user?.id ? " (you)" : ""}
                  </Text>
                  <Text
                    style={[styles.personRole, { color: colors.textSecondary }]}
                  >
                    {a.userId === event.createdBy.id
                      ? "Organiser"
                      : a.role.charAt(0) + a.role.slice(1).toLowerCase()}
                  </Text>
                </View>
                <Ionicons name={m.icon} size={16} color={m.color} />
                <Text style={[styles.personStatus, { color: m.color }]}>
                  {m.label}
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {event.isOwner && (
        <View
          style={[
            styles.bottomBar,
            {
              backgroundColor: colors.barBg,
              borderTopColor: colors.rowBorder,
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          <Pressable
            style={[styles.actionBtn, { flex: 1, backgroundColor: "#16a34a" }]}
            onPress={() =>
              router.push({
                pathname: "/(foreman-stack)/calendar/form",
                params: { id: event.id },
              } as any)
            }
          >
            <Ionicons name="create-outline" size={18} color="#fff" />
            <Text style={styles.actionText}>Edit event</Text>
          </Pressable>
          <Pressable
            style={[styles.actionBtn, { backgroundColor: "#dc2626" }]}
            onPress={() => setConfirmDelete(true)}
            accessibilityLabel="Delete event"
          >
            <Ionicons name="trash-outline" size={18} color="#fff" />
          </Pressable>
        </View>
      )}

      <Modal
        visible={confirmDelete}
        transparent
        animationType="fade"
        onRequestClose={busy ? undefined : () => setConfirmDelete(false)}
      >
        <View style={styles.overlay}>
          <View
            style={[styles.confirmCard, { backgroundColor: colors.sheetBg }]}
          >
            <View style={styles.confirmIcon}>
              <Ionicons name="trash-outline" size={28} color="#dc2626" />
            </View>
            <Text style={[styles.confirmTitle, { color: colors.textPrimary }]}>
              Delete this event?
            </Text>
            <Text style={[styles.confirmNote, { color: colors.textSecondary }]}>
              &quot;{event.title}&quot; will be removed for everyone
              {event.attendees.length > 1
                ? `, and the ${event.attendees.length - 1} other people will be told it was cancelled`
                : ""}
              .
            </Text>
            <View style={styles.confirmActions}>
              <Pressable
                style={[
                  styles.confirmBtn,
                  { borderWidth: 1, borderColor: colors.rowBorder },
                ]}
                onPress={() => setConfirmDelete(false)}
                disabled={busy}
              >
                <Text
                  style={[styles.confirmBtnText, { color: colors.textPrimary }]}
                >
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                style={[styles.confirmBtn, { backgroundColor: "#dc2626" }]}
                onPress={remove}
                disabled={busy}
              >
                {busy ? (
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

function InfoRow({
  icon,
  text,
  color,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  text: string;
  color: string;
}) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={18} color="#16a34a" />
      <Text style={[styles.infoText, { color }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  errorText: { fontSize: 15, fontWeight: "700", textAlign: "center" },
  heroEdge: {
    borderRadius: 20,
    paddingBottom: 6,
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  hero: { borderRadius: 20, padding: 18, overflow: "hidden", gap: 4 },
  heroShine: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "45%",
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  heroCat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    backgroundColor: "rgba(0,0,0,0.18)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  heroCatText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  heroTitle: { color: "#fff", fontSize: 24, fontWeight: "900", marginTop: 6 },
  heroWhen: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 14,
    fontWeight: "800",
  },
  heroTime: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
  cardTitle: { fontSize: 15, fontWeight: "900" },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  infoText: { flex: 1, fontSize: 14, fontWeight: "700" },
  notes: { fontSize: 14, lineHeight: 20, marginTop: 4 },
  respondRow: { flexDirection: "row", gap: 10 },
  respondBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 46,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  respondText: { fontSize: 14, fontWeight: "900" },
  peopleHead: { gap: 2 },
  countsText: { fontSize: 12, fontWeight: "700" },
  personRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  personName: { fontSize: 14, fontWeight: "800" },
  personRole: { fontSize: 11, fontWeight: "600" },
  personStatus: { fontSize: 12, fontWeight: "800" },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  actionBtn: {
    height: 50,
    minWidth: 54,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  actionText: { color: "#fff", fontSize: 15, fontWeight: "900" },
  overlay: {
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
  confirmTitle: { fontSize: 18, fontWeight: "900" },
  confirmNote: {
    fontSize: 13,
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
  confirmBtnText: { fontSize: 15, fontWeight: "900" },
});
