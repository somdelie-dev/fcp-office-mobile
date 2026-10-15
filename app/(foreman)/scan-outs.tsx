import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import { GlassPanel } from "@/components/team";
import { useFaceTheme, type FaceColorPalette } from "@/components/team/faceTheme";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
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

import { ZoomableImage } from "@/components/ZoomableImage";

import {
  apiForemanRecentScanOuts,
  type ForemanScanOutDto,
} from "../../lib/apiClient";

/** Everyone scanned out with one site-day photo, shown as a single card. */
type PhotoGroup = {
  photoId: string;
  photoUrl: string | null;
  siteName: string;
  scannedOutAtISO: string;
  status: string;
  workers: string[];
};

type DayGroup = {
  dateKey: string;
  heading: string;
  photos: PhotoGroup[];
  // Face/fingerprint scan-outs have no group photo and stay one row each.
  individual: ForemanScanOutDto[];
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

function groupByDayAndPhoto(scanOuts: ForemanScanOutDto[]): DayGroup[] {
  const days = new Map<string, DayGroup>();
  const photos = new Map<string, PhotoGroup>();

  for (const s of scanOuts) {
    const dateKey = s.scannedOutAtISO.slice(0, 10);
    let day = days.get(dateKey);
    if (!day) {
      day = {
        dateKey,
        heading: getHeading(s.scannedOutAtISO),
        photos: [],
        individual: [],
      };
      days.set(dateKey, day);
    }

    if (!s.photoId) {
      day.individual.push(s);
      continue;
    }

    let group = photos.get(s.photoId);
    if (!group) {
      group = {
        photoId: s.photoId,
        photoUrl: s.photoUrl ?? null,
        siteName: s.siteName,
        scannedOutAtISO: s.scannedOutAtISO,
        status: s.photoVerificationStatus ?? "PENDING",
        workers: [],
      };
      photos.set(s.photoId, group);
      day.photos.push(group);
    }
    group.workers.push(s.employeeName);
  }

  return [...days.values()].sort((a, b) => b.dateKey.localeCompare(a.dateKey));
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

function statusLabel(status: string | null | undefined) {
  switch (status) {
    case "VERIFIED":
      return "Verified";
    case "REJECTED":
      return "Rejected";
    case "FLAGGED":
      return "Flagged";
    default:
      return "Pending";
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
  const [selected, setSelected] = useState<PhotoGroup | null>(null);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

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

  const days = useMemo(() => {
    const query = search.trim().toLowerCase();
    const all = groupByDayAndPhoto(scanOuts);
    if (!query) return all;
    return all
      .map((day) => ({
        ...day,
        photos: day.photos.filter(
          (p) =>
            p.siteName.toLowerCase().includes(query) ||
            p.workers.some((w) => w.toLowerCase().includes(query)),
        ),
        individual: day.individual.filter(
          (s) =>
            s.employeeName.toLowerCase().includes(query) ||
            s.siteName.toLowerCase().includes(query),
        ),
      }))
      .filter((day) => day.photos.length > 0 || day.individual.length > 0);
  }, [scanOuts, search]);

  const statusStyle = (status: string | null | undefined) =>
    status === "VERIFIED"
      ? { box: styles.statusVerified, color: colors.success }
      : status === "REJECTED" || status === "FLAGGED"
        ? { box: styles.statusRejected, color: colors.danger }
        : { box: styles.statusPending, color: colors.warning };

  const photoSize = windowWidth - 32;

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
            <Text style={{ color: colors.danger, fontWeight: "800" }}>
              {error}
            </Text>
          </GlassPanel>
        ) : days.length === 0 ? (
          <GlassPanel contentPadding={16} radius={5}>
            <Text style={typography.body}>
              {search.trim()
                ? "No scan-outs match your search."
                : "No scan-outs recorded in the last 7 days."}
            </Text>
          </GlassPanel>
        ) : (
          days.map((day) => (
            <GlassPanel key={day.dateKey} contentPadding={0} radius={5}>
              <View style={styles.groupHeader}>
                <Text style={typography.label}>{day.heading}</Text>
              </View>

              {day.photos.length > 0 && (
                <View style={styles.grid}>
                  {day.photos.map((p) => {
                    const st = statusStyle(p.status);
                    return (
                      <Pressable
                        key={p.photoId}
                        style={styles.card}
                        onPress={() => setSelected(p)}
                        accessibilityRole="button"
                        accessibilityLabel={`Scan-out photo at ${p.siteName}, ${p.workers.length} guys`}
                      >
                        <View>
                          {p.photoUrl ? (
                            <Image
                              source={{ uri: p.photoUrl }}
                              style={styles.cardPhoto}
                            />
                          ) : (
                            <View style={[styles.cardPhoto, styles.noPhoto]}>
                              <Ionicons
                                name="image-outline"
                                size={28}
                                color={colors.textTertiary}
                              />
                            </View>
                          )}
                          <View style={[styles.cardBadge, st.box]}>
                            <Text
                              style={[styles.statusBadgeTxt, { color: st.color }]}
                            >
                              {statusLabel(p.status)}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.cardInfo}>
                          <Text style={typography.bodyStrong} numberOfLines={2}>
                            {p.siteName}
                          </Text>
                          <Text style={typography.caption}>
                            {p.workers.length}{" "}
                            {p.workers.length === 1 ? "person" : "people"} •{" "}
                            {formatTime(p.scannedOutAtISO)}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {day.individual.map((s) => {
                const st = statusStyle(s.verificationStatus);
                return (
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
                    <View style={[styles.statusBadge, st.box]}>
                      <Text style={[styles.statusBadgeTxt, { color: st.color }]}>
                        {s.verificationStatus === "VERIFIED"
                          ? "Verified"
                          : s.verificationStatus === "REJECTED"
                            ? "Rejected"
                            : "Review"}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </GlassPanel>
          ))
        )}
      </ScrollView>

      <Modal
        visible={!!selected}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => setSelected(null)}
      >
        <View style={styles.previewOverlay}>
          <ScrollView
            contentContainerStyle={[
              styles.previewScroll,
              { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 24 },
            ]}
          >
            {selected && (
              <>
                {selected.photoUrl ? (
                  <ZoomableImage
                    uri={selected.photoUrl}
                    width={photoSize}
                    height={Math.min(photoSize, windowHeight * 0.55)}
                  />
                ) : null}
                <View style={styles.previewInfo}>
                  <Text style={styles.previewTitle}>{selected.siteName}</Text>
                  <Text style={styles.previewMuted}>
                    Scanned out at {formatTime(selected.scannedOutAtISO)} •{" "}
                    {statusLabel(selected.status)}
                  </Text>
                  <Text style={styles.previewSection}>
                    {selected.workers.length}{" "}
                    {selected.workers.length === 1 ? "person" : "people"} in
                    this scan-out
                  </Text>
                  {selected.workers.map((name, i) => (
                    <Text key={`${name}-${i}`} style={styles.previewWorker}>
                      {i + 1}. {name}
                    </Text>
                  ))}
                </View>
              </>
            )}
          </ScrollView>
          <Pressable
            style={[styles.previewClose, { top: insets.top + 12 }]}
            onPress={() => setSelected(null)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close-circle" size={40} color="#fff" />
          </Pressable>
        </View>
      </Modal>
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

    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      rowGap: 12,
      padding: 12,
    },
    card: {
      width: "48.5%",
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      backgroundColor: colors.glassFillStrong,
      overflow: "hidden",
    },
    cardPhoto: {
      width: "100%",
      aspectRatio: 1,
      backgroundColor: colors.glassFill,
    },
    noPhoto: {
      alignItems: "center",
      justifyContent: "center",
    },
    cardBadge: {
      position: "absolute",
      top: 8,
      right: 8,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: radius.pill,
      borderWidth: 1,
    },
    cardInfo: {
      padding: 10,
      gap: 2,
    },

    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderTopWidth: 1,
      borderTopColor: colors.glassBorder,
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

    previewOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.92)",
    },
    previewScroll: {
      alignItems: "center",
      paddingHorizontal: 16,
    },
    previewInfo: {
      alignSelf: "stretch",
      marginTop: 16,
      gap: 4,
    },
    previewTitle: { color: "#fff", fontSize: 18, fontWeight: "800" },
    previewMuted: { color: "#94a3b8", fontSize: 13 },
    previewSection: {
      color: "#e5e7eb",
      fontSize: 14,
      marginTop: 12,
      marginBottom: 4,
    },
    previewWorker: { color: "#fff", fontSize: 15, paddingVertical: 2 },
    previewClose: {
      position: "absolute",
      right: 16,
      zIndex: 10,
      elevation: 10,
    },
  });
