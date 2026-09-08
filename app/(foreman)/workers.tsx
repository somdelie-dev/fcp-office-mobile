import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import { GlassCard } from "@/components/GlassCard";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  apiForemanFaceVerifications,
  type FaceVerificationEmployeeDto,
  type FaceVerificationStatus,
} from "../../lib/apiClient";

const ORANGE = "#ea580c";

const STATUS_META: Record<
  FaceVerificationStatus,
  {
    label: string;
    color: string;
    bg: string;
    icon: keyof typeof Ionicons.glyphMap;
  }
> = {
  MISSING: {
    label: "Missing",
    color: "#dc2626",
    bg: "#fee2e2",
    icon: "close-circle",
  },
  PENDING: {
    label: "Pending review",
    color: "#b45309",
    bg: "#fef3c7",
    icon: "time",
  },
  RECOGNISED: {
    label: "Recognised",
    color: "#16a34a",
    bg: "#dcfce7",
    icon: "checkmark-circle",
  },
};

type FilterKey = "ALL" | FaceVerificationStatus;

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function StatusBadge({ status }: { status: FaceVerificationStatus }) {
  const meta = STATUS_META[status];
  return (
    <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
      <Ionicons name={meta.icon} size={12} color={meta.color} />
      <Text style={[styles.statusBadgeText, { color: meta.color }]}>
        {meta.label}
      </Text>
    </View>
  );
}

function EmployeeRow({
  item,
  onPress,
}: {
  item: FaceVerificationEmployeeDto;
  onPress: () => void;
}) {
  const initials = getInitials(item.fullName);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
    >
      {item.photoUrl ? (
        <Image source={{ uri: item.photoUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarPlaceholder]}>
          <Text style={styles.avatarInitials}>{initials}</Text>
        </View>
      )}

      <View style={styles.rowInfo}>
        <Text style={styles.rowName} numberOfLines={1}>
          {item.fullName}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {item.code}
          {item.active ? "" : " • Inactive"}
          {item.faceStatus !== "MISSING" &&
            ` · ${item.completedPoses}/${item.totalPoses} poses`}
        </Text>
        <StatusBadge status={item.faceStatus} />
      </View>

      <Text style={styles.chev}>›</Text>
    </Pressable>
  );
}

