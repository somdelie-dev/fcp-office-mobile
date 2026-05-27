import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import { GlassCard } from "@/components/GlassCard";
import {
  AssistantScanHistoryItem,
  clearAllAssistantHistory,
  listRecentHistory,
} from "@/lib/assistantHistoryStore";
import { useTheme } from "@/lib/themeContext";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

function prettyDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function badgeColor(
  result: AssistantScanHistoryItem["result"],
  isDark: boolean,
) {
  if (result === "CREATED")
    return isDark
      ? {
          bg: "rgba(34,197,94,0.2)",
          br: "rgba(34,197,94,0.3)",
          tx: "#4ade80",
        }
      : {
          bg: "rgba(0,180,80,0.10)",
          br: "rgba(0,180,80,0.15)",
          tx: "#1a7f37",
        };
  if (result === "ALREADY_SCANNED")
    return isDark
      ? {
          bg: "rgba(56,189,248,0.2)",
          br: "rgba(56,189,248,0.3)",
          tx: "#38bdf8",
        }
      : {
          bg: "rgba(14,165,233,0.10)",
          br: "rgba(14,165,233,0.18)",
          tx: "#0b6b99",
        };
  if (result === "UNKNOWN")
    return isDark
      ? {
          bg: "rgba(251,191,36,0.2)",
          br: "rgba(251,191,36,0.3)",
          tx: "#fbbf24",
        }
      : {
          bg: "rgba(245,158,11,0.14)",
          br: "rgba(245,158,11,0.22)",
          tx: "#8a4b00",
        };
  if (result === "INACTIVE")
    return isDark
      ? {
          bg: "rgba(239,68,68,0.2)",
          br: "rgba(239,68,68,0.3)",
          tx: "#f87171",
        }
      : {
          bg: "rgba(220,0,0,0.08)",
          br: "rgba(220,0,0,0.14)",
          tx: "#8a1f1f",
        };
  return isDark
    ? { bg: "rgba(255,255,255,0.08)", br: "rgba(255,255,255,0.12)", tx: "#fff" }
    : { bg: "rgba(0,0,0,0.06)", br: "rgba(0,0,0,0.10)", tx: "#111" };
}

