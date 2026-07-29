import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import { GlassCard } from "@/components/GlassCard";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";

import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { type ApiEmployee, apiForemanEmployees } from "../../lib/apiClient";

export default function ForemanWorkers() {
  const router = useRouter();
  const [rows, setRows] = useState<ApiEmployee[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await apiForemanEmployees();
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

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(
      (e) =>
        e.fullName.toLowerCase().includes(s) ||
        e.code.toLowerCase().includes(s) ||
        (e.phone ?? "").toLowerCase().includes(s),
    );
  }, [rows, q]);

  return (
    <AuthStyleBackground>
      <View style={styles.container}>
        <View
          style={{
            paddingTop: 8,
            flexDirection: "row",
            justifyContent: "flex-end",
          }}
        >
          <Pressable
            onPress={() => refresh(true)}
            disabled={refreshing}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "#262D68",
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

        <View style={styles.headerRow}>
          <Text style={styles.h1}>Team</Text>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => router.push("/(foreman-stack)/workers/new")}
          >
            <Text style={styles.primaryTxt}>+ Add New Guy</Text>
          </Pressable>
        </View>

        <GlassCard style={{ padding: 12 }}>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search name, code, phone…"
            placeholderTextColor="#8d93a3"
            style={styles.search}
          />
        </GlassCard>

        <GlassCard style={{ padding: 0, flex: 1 }}>
          <View style={styles.listHeader}>
            <Text style={styles.listTitle}>Your Team</Text>
            <Text style={styles.listSub}>
              {loading ? "Loading..." : `${filtered.length} shown`}
            </Text>
          </View>

          {loading && rows.length === 0 ? (
            <View style={styles.centerContainer}>
              <Text style={styles.loadingText}>Loading...</Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(i) => i.id}
              refreshing={refreshing}
              onRefresh={() => refresh(true)}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.row}
                  onPress={() =>
                    router.push({
                      pathname: "/(foreman-stack)/workers/[id]",
                      params: { id: item.id },
                    })
                  }
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{item.fullName}</Text>
                    <Text style={styles.meta}>
                      {item.code}
                      {item.active ? "" : " • Inactive"}
                    </Text>
                  </View>
                  <Text style={styles.chev}>›</Text>
                </Pressable>
              )}
              ListEmptyComponent={
                <View style={{ padding: 16 }}>
                  <Text style={{ color: "#666", fontWeight: "700" }}>
                    No one added yet. Tap "+ Add New Guy".
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

const ORANGE = "#ea580c";

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, gap: 12 },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 16,
    color: "#a0a9b8",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  h1: { fontSize: 20, fontWeight: "900", color: "#111" },

  primaryBtn: {
    backgroundColor: ORANGE,
    paddingHorizontal: 44,
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
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
    gap: 10,
  },
  name: { fontSize: 15, fontWeight: "900", color: "#111" },
  meta: { marginTop: 2, color: "#666", fontWeight: "800", fontSize: 12 },
  chev: { fontSize: 22, fontWeight: "900", color: "#999" },
});