export default function ForemanWorkers() {
  const router = useRouter();
  const [rows, setRows] = useState<FaceVerificationEmployeeDto[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await apiForemanFaceVerifications("all");
      setRows(res.employees);
    } catch (e) {
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const counts = useMemo(() => {
    const c: Record<FaceVerificationStatus, number> = {
      MISSING: 0,
      PENDING: 0,
      RECOGNISED: 0,
    };
    for (const r of rows) c[r.faceStatus]++;
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    let result = rows;
    if (filter !== "ALL")
      result = result.filter((r) => r.faceStatus === filter);
    const s = q.trim().toLowerCase();
    if (s) {
      result = result.filter(
        (r) =>
          r.fullName.toLowerCase().includes(s) ||
          r.code.toLowerCase().includes(s),
      );
    }
    return result;
  }, [rows, filter, q]);

  const filters: { key: FilterKey; label: string; count: number }[] = [
    { key: "ALL", label: "All", count: rows.length },
    { key: "MISSING", label: "Missing", count: counts.MISSING },
    { key: "PENDING", label: "Pending", count: counts.PENDING },
    { key: "RECOGNISED", label: "Recognised", count: counts.RECOGNISED },
  ];

  return (
    <AuthStyleBackground>
      <View style={styles.container}>
        <View
          style={{
            paddingTop: 8,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text style={styles.h1}>Team</Text>
          <View style={styles.headerRow}>
            <Pressable
              style={styles.primaryBtn}
              onPress={() => router.push("/(foreman-stack)/workers/new")}
            >
              <Text style={styles.primaryTxt}>+ Add New Guy</Text>
            </Pressable>
          </View>
          <Pressable
            onPress={() => refresh(true)}
            disabled={refreshing}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "#16A34A",
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 20,
              opacity: refreshing ? 0.6 : 1,
            }}
          >
            {refreshing ? (
              <ActivityIndicator
                size="small"
                color="#fff"
                style={{ marginRight: 6 }}
              />
            ) : (
              <Ionicons
                name="refresh"
                size={16}
                color="#fff"
                style={{ marginRight: 6 }}
              />
            )}
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>
              {refreshing ? "Refreshing…" : "Refresh"}
            </Text>
          </Pressable>
        </View>

        {/* <Text style={styles.sub}>
          {counts.MISSING} missing · {counts.PENDING} pending · {counts.RECOGNISED} recognised
        </Text> */}

        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search name, code…"
          placeholderTextColor="#8d93a3"
          style={styles.search}
        />

        <View style={styles.segmentedControl}>
          {filters.map((f) => {
            const active = filter === f.key;
            const meta = f.key !== "ALL" ? STATUS_META[f.key] : null;
            const tint = meta?.color ?? ORANGE;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[styles.segment, active && { backgroundColor: tint }]}
              >
                <Text
                  style={[styles.segmentLabel, active && { color: "#fff" }]}
                  numberOfLines={1}
                >
                  {f.label}
                </Text>
                <Text
                  style={[
                    styles.segmentCount,
                    active && { color: "rgba(255,255,255,0.85)" },
                  ]}
                >
                  {f.count}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <GlassCard style={{ padding: 0, flex: 1 }}>
          <View style={styles.listHeader}>
            <Text style={styles.listTitle}>Your Team</Text>
            <Text style={styles.listSub}>
              {loading ? "Loading..." : `${filtered.length} shown`}
            </Text>
          </View>

          {loading && rows.length === 0 ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator color={ORANGE} />
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              refreshing={refreshing}
              onRefresh={() => refresh(true)}
              contentContainerStyle={{ padding: 12, gap: 10 }}
              renderItem={({ item }) => (
                <EmployeeRow
                  item={item}
                  onPress={() =>
                    router.push({
                      pathname: "/(foreman-stack)/workers/[id]",
                      params: { id: item.id },
                    })
                  }
                />
              )}
              ListEmptyComponent={
                <View style={{ padding: 16 }}>
                  <Text style={{ color: "#666", fontWeight: "700" }}>
                    {q.trim() || filter !== "ALL"
                      ? "No matches"
                      : 'No one added yet. Tap "+ Add New Guy".'}
                  </Text>
                </View>
              }
            />
          )}
        </GlassCard>
      </View>
    </AuthStyleBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, gap: 12 },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  h1: { fontSize: 20, fontWeight: "900", color: "#111" },
  sub: { marginTop: -4, color: "#666", fontWeight: "800", fontSize: 12 },

  primaryBtn: {
    backgroundColor: ORANGE,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 5,
  },
  primaryTxt: { color: "#fff", fontWeight: "900" },

  search: {
    height: 42,
    borderRadius: 5,
    backgroundColor: "rgba(255,255,255,0.65)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    paddingHorizontal: 12,
    fontWeight: "800",
    color: "#111",
  },

  segmentedControl: {
    flexDirection: "row",
    padding: 2,
    gap: 2,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  segment: {
    flex: 1,
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: 4,
    gap: 2,
  },
  segmentLabel: { fontSize: 12, fontWeight: "800", color: "#111" },
  segmentCount: { fontSize: 14, fontWeight: "700", color: "#666" },

  listHeader: {
    paddingHorizontal: 16,
    paddingTop: 5,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  listTitle: { fontSize: 14, fontWeight: "900", color: "#111" },
  listSub: { marginTop: 2, color: "#666", fontWeight: "800", fontSize: 12 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarPlaceholder: {
    backgroundColor: "#ffedd5",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: { fontSize: 14, fontWeight: "800", color: ORANGE },

  rowInfo: { flex: 1, gap: 4 },
  rowName: { fontSize: 15, fontWeight: "900", color: "#111" },
  rowMeta: { fontSize: 12, fontWeight: "700", color: "#666" },

  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    marginTop: 2,
  },
  statusBadgeText: { fontSize: 11, fontWeight: "800" },

  chev: { fontSize: 22, fontWeight: "900", color: "#999" },
});
