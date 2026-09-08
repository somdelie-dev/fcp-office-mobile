import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import { GlassPanel } from "@/components/team";
import { useFaceTheme, type FaceColorPalette } from "@/components/team/faceTheme";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  apiForemanRecentScanOuts,
  type ForemanScanOutDto,
} from "../../lib/apiClient";

type ScanOutGroup = {
  dateKey: string;
  heading: string;
  scanOuts: ForemanScanOutDto[];
};

function getHeading(dateISO: string) {
  const date = new Date(`${dateISO.slice(0, 10)}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.getTime() === today.getTime()) return "Today";
  if (date.getTime() === yesterday.getTime()) return "Yesterday";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "long" });
}

function groupScanOuts(scanOuts: ForemanScanOutDto[]): ScanOutGroup[] {
  const groups = new Map<string, ScanOutGroup>();
  for (const s of scanOuts) {
    const dateKey = s.scannedOutAtISO.slice(0, 10);
    if (!groups.has(dateKey)) {
      groups.set(dateKey, {
        dateKey,
        heading: getHeading(s.scannedOutAtISO),
        scanOuts: [],
      });
    }
    groups.get(dateKey)!.scanOuts.push(s);
  }
  return [...groups.values()].sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const second = parts.length > 1 ? (parts[1][0] ?? "") : "";
  return (first + second).toUpperCase();
}

function methodLabel(method: ForemanScanOutDto["method"]) {
  switch (method) {
    case "FACE":
      return "Face";
    case "PHOTO":
      return "Photo";
    case "FINGERPRINT":
      return "Fingerprint";
    default:
      return "Unknown";
  }
}

export default function ForemanScanOuts() {
  const { colors, radius, typography } = useFaceTheme();
  const styles = useMemo(() => getStyles(colors, radius), [colors, radius]);

  const [scanOuts, setScanOuts] = useState<ForemanScanOutDto[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await apiForemanRecentScanOuts();
      setScanOuts(res.scanOuts ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load scan-outs.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return scanOuts;
    return scanOuts.filter(
      (s) =>
        s.employeeName.toLowerCase().includes(query) ||
        s.siteName.toLowerCase().includes(query),
    );
  }, [scanOuts, search]);

  const grouped = useMemo(() => groupScanOuts(visible), [visible]);

  return (
    <AuthStyleBackground>
      <ScrollView
        style={styles.wrap}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 32, gap: 12 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={colors.success}
            colors={[colors.success]}
          />
        }
      >
        <GlassPanel contentPadding={16} radius={5}>
          <View style={{ gap: 10 }}>
            <Text style={typography.title}>Scan Outs</Text>
            <Text style={typography.body}>Last 7 days, all your sites</Text>

            <View style={styles.searchBox}>
              <Ionicons
                name="search-outline"
                size={16}
                color={colors.textTertiary}
              />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search name or site"
                placeholderTextColor={colors.textTertiary}
                style={styles.searchInput}
              />
              {!!search && (
                <Pressable onPress={() => setSearch("")} hitSlop={8}>
                  <Ionicons
                    name="close-circle"
                    size={18}
                    color={colors.textTertiary}
                  />
                </Pressable>
              )}
            </View>
          </View>
        </GlassPanel>

        {loading ? (
          <GlassPanel contentPadding={16} radius={5}>
            <View style={{ alignItems: "center", gap: 10 }}>
              <ActivityIndicator color={colors.success} />
              <Text style={typography.bodyStrong}>Loading…</Text>
            </View>
          </GlassPanel>
        ) : error ? (
          <GlassPanel contentPadding={16} radius={5}>
            <View style={{ gap: 10 }}>
              <Text style={{ color: colors.danger, fontWeight: "800" }}>
                {error}
              </Text>
            </View>
          </GlassPanel>
        ) : grouped.length === 0 ? (
          <GlassPanel contentPadding={16} radius={5}>
            <Text style={typography.body}>
              {search.trim()
                ? "No scan-outs match your search."
                : "No scan-outs recorded in the last 7 days."}
            </Text>
          </GlassPanel>
        ) : (
          grouped.map((group) => (
            <GlassPanel key={group.dateKey} contentPadding={0} radius={5}>
              <View style={styles.groupHeader}>
                <Text style={typography.label}>{group.heading}</Text>
              </View>
              {group.scanOuts.map((s) => (
                <View key={s.id} style={styles.row}>
                  {s.faceImageUrl ? (
                    <Image
                      source={{ uri: s.faceImageUrl }}
                      style={styles.avatar}
                    />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Text style={styles.avatarFallbackTxt}>
                        {initials(s.employeeName)}
                      </Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={typography.bodyStrong} numberOfLines={1}>
                      {s.employeeName}
                    </Text>
                    <Text style={typography.caption} numberOfLines={1}>
                      {s.siteName} • {formatTime(s.scannedOutAtISO)} •{" "}
                      {methodLabel(s.method)}
                      {s.confidence != null
                        ? ` (${Math.round(s.confidence * 100)}%)`
                        : ""}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      s.verificationStatus === "VERIFIED"
                        ? styles.statusVerified
                        : s.verificationStatus === "REJECTED"
                          ? styles.statusRejected
                          : styles.statusPending,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBadgeTxt,
                        {
                          color:
                            s.verificationStatus === "VERIFIED"
                              ? colors.success
                              : s.verificationStatus === "REJECTED"
                                ? colors.danger
                                : colors.warning,
                        },
                      ]}
                    >
                      {s.verificationStatus === "VERIFIED"
                        ? "Verified"
                        : s.verificationStatus === "REJECTED"
                          ? "Rejected"
                          : "Review"}
                    </Text>
                  </View>
                </View>
              ))}
            </GlassPanel>
          ))
        )}
      </ScrollView>
    </AuthStyleBackground>
  );
}

const getStyles = (
  colors: FaceColorPalette,
  radius: { sm: number; md: number; lg: number; xl: number; pill: number },
) =>
  StyleSheet.create({
    wrap: { flex: 1, paddingHorizontal: 16 },

    searchBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: radius.sm,
      backgroundColor: colors.glassFillStrong,
      borderWidth: 1,
      borderColor: colors.glassBorder,
    },
    searchInput: {
      flex: 1,
      color: colors.textPrimary,
      fontWeight: "700",
      fontSize: 14,
      paddingVertical: 0,
    },

    groupHeader: {
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.glassBorder,
    },

    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.glassBorder,
    },

    avatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.glassFillStrong,
    },
    avatarFallback: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.primaryDim,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarFallbackTxt: {
      fontWeight: "800",
      fontSize: 13,
      color: colors.primary,
    },

    statusBadge: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: radius.pill,
      borderWidth: 1,
    },
    statusBadgeTxt: { fontWeight: "800", fontSize: 11 },
    statusVerified: {
      backgroundColor: colors.successDim,
      borderColor: colors.successBorder,
    },
    statusRejected: {
      backgroundColor: colors.dangerDim,
      borderColor: colors.dangerBorder,
    },
    statusPending: {
      backgroundColor: colors.warningDim,
      borderColor: colors.warningBorder,
    },
  });
