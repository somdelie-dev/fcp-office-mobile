import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import { GlassCard } from "@/components/GlassCard";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  apiForemanDay,
  apiForemanDayNote,
  apiForemanDayReady,
  apiForemanDeleteScan,
  type ForemanDayDetailDto,
} from "../../../lib/apiClient";

function formatDate(dateISO: string) {
  const d = new Date(`${dateISO}T00:00:00`);
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function statusLabel(s: ForemanDayDetailDto["status"]) {
  if (s === "APPROVED") return "Approved";
  if (s === "REJECTED") return "Rejected";
  if (s === "SUBMITTED") return "Submitted";
  return "Pending";
}

const REASONS = [
  "Extra guys (urgent)",
  "Guys moved from another site",
  "Subcontractor team",
  "Short-staffed / late arrivals",
  "Other",
];

export default function ForemanDayDetails() {
  const router = useRouter();
  const params = useLocalSearchParams<{ key?: string }>();
  const key = typeof params.key === "string" ? params.key : "";

  const { siteId, dateISO } = useMemo(() => {
    const decoded = decodeURIComponent(key || "");
    const idx = decoded.lastIndexOf(":");
    if (idx === -1) return { siteId: "", dateISO: "" };
    return {
      siteId: decoded.slice(0, idx),
      dateISO: decoded.slice(idx + 1),
    };
  }, [key]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [day, setDay] = useState<ForemanDayDetailDto | null>(null);

  // foreman note fields
  const [reason, setReason] = useState<string>("");
  const [note, setNote] = useState<string>("");

  const [savingNote, setSavingNote] = useState(false);
  const [togglingReady, setTogglingReady] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // search
  const [query, setQuery] = useState("");

  const refresh = useCallback(
    async (mode: "initial" | "pull" | "manual" = "manual") => {
      if (!siteId || !dateISO) return;

      if (mode === "initial") setLoading(true);
      if (mode === "pull") setRefreshing(true);

      setError(null);
      try {
        const res = await apiForemanDay(siteId, dateISO);
        setDay(res.day);
        setReason(res.day.foremanFlagReason ?? "");
        setNote(res.day.foremanNote ?? "");
      } catch (e: any) {
        setError(e?.message ?? "Failed to load day.");
        // keep old day on screen if we already had it
      } finally {
        if (mode === "initial") setLoading(false);
        if (mode === "pull") setRefreshing(false);
      }
    },
    [siteId, dateISO],
  );

  useFocusEffect(
    useCallback(() => {
      refresh("initial");
    }, [refresh]),
  );

  const scans = day?.scans ?? [];

  const filteredScans = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return scans;
    return scans.filter((s) =>
      `${s.employee.code} ${s.employee.fullName}`.toUpperCase().includes(q),
    );
  }, [scans, query]);

  async function onSaveNote() {
    if (!siteId || !dateISO) return;

    setSavingNote(true);
    try {
      await apiForemanDayNote(siteId, dateISO, {
        reason: reason || undefined,
        note: note || undefined,
      });
      await refresh("manual");
    } catch (e: any) {
      Alert.alert("Save failed", e?.message ?? "Could not save note.");
    } finally {
      setSavingNote(false);
    }
  }

  async function toggleReady() {
    if (!siteId || !dateISO || !day) return;

    const next = !Boolean(day.readyToSubmit);

    if (next && scans.length === 0) {
      Alert.alert(
        "Nothing scanned",
        "Scan at least one guy before marking as ready.",
      );
      return;
    }

    setTogglingReady(true);
    try {
      await apiForemanDayReady(siteId, dateISO, next);
      await refresh("manual");
    } catch (e: any) {
      Alert.alert("Update failed", e?.message ?? "Could not update readiness.");
    } finally {
      setTogglingReady(false);
    }
  }

  async function removeScanById(scanId: string, codeLabel: string) {
    Alert.alert("Remove scan?", `Remove ${codeLabel} from this day?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          setRemovingId(scanId);
          try {
            await apiForemanDeleteScan(scanId);
            await refresh("manual");
          } catch (e: any) {
            Alert.alert(
              "Remove failed",
              e?.message ?? "Could not remove scan.",
            );
          } finally {
            setRemovingId(null);
          }
        },
      },
    ]);
  }

  if (!siteId || !dateISO) {
    return (
      <AuthStyleBackground>
        <View style={styles.container}>
          <GlassCard style={{ padding: 16, gap: 10 }}>
            <Text style={styles.title}>Invalid day link</Text>
            <Pressable style={styles.primaryBtn} onPress={() => router.back()}>
              <Text style={styles.primaryTxt}>Go Back</Text>
            </Pressable>
          </GlassCard>
        </View>
      </AuthStyleBackground>
    );
  }

  if (loading && !day) {
    return (
      <AuthStyleBackground>
        <View style={styles.container}>
          <GlassCard style={{ padding: 16, alignItems: "center", gap: 10 }}>
            <ActivityIndicator />
            <Text style={{ fontWeight: "900", color: "#666" }}>Loading…</Text>
          </GlassCard>
        </View>
      </AuthStyleBackground>
    );
  }

  if (!day) {
    return (
      <AuthStyleBackground>
        <View style={styles.container}>
          <GlassCard style={{ padding: 16, gap: 10 }}>
            <Text style={styles.title}>Day not found</Text>
            {error ? (
              <Text style={{ color: "#8a1f1f", fontWeight: "900" }}>
                {error}
              </Text>
            ) : null}
            <Pressable
              style={styles.primaryBtn}
              onPress={() => refresh("manual")}
            >
              <Text style={styles.primaryTxt}>Retry</Text>
            </Pressable>
            <Pressable style={styles.backBtn} onPress={() => router.back()}>
              <Text style={styles.backBtnTxt}>Back</Text>
            </Pressable>
          </GlassCard>
        </View>
      </AuthStyleBackground>
    );
  }

  const ready = Boolean(day.readyToSubmit);

  return (
    <AuthStyleBackground>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => refresh("pull")}
          />
        }
      >
        {/* Header */}
        <GlassCard style={{ padding: 16 }}>
          <View style={styles.topRow}>
            <Pressable onPress={() => router.back()} style={styles.backPill}>
              <Ionicons
                name="arrow-back"
                size={18}
                color="#111"
                style={{ marginRight: 4 }}
              />
              <Text style={styles.backPillTxt}>Back</Text>
            </Pressable>

            <View style={styles.pillsRight}>
              <View style={[styles.badge, badgeStyle(day.status)]}>
                <Text style={styles.badgeTxt}>{statusLabel(day.status)}</Text>
              </View>

              <View
                style={[styles.badge, ready ? styles.readyOn : styles.readyOff]}
              >
                <Text style={styles.badgeTxt}>
                  {ready ? "Ready" : "Not ready"}
                </Text>
              </View>
            </View>
          </View>

          <Text style={styles.siteName}>{day.site.name}</Text>
          <Text style={styles.date}>{formatDate(dateISO)}</Text>

          <View style={styles.statsRow}>
            <MiniStat label="Scanned" value={String(scans.length)} />
            <MiniStat label="Flags" value={String(day.flags ?? 0)} />
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorTxt}>{error}</Text>
              <Pressable
                style={styles.errorBtn}
                onPress={() => refresh("manual")}
              >
                <Text style={styles.errorBtnTxt}>Retry</Text>
              </Pressable>
            </View>
          ) : null}

          <Pressable
            onPress={toggleReady}
            style={[
              styles.readyBtn,
              ready ? styles.readyBtnOn : styles.readyBtnOff,
              togglingReady && { opacity: 0.7 },
            ]}
            disabled={togglingReady}
          >
            <Text style={[styles.readyBtnTxt, !ready && { color: "#fff" }]}>
              {togglingReady
                ? "SAVING..."
                : ready
                  ? "MARK AS NOT READY"
                  : "MARK AS READY TO SUBMIT"}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => refresh("manual")}
            style={styles.refreshBtn}
          >
            <Text style={styles.refreshTxt}>Refresh</Text>
          </Pressable>
        </GlassCard>

        {/* Foreman note */}
        <GlassCard style={{ padding: 16 }}>
          <Text style={styles.sectionTitle}>Foreman note</Text>
          <Text style={styles.sectionSub}>
            Explain anything unusual (extra guys, moved teams, etc.).
          </Text>

          <View style={styles.reasonWrap}>
            {REASONS.map((r) => {
              const active = reason === r;
              return (
                <Pressable
                  key={r}
                  onPress={() => setReason(active ? "" : r)}
                  style={[styles.reasonPill, active && styles.reasonPillActive]}
                >
                  <Text
                    style={[
                      styles.reasonText,
                      active && styles.reasonTextActive,
                    ]}
                  >
                    {r}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.inputBox}>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Add a note (optional)…"
              placeholderTextColor="#8d93a3"
              style={styles.input}
              multiline
            />
          </View>

          <Pressable
            style={[styles.primaryBtn, savingNote && { opacity: 0.7 }]}
            disabled={savingNote}
            onPress={onSaveNote}
          >
            <Text style={styles.primaryTxt}>
              {savingNote ? "SAVING..." : "SAVE NOTE"}
            </Text>
          </Pressable>
        </GlassCard>

        {/* Scans list + search */}
        <GlassCard style={{ padding: 0 }}>
          <View style={styles.listHeader}>
            <Text style={styles.listTitle}>Team Scanned</Text>
            <Text style={styles.listSub}>
              {filteredScans.length} shown • {scans.length} total
            </Text>
          </View>

          <View style={styles.searchWrap}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search code or name…"
              placeholderTextColor="#8d93a3"
              style={styles.searchInput}
              autoCapitalize="none"
            />
            {query.length > 0 ? (
              <Pressable onPress={() => setQuery("")} style={styles.clearBtn}>
                <Text style={styles.clearTxt}>Clear</Text>
              </Pressable>
            ) : null}
          </View>

          <FlatList
            data={filteredScans}
            keyExtractor={(i) => i.id}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.code}>{item.employee.code}</Text>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.employee.fullName}
                  </Text>
                  <Text style={styles.time}>
                    {new Date(item.scannedAt).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>

                <Pressable
                  style={[
                    styles.removeBtn,
                    removingId === item.id && { opacity: 0.6 },
                  ]}
                  disabled={removingId === item.id}
                  onPress={() => removeScanById(item.id, item.employee.code)}
                >
                  <Text style={styles.removeTxt}>
                    {removingId === item.id ? "Removing..." : "Remove"}
                  </Text>
                </Pressable>
              </View>
            )}
            ListEmptyComponent={
              <View style={{ padding: 16 }}>
                <Text style={{ color: "#666", fontWeight: "700" }}>
                  {scans.length === 0
                    ? "No scans for this day."
                    : "No results. Try another search."}
                </Text>
              </View>
            }
          />
        </GlassCard>

        <View style={{ height: 18 }} />
      </ScrollView>
    </AuthStyleBackground>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statMini}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function badgeStyle(status: ForemanDayDetailDto["status"]) {
  if (status === "APPROVED")
    return { backgroundColor: "rgba(0, 180, 80, 0.12)" };
  if (status === "REJECTED")
    return { backgroundColor: "rgba(220, 0, 0, 0.10)" };
  if (status === "SUBMITTED")
    return { backgroundColor: "rgba(34,197,94,0.14)" };
  return { backgroundColor: "rgba(255, 170, 0, 0.14)" };
}

const NAVY = "#16A34A";

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },

  title: { fontSize: 18, fontWeight: "900", color: "#111" },

  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  backPill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.65)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    flexDirection: "row",
    alignItems: "center",
  },
  backPillTxt: { fontWeight: "900", color: "#111" },

  pillsRight: { flexDirection: "row", gap: 8, alignItems: "center" },

  badge: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  badgeTxt: { fontWeight: "900", color: "#111", fontSize: 12 },

  readyOn: { backgroundColor: "rgba(34,197,94,0.14)" },
  readyOff: { backgroundColor: "rgba(0,0,0,0.05)" },

  siteName: { marginTop: 10, fontSize: 18, fontWeight: "900", color: "#111" },
  date: { marginTop: 4, color: "#666", fontWeight: "700" },

  statsRow: { marginTop: 14, flexDirection: "row", gap: 12 },
  statMini: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.55)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    alignItems: "center",
    gap: 4,
  },
  statValue: { fontSize: 18, fontWeight: "900", color: "#111" },
  statLabel: { color: "#666", fontWeight: "800", fontSize: 12 },

  errorBox: {
    marginTop: 12,
    borderRadius: 12,
    padding: 10,
    backgroundColor: "rgba(220,0,0,0.06)",
    borderWidth: 1,
    borderColor: "rgba(220,0,0,0.12)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  errorTxt: { flex: 1, color: "#8a1f1f", fontWeight: "900", fontSize: 12 },
  errorBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.06)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  errorBtnTxt: { fontWeight: "900", color: "#111", fontSize: 12 },

  readyBtn: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 5,
    alignItems: "center",
  },
  readyBtnOn: { backgroundColor: "rgba(0,0,0,0.08)" },
  readyBtnOff: { backgroundColor: NAVY },
  readyBtnTxt: {
    fontWeight: "900",
    letterSpacing: 0.8,
    fontSize: 12,
    color: "#111",
  },

  refreshBtn: {
    marginTop: 10,
    paddingVertical: 10,
    borderRadius: 5,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.65)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  refreshTxt: { fontWeight: "900", color: "#111", fontSize: 12 },

  sectionTitle: { fontSize: 14, fontWeight: "900", color: "#111" },
  sectionSub: {
    marginTop: 4,
    color: "#666",
    fontWeight: "700",
    fontSize: 12,
    lineHeight: 16,
  },

  reasonWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  reasonPill: {
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "rgba(255,255,255,0.65)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  reasonPillActive: { backgroundColor: NAVY, borderColor: "rgba(0,0,0,0)" },
  reasonText: { fontWeight: "900", fontSize: 12, color: "#111" },
  reasonTextActive: { color: "#fff" },

  inputBox: {
    marginTop: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.65)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 90,
  },
  input: { color: "#111", fontWeight: "700" },

  primaryBtn: {
    marginTop: 12,
    backgroundColor: NAVY,
    paddingVertical: 12,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryTxt: {
    color: "#fff",
    fontWeight: "900",
    letterSpacing: 0.8,
    fontSize: 12,
  },

  backBtn: {
    marginTop: 10,
    backgroundColor: "rgba(0,0,0,0.06)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    paddingVertical: 12,
    borderRadius: 5,
    alignItems: "center",
  },
  backBtnTxt: { fontWeight: "900", color: "#111" },

  listHeader: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    paddingTop: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  listTitle: { fontSize: 14, fontWeight: "900", color: "#111" },
  listSub: { marginTop: 2, color: "#666", fontWeight: "800", fontSize: 12 },

  searchWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  searchInput: {
    flex: 1,
    height: 42,
    borderRadius: 5,
    backgroundColor: "rgba(255,255,255,0.65)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    paddingHorizontal: 12,
    fontWeight: "800",
    color: "#111",
  },
  clearBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 5,
    backgroundColor: "rgba(0,0,0,0.06)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  clearTxt: { fontWeight: "900", color: "#111", fontSize: 12 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  code: { fontSize: 16, fontWeight: "900", color: "#111" },
  name: { marginTop: 2, color: "#111", fontWeight: "800" },
  time: { marginTop: 2, color: "#666", fontWeight: "800", fontSize: 12 },

  removeBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 5,
    backgroundColor: "rgba(0,0,0,0.06)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  removeTxt: { fontWeight: "900", color: "#111", fontSize: 12 },
});
