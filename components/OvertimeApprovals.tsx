import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import LoadingOverlay from "@/components/LoadingOverlay";
import { ZoomableImage } from "@/components/ZoomableImage";
import { type OvertimeRequestDto } from "@/lib/apiClient";
import { useTheme } from "@/lib/themeContext";

const themes = {
  dark: {
    textPrimary: "#e5e7eb",
    textSecondary: "#94a3b8",
    cardBg: "#1e293b",
    cardBorder: "#334155",
    emptyText: "#64748b",
    inputBg: "#0f172a",
    inputBorder: "#334155",
    sheetBg: "#0f172a",
  },
  light: {
    textPrimary: "#111",
    textSecondary: "#666",
    cardBg: "#fff",
    cardBorder: "#e2e8f0",
    emptyText: "#94a3b8",
    inputBg: "#fff",
    inputBorder: "#e2e8f0",
    sheetBg: "#f8fafc",
  },
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  PENDING: { bg: "rgba(251,191,36,0.2)", text: "#f59e0b" },
  APPROVED: { bg: "rgba(16,185,129,0.2)", text: "#10b981" },
  REJECTED: { bg: "rgba(239,68,68,0.2)", text: "#ef4444" },
};

type Tab = "PENDING" | "REVIEWED";

// Times are shown in SAST (UTC+2, no daylight saving) regardless of the
// phone's own time zone setting.
function sastTime(iso: string) {
  const d = new Date(new Date(iso).getTime() + 2 * 60 * 60 * 1000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function siteLabel(r: OvertimeRequestDto) {
  return r.site.code ? `${r.site.code} - ${r.site.name}` : r.site.name;
}

export type OvertimeApprovalsApi = {
  list: () => Promise<{ requests: OvertimeRequestDto[] }>;
  approve: (id: string) => Promise<unknown>;
  reject: (id: string, note: string) => Promise<unknown>;
};

/**
 * Review list for foreman scan-out overtime. Supervisors see their own
 * sites and admins see every site; only the API calls differ.
 */
export function OvertimeApprovals({
  api,
  showSiteCount = false,
}: {
  api: OvertimeApprovalsApi;
  showSiteCount?: boolean;
}) {
  const { theme } = useTheme();
  const colors = themes[theme];
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [requests, setRequests] = useState<OvertimeRequestDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("PENDING");
  const [selected, setSelected] = useState<OvertimeRequestDto | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (mode: "initial" | "refresh") => {
    if (mode === "refresh") setRefreshing(true);
    setError(null);
    try {
      const res = await api.list();
      setRequests(res.requests ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Could not load overtime requests.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      load("initial");
    }, [load]),
  );

  const pending = useMemo(
    () => requests.filter((r) => r.status === "PENDING"),
    [requests],
  );
  const reviewed = useMemo(
    () => requests.filter((r) => r.status !== "PENDING"),
    [requests],
  );
  const visible = tab === "PENDING" ? pending : reviewed;

  const closeDetail = () => {
    setSelected(null);
    setRejecting(false);
    setRejectNote("");
  };

  const review = async (approved: boolean) => {
    if (!selected) return;
    const note = rejectNote.trim();
    if (!approved && note.length < 3) {
      Alert.alert("Reason needed", "Please say why you're rejecting this.");
      return;
    }
    setBusy(true);
    try {
      if (approved) await api.approve(selected.id);
      else await api.reject(selected.id, note);
      closeDetail();
      await load("refresh");
    } catch (e: any) {
      Alert.alert(
        approved ? "Couldn't approve" : "Couldn't reject",
        e?.message ?? "Please try again.",
      );
      // Someone else may have reviewed it; refresh so the list is current.
      load("refresh");
    } finally {
      setBusy(false);
    }
  };

  const renderCard = ({ item }: { item: OvertimeRequestDto }) => {
    const sc = STATUS_COLORS[item.status];
    return (
      <Pressable
        onPress={() => setSelected(item)}
        style={[
          styles.card,
          { backgroundColor: colors.cardBg, borderColor: colors.cardBorder },
        ]}
      >
        <View style={styles.cardTop}>
          <Text
            style={[styles.cardSite, { color: colors.textPrimary }]}
            numberOfLines={2}
          >
            {siteLabel(item)}
          </Text>
          <View style={[styles.badge, { backgroundColor: sc.bg }]}>
            <Text style={[styles.badgeText, { color: sc.text }]}>
              {item.status}
            </Text>
          </View>
        </View>
        <Text style={[styles.cardLine, { color: colors.textSecondary }]}>
          {item.foreman.name} · {item.workDateISO}
        </Text>
        <Text style={[styles.cardHours, { color: colors.textPrimary }]}>
          {item.employees.length} guy(s) · {item.hours} h ·{" "}
          {sastTime(item.startsAtISO)} to {sastTime(item.endsAtISO)}
        </Text>
      </Pressable>
    );
  };

  const photoSize = width - 32;

  return (
    <AuthStyleBackground>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Overtime Approvals
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Check the photo matches the guys before approving
          </Text>
          {showSiteCount && pending.length > 0 && (
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {pending.length} waiting across{" "}
              {new Set(pending.map((r) => r.site.id)).size} site(s)
            </Text>
          )}
        </View>

        <View style={styles.tabRow}>
          {(
            [
              { key: "PENDING", label: `Pending (${pending.length})` },
              { key: "REVIEWED", label: `Reviewed (${reviewed.length})` },
            ] as const
          ).map((t) => {
            const active = tab === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                style={[
                  styles.tab,
                  {
                    backgroundColor: active ? "#16a34a" : colors.cardBg,
                    borderColor: active ? "#16a34a" : colors.cardBorder,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.tabText,
                    { color: active ? "#fff" : colors.textPrimary },
                  ]}
                >
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {loading ? (
          <LoadingOverlay />
        ) : (
          <FlatList
            data={visible}
            keyExtractor={(r) => r.id}
            renderItem={renderCard}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => load("refresh")}
              />
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons
                  name={error ? "cloud-offline-outline" : "time-outline"}
                  size={56}
                  color={colors.emptyText}
                />
                <Text style={[styles.emptyText, { color: colors.emptyText }]}>
                  {error ??
                    (tab === "PENDING"
                      ? "No overtime waiting for approval"
                      : "No overtime reviewed in the last 14 days")}
                </Text>
              </View>
            }
          />
        )}
      </View>

      <Modal
        visible={!!selected}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={closeDetail}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={[
              styles.modalScroll,
              { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 24 },
            ]}
            keyboardShouldPersistTaps="handled"
          >
            {selected && (
              <>
                {selected.photoUrl ? (
                  <ZoomableImage
                    uri={selected.photoUrl}
                    width={photoSize}
                    height={photoSize}
                  />
                ) : (
                  <View
                    style={[styles.noPhoto, { width: photoSize, height: 120 }]}
                  >
                    <Text style={styles.modalMuted}>No photo attached</Text>
                  </View>
                )}

                <View style={styles.modalInfo}>
                  <Text style={styles.modalTitle}>{siteLabel(selected)}</Text>
                  <Text style={styles.modalMuted}>
                    {selected.foreman.name} · {selected.workDateISO}
                  </Text>
                  <Text style={styles.modalHours}>
                    {selected.hours} hour(s) · {sastTime(selected.startsAtISO)}{" "}
                    to {sastTime(selected.endsAtISO)}
                  </Text>

                  <Text style={styles.modalSection}>
                    {selected.employees.length} guy(s) claimed. Count them in
                    the photo:
                  </Text>
                  {selected.employees.map((e, i) => (
                    <Text key={e.id} style={styles.workerLine}>
                      {i + 1}. {e.name || e.code}{" "}
                      <Text style={styles.modalMuted}>({e.code})</Text>
                    </Text>
                  ))}

                  {selected.status !== "PENDING" && (
                    <Text style={[styles.modalSection, { marginTop: 12 }]}>
                      {selected.status === "APPROVED" ? "Approved" : "Rejected"}
                      {selected.reviewedByName
                        ? ` by ${selected.reviewedByName}`
                        : ""}
                      {selected.reviewNote ? `: ${selected.reviewNote}` : ""}
                    </Text>
                  )}

                  {selected.status === "PENDING" && rejecting && (
                    <TextInput
                      value={rejectNote}
                      onChangeText={setRejectNote}
                      placeholder="Why are you rejecting this?"
                      placeholderTextColor="#94a3b8"
                      style={[
                        styles.input,
                        {
                          backgroundColor: colors.inputBg,
                          borderColor: colors.inputBorder,
                          color: colors.textPrimary,
                        },
                      ]}
                      multiline
                      autoFocus
                    />
                  )}

                  {selected.status === "PENDING" && (
                    <View style={styles.actions}>
                      {rejecting ? (
                        <>
                          <Pressable
                            style={[styles.actionBtn, styles.secondaryBtn]}
                            onPress={() => setRejecting(false)}
                            disabled={busy}
                          >
                            <Text style={styles.actionText}>Back</Text>
                          </Pressable>
                          <Pressable
                            style={[styles.actionBtn, styles.rejectBtn]}
                            onPress={() => review(false)}
                            disabled={busy}
                          >
                            <Text style={styles.actionText}>
                              Confirm reject
                            </Text>
                          </Pressable>
                        </>
                      ) : (
                        <>
                          <Pressable
                            style={[styles.actionBtn, styles.rejectBtn]}
                            onPress={() => setRejecting(true)}
                            disabled={busy}
                          >
                            <Text style={styles.actionText}>Reject</Text>
                          </Pressable>
                          <Pressable
                            style={[styles.actionBtn, styles.approveBtn]}
                            onPress={() => review(true)}
                            disabled={busy}
                          >
                            <Text style={styles.actionText}>Approve</Text>
                          </Pressable>
                        </>
                      )}
                    </View>
                  )}
                  {busy && (
                    <ActivityIndicator color="#fff" style={{ marginTop: 12 }} />
                  )}
                </View>
              </>
            )}
          </ScrollView>

          <Pressable
            style={[styles.modalClose, { top: insets.top + 12 }]}
            onPress={closeDetail}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close-circle" size={40} color="#fff" />
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </AuthStyleBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 8, gap: 2 },
  title: { fontSize: 18, fontWeight: "900" },
  subtitle: { fontSize: 13 },
  tabRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  tabText: { fontSize: 13, fontWeight: "700" },
  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 10 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 4 },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  cardSite: { flex: 1, fontSize: 15, fontWeight: "800" },
  cardLine: { fontSize: 13 },
  cardHours: { fontSize: 14, fontWeight: "700", marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: "800" },
  empty: { alignItems: "center", paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 15, textAlign: "center", paddingHorizontal: 24 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.92)" },
  modalScroll: { alignItems: "center", paddingHorizontal: 16 },
  modalClose: { position: "absolute", right: 16, zIndex: 10, elevation: 10 },
  noPhoto: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
  },
  modalInfo: { alignSelf: "stretch", marginTop: 16, gap: 4 },
  modalTitle: { color: "#fff", fontSize: 18, fontWeight: "800" },
  modalMuted: { color: "#94a3b8", fontSize: 13 },
  modalHours: { color: "#fff", fontSize: 16, fontWeight: "700", marginTop: 4 },
  modalSection: { color: "#e5e7eb", fontSize: 14, marginTop: 12, marginBottom: 4 },
  workerLine: { color: "#fff", fontSize: 15, paddingVertical: 2 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    minHeight: 70,
    marginTop: 12,
    textAlignVertical: "top",
  },
  actions: { flexDirection: "row", gap: 10, marginTop: 16 },
  actionBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  approveBtn: { backgroundColor: "#16a34a" },
  rejectBtn: { backgroundColor: "#dc2626" },
  secondaryBtn: { backgroundColor: "#334155" },
  actionText: { color: "#fff", fontSize: 15, fontWeight: "800" },
});