export default function AssistantHistory() {
  const [rows, setRows] = useState<AssistantScanHistoryItem[]>([]);
  const [q, setQ] = useState("");
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const colors = {
    text: isDark ? "#fff" : "#111",
    textMuted: isDark ? "#94a3b8" : "#666",
    border: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)",
    surface: isDark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.65)",
    inputBg: isDark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.65)",
    placeholder: isDark ? "#64748b" : "#8d93a3",
  };

  const refresh = useCallback(async () => {
    const list = await listRecentHistory(2); // last 2 days
    setRows(list);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const filtered = useMemo(() => {
    const s = q.trim().toUpperCase();
    if (!s) return rows;
    return rows.filter((x) => {
      const hay =
        `${x.code} ${x.siteName} ${x.actingForemanName ?? ""}`.toUpperCase();
      return hay.includes(s);
    });
  }, [rows, q]);

  const grouped = useMemo(() => {
    const map = new Map<string, AssistantScanHistoryItem[]>();
    for (const r of filtered) {
      const key = r.dateISO;
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return Array.from(map.entries())
      .sort((a, b) => String(b[0]).localeCompare(String(a[0])))
      .map(([dateISO, items]) => ({ dateISO, items }));
  }, [filtered]);

  async function onClearAll() {
    Alert.alert(
      "Clear history?",
      "This removes assistant scan history stored on this phone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            await clearAllAssistantHistory();
            await refresh();
          },
        },
      ],
    );
  }

  return (
    <AuthStyleBackground>
      <View style={styles.wrap}>
        <GlassCard style={{ padding: 14, gap: 10 }}>
          <Text style={[styles.h1, { color: colors.text }]}>
            History (last 2 days)
          </Text>
          <Text style={[styles.sub, { color: colors.textMuted }]}>
            Shows scans recorded on this phone. Use it to double-check what you
            scanned.
          </Text>

          <View style={styles.searchRow}>
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Search code, site, foreman…"
              placeholderTextColor={colors.placeholder}
              style={[
                styles.search,
                {
                  backgroundColor: colors.inputBg,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
              autoCapitalize="none"
            />
            <Pressable
              style={[
                styles.clearBtn,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
              onPress={() => setQ("")}
            >
              <Text style={[styles.clearTxt, { color: colors.text }]}>
                Clear
              </Text>
            </Pressable>
          </View>

          <View style={styles.actions}>
            <Pressable
              style={[
                styles.btnSecondary,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
              onPress={refresh}
            >
              <Text style={[styles.btnSecondaryTxt, { color: colors.text }]}>
                Refresh
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.btnDanger,
                {
                  backgroundColor: isDark
                    ? "rgba(239,68,68,0.15)"
                    : "rgba(220,0,0,0.08)",
                  borderColor: isDark
                    ? "rgba(239,68,68,0.25)"
                    : "rgba(220,0,0,0.14)",
                },
              ]}
              onPress={onClearAll}
            >
              <Text
                style={[
                  styles.btnDangerTxt,
                  { color: isDark ? "#f87171" : "#8a1f1f" },
                ]}
              >
                Clear all
              </Text>
            </Pressable>
          </View>
        </GlassCard>

        <GlassCard style={{ padding: 0, flex: 1 }}>
          <FlatList
            data={grouped}
            keyExtractor={(g) => g.dateISO}
            contentContainerStyle={{ paddingBottom: 16 }}
            renderItem={({ item: g }) => (
              <View>
                <View
                  style={[
                    styles.groupHeader,
                    { borderBottomColor: colors.border },
                  ]}
                >
                  <Text style={[styles.groupTitle, { color: colors.text }]}>
                    {prettyDate(g.dateISO)}
                  </Text>
                  <Text style={[styles.groupHint, { color: colors.textMuted }]}>
                    {g.items.length} item(s)
                  </Text>
                </View>

                {g.items.map((r) => {
                  const c = badgeColor(r.result, isDark);
                  return (
                    <View
                      key={r.id}
                      style={[styles.row, { borderBottomColor: colors.border }]}
                    >
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[styles.code, { color: colors.text }]}>
                          {r.code}
                        </Text>
                        <Text
                          style={[styles.meta, { color: colors.textMuted }]}
                        >
                          {r.siteName}
                          {r.actingForemanName
                            ? ` • Acting: ${r.actingForemanName}`
                            : ""}
                        </Text>
                        <Text
                          style={[styles.time, { color: colors.textMuted }]}
                        >
                          {new Date(r.createdAt).toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </Text>
                      </View>

                      <View
                        style={[
                          styles.badge,
                          { backgroundColor: c.bg, borderColor: c.br },
                        ]}
                      >
                        <Text style={[styles.badgeTxt, { color: c.tx }]}>
                          {r.result}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
            ListEmptyComponent={
              <View style={{ padding: 16 }}>
                <Text style={{ color: colors.textMuted, fontWeight: "800" }}>
                  No history for the last 2 days yet.
                </Text>
              </View>
            }
          />
        </GlassCard>
      </View>
    </AuthStyleBackground>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 16, gap: 12 },

  h1: { fontSize: 18, fontWeight: "900", color: "#111" },
  sub: { color: "#666", fontWeight: "800" },

  searchRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  search: {
    flex: 1,
    height: 42,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.65)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    paddingHorizontal: 12,
    fontWeight: "800",
    color: "#111",
  },
  clearBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.06)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
  },
  clearTxt: { fontWeight: "900", color: "#111" },

  actions: { flexDirection: "row", gap: 10 },
  btnSecondary: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.7)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  btnSecondaryTxt: { fontWeight: "900", color: "#111" },

  btnDanger: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "rgba(220,0,0,0.08)",
    borderWidth: 1,
    borderColor: "rgba(220,0,0,0.14)",
    alignItems: "center",
  },
  btnDangerTxt: { fontWeight: "900", color: "#8a1f1f" },

  groupHeader: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  groupTitle: { fontWeight: "900", color: "#111", fontSize: 13 },
  groupHint: { fontWeight: "800", color: "#666", fontSize: 12 },

  row: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  code: { fontWeight: "900", color: "#111", fontSize: 15 },
  meta: { color: "#666", fontWeight: "800", fontSize: 12 },
  time: { color: "#666", fontWeight: "800", fontSize: 12 },

  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeTxt: { fontWeight: "900", fontSize: 12 },
});
