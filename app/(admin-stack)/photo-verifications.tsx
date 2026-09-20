import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Dimensions,
  Image,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import LoadingOverlay from "@/components/LoadingOverlay";
import { SearchablePickerModal } from "@/components/SearchablePickerModal";
import { ZoomableImage } from "@/components/ZoomableImage";
import {
  apiAdminDeletePhoto,
  apiAdminSiteDayPhotos,
  apiAdminVerifyPhoto,
  type AdminSiteDayPhotoDto,
} from "@/lib/apiClient";
import { useTheme } from "@/lib/themeContext";

const { width } = Dimensions.get("window");
const GRID_GAP = 10;
const GRID_PADDING = 16;
const NUM_COLUMNS = 2;
const CARD_WIDTH =
  (width - GRID_PADDING * 2 - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;
const IMAGE_HEIGHT = CARD_WIDTH * 0.85;

const themes = {
  dark: {
    textPrimary: "#e5e7eb",
    textSecondary: "#94a3b8",
    cardBg: "#1e293b",
    cardBorder: "#334155",
    badgeBg: "rgba(0,0,0,0.7)",
    badgeText: "#fff",
    emptyText: "#64748b",
    inputBg: "#0f172a",
    inputBorder: "#334155",
  },
  light: {
    textPrimary: "#111",
    textSecondary: "#666",
    cardBg: "#fff",
    cardBorder: "#e2e8f0",
    badgeBg: "rgba(0,0,0,0.6)",
    badgeText: "#fff",
    emptyText: "#94a3b8",
    inputBg: "#f8fafc",
    inputBorder: "#e2e8f0",
  },
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  PENDING: { bg: "rgba(251,191,36,0.2)", text: "#f59e0b" },
  VERIFIED: { bg: "rgba(16,185,129,0.2)", text: "#10b981" },
  REJECTED: { bg: "rgba(239,68,68,0.2)", text: "#ef4444" },
};

type FilterTab = "ALL" | "PENDING" | "VERIFIED" | "REJECTED";

function PhotoCard({
  item,
  colors,
  onPress,
}: {
  item: AdminSiteDayPhotoDto;
  colors: (typeof themes)["light"];
  onPress: () => void;
}) {
  const sc = STATUS_COLORS[item.verificationStatus] ?? STATUS_COLORS.PENDING;

  const uploadTime = new Date(item.uploadedAtISO).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.card,
        { backgroundColor: colors.cardBg, borderColor: colors.cardBorder },
      ]}
    >
      <View>
        <Image source={{ uri: item.imageUrl }} style={styles.photo} />
        {/* Status is short (VERIFIED/PENDING/REJECTED) so it's safe to keep
        as a small overlay badge; site/foreman names are not, and are shown
        in full below instead of truncated over the photo. */}
        <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
          <Text style={[styles.statusBadgeText, { color: sc.text }]}>
            {item.verificationStatus}
          </Text>
        </View>
      </View>

      <View style={styles.cardInfo}>
        <View style={styles.cardInfoRow}>
          <Ionicons name="location" size={11} color={colors.textSecondary} />
          <Text style={[styles.cardInfoText, { color: colors.textPrimary }]}>
            {item.siteCode ? `${item.siteCode} - ${item.siteName}` : item.siteName}
          </Text>
        </View>
        <View style={styles.cardInfoRow}>
          <Ionicons name="person" size={11} color={colors.textSecondary} />
          <Text style={[styles.cardInfoText, { color: colors.textPrimary }]}>
            {item.foremanName}
          </Text>
        </View>
        <View style={styles.cardInfoRow}>
          <Ionicons name="time" size={11} color={colors.textSecondary} />
          <Text style={[styles.cardInfoTextMuted, { color: colors.textSecondary }]}>
            {uploadTime}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

type FilterOption = { id: string; name: string; code?: string | null } | null;

export default function PhotoVerificationsScreen() {
  const { theme } = useTheme();
  const colors = themes[theme];
  const isDark = theme === "dark";
  const pickerColors = {
    textPrimary: colors.textPrimary,
    textSecondary: colors.textSecondary,
    border: colors.inputBorder,
  };

  const [photos, setPhotos] = useState<AdminSiteDayPhotoDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedPhoto, setSelectedPhoto] =
    useState<AdminSiteDayPhotoDto | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [rejectNotes, setRejectNotes] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);

  const [searchText, setSearchText] = useState("");
  const [filterSite, setFilterSite] = useState<FilterOption>(null);
  const [filterForeman, setFilterForeman] = useState<FilterOption>(null);
  const [filterSupervisor, setFilterSupervisor] = useState<FilterOption>(null);
  const [siteFilterOpen, setSiteFilterOpen] = useState(false);
  const [foremanFilterOpen, setForemanFilterOpen] = useState(false);
  const [supervisorFilterOpen, setSupervisorFilterOpen] = useState(false);

  const [filterTab, setFilterTab] = useState<FilterTab>("ALL");

  // Site/foreman/supervisor/search options are derived from the already-
  // loaded 7-day window rather than a separate request — every photo
  // already carries its site/foreman/supervisor name, so no round trip is
  // needed just to populate the filter dropdowns.
  const siteOptions = useMemo(() => {
    const map = new Map<string, { name: string; code: string | null }>();
    for (const p of photos) map.set(p.siteId, { name: p.siteName, code: p.siteCode });
    return Array.from(map.entries())
      .map(([id, site]) => ({ id, name: site.name, code: site.code }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [photos]);

  const foremanOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of photos) map.set(p.foremanId, p.foremanName);
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [photos]);

  const supervisorOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of photos) {
      if (p.supervisorId && p.supervisorName) map.set(p.supervisorId, p.supervisorName);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [photos]);

  const searchedPhotos = useMemo(() => {
    let list = photos;
    if (filterSite) list = list.filter((p) => p.siteId === filterSite.id);
    if (filterForeman) list = list.filter((p) => p.foremanId === filterForeman.id);
    if (filterSupervisor)
      list = list.filter((p) => p.supervisorId === filterSupervisor.id);
    const q = searchText.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.siteName.toLowerCase().includes(q) ||
          p.foremanName.toLowerCase().includes(q) ||
          (p.supervisorName ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [photos, filterSite, filterForeman, filterSupervisor, searchText]);

  const filteredPhotos = useMemo(() => {
    if (filterTab === "ALL") return searchedPhotos;
    return searchedPhotos.filter((p) => p.verificationStatus === filterTab);
  }, [searchedPhotos, filterTab]);

  const hasActiveFilters =
    !!searchText.trim() || !!filterSite || !!filterForeman || !!filterSupervisor;

  const counts = useMemo(() => {
    const c = { ALL: searchedPhotos.length, PENDING: 0, VERIFIED: 0, REJECTED: 0 };
    for (const p of searchedPhotos) {
      if (p.verificationStatus === "PENDING") c.PENDING++;
      else if (p.verificationStatus === "VERIFIED") c.VERIFIED++;
      else if (p.verificationStatus === "REJECTED") c.REJECTED++;
    }
    return c;
  }, [searchedPhotos]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiAdminSiteDayPhotos();
      setPhotos(res.photos ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load photos.");
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await apiAdminSiteDayPhotos();
      setPhotos(res.photos ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to refresh.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleVerify = async () => {
    if (!selectedPhoto) return;
    setVerifying(true);
    try {
      await apiAdminVerifyPhoto(selectedPhoto.id, { status: "VERIFIED" });
      setPhotos((prev) =>
        prev.map((p) =>
          p.id === selectedPhoto.id
            ? { ...p, verificationStatus: "VERIFIED" as const }
            : p,
        ),
      );
      setSelectedPhoto(null);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to verify photo.");
    } finally {
      setVerifying(false);
    }
  };

  const handleReject = async () => {
    if (!selectedPhoto) return;
    if (!showRejectInput) {
      setShowRejectInput(true);
      return;
    }
    setVerifying(true);
    try {
      await apiAdminVerifyPhoto(selectedPhoto.id, {
        status: "REJECTED",
        notes: rejectNotes.trim() || undefined,
      });
      setPhotos((prev) =>
        prev.map((p) =>
          p.id === selectedPhoto.id
            ? { ...p, verificationStatus: "REJECTED" as const }
            : p,
        ),
      );
      setSelectedPhoto(null);
      setShowRejectInput(false);
      setRejectNotes("");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to reject photo.");
    } finally {
      setVerifying(false);
    }
  };

  const handleDelete = () => {
    if (!selectedPhoto) return;
    Alert.alert(
      "Delete Photo",
      "Are you sure you want to delete this photo? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setVerifying(true);
            try {
              await apiAdminDeletePhoto(selectedPhoto.id);
              setPhotos((prev) =>
                prev.filter((p) => p.id !== selectedPhoto.id),
              );
              setSelectedPhoto(null);
            } catch (e: any) {
              Alert.alert("Error", e?.message ?? "Failed to delete photo.");
            } finally {
              setVerifying(false);
            }
          },
        },
      ],
    );
  };

  const openMap = () => {
    if (selectedPhoto?.latitude && selectedPhoto?.longitude) {
      Linking.openURL(
        `https://www.google.com/maps?q=${selectedPhoto.latitude},${selectedPhoto.longitude}`,
      );
    }
  };

  const closeModal = () => {
    setSelectedPhoto(null);
    setShowRejectInput(false);
    setRejectNotes("");
  };

  const isPending = selectedPhoto?.verificationStatus === "PENDING";
  const selectedStatusColors =
    STATUS_COLORS[selectedPhoto?.verificationStatus ?? "PENDING"] ??
    STATUS_COLORS.PENDING;

  const TABS: { key: FilterTab; label: string; color: string }[] = [
    { key: "ALL", label: "All", color: "#22c55e" },
    { key: "PENDING", label: "Pending", color: "#f59e0b" },
    { key: "VERIFIED", label: "Verified", color: "#10b981" },
    { key: "REJECTED", label: "Rejected", color: "#ef4444" },
  ];

  // Group photos by date
  const grouped = useMemo(() => {
    const map = new Map<
      string,
      { heading: string; photos: AdminSiteDayPhotoDto[] }
    >();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    for (const p of filteredPhotos) {
      const d = new Date(p.dateTakenISO);
      d.setHours(0, 0, 0, 0);
      const key = d.toISOString().split("T")[0];
      let heading: string;
      if (d.getTime() === today.getTime()) heading = "Today";
      else if (d.getTime() === yesterday.getTime()) heading = "Yesterday";
      else {
        heading = d.toLocaleDateString("en-US", {
          day: "numeric",
          month: "long",
        });
      }
      if (!map.has(key)) map.set(key, { heading, photos: [] });
      map.get(key)!.photos.push(p);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([, v]) => v);
  }, [filteredPhotos]);

  return (
    <AuthStyleBackground>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Scanouts Verifications
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Last 7 days
          </Text>
        </View>

        {/* Search */}
        <View style={styles.searchWrap}>
          <View
            style={[
              styles.searchBox,
              { borderColor: colors.inputBorder, backgroundColor: colors.inputBg },
            ]}
          >
            <Ionicons name="search" size={18} color={colors.textSecondary} />
            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Search site, foreman or supervisor…"
              placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
              style={[styles.searchInput, { color: colors.textPrimary }]}
              autoCapitalize="none"
            />
            {searchText.length > 0 && (
              <Pressable onPress={() => setSearchText("")} hitSlop={8}>
                <Ionicons
                  name="close-circle"
                  size={18}
                  color={colors.textSecondary}
                />
              </Pressable>
            )}
          </View>
        </View>

        {/* Site / Foreman / Supervisor filters */}
        <View style={styles.filterBar}>
          <Pressable
            style={[
              styles.filterTrigger,
              { borderColor: colors.inputBorder, backgroundColor: colors.inputBg },
            ]}
            onPress={() => setSiteFilterOpen(true)}
          >
            <Text
              style={[
                styles.filterTriggerText,
                { color: filterSite ? colors.textPrimary : colors.textSecondary },
              ]}
              numberOfLines={1}
            >
              {filterSite
                ? filterSite.code
                  ? `${filterSite.code} - ${filterSite.name}`
                  : filterSite.name
                : "All Sites"}
            </Text>
            <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            style={[
              styles.filterTrigger,
              { borderColor: colors.inputBorder, backgroundColor: colors.inputBg },
            ]}
            onPress={() => setForemanFilterOpen(true)}
          >
            <Text
              style={[
                styles.filterTriggerText,
                { color: filterForeman ? colors.textPrimary : colors.textSecondary },
              ]}
              numberOfLines={1}
            >
              {filterForeman ? filterForeman.name : "All Foremen"}
            </Text>
            <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            style={[
              styles.filterTrigger,
              { borderColor: colors.inputBorder, backgroundColor: colors.inputBg },
            ]}
            onPress={() => setSupervisorFilterOpen(true)}
          >
            <Text
              style={[
                styles.filterTriggerText,
                {
                  color: filterSupervisor ? colors.textPrimary : colors.textSecondary,
                },
              ]}
              numberOfLines={1}
            >
              {filterSupervisor ? filterSupervisor.name : "All Supervisors"}
            </Text>
            <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
          </Pressable>
        </View>

        <SearchablePickerModal
          visible={siteFilterOpen}
          title="Filter by Site"
          searchPlaceholder="Search sites or job number…"
          allLabel="All Sites"
          options={siteOptions}
          selectedId={filterSite?.id ?? null}
          onSelect={setFilterSite}
          onClose={() => setSiteFilterOpen(false)}
          colors={pickerColors}
          isDark={isDark}
        />
        <SearchablePickerModal
          visible={foremanFilterOpen}
          title="Filter by Foreman"
          searchPlaceholder="Search foremen…"
          allLabel="All Foremen"
          options={foremanOptions}
          selectedId={filterForeman?.id ?? null}
          onSelect={setFilterForeman}
          onClose={() => setForemanFilterOpen(false)}
          colors={pickerColors}
          isDark={isDark}
        />
        <SearchablePickerModal
          visible={supervisorFilterOpen}
          title="Filter by Supervisor"
          searchPlaceholder="Search supervisors…"
          allLabel="All Supervisors"
          options={supervisorOptions}
          selectedId={filterSupervisor?.id ?? null}
          onSelect={setFilterSupervisor}
          onClose={() => setSupervisorFilterOpen(false)}
          colors={pickerColors}
          isDark={isDark}
        />

        {/* Filter Tabs */}
        <View style={styles.tabRow}>
          {TABS.map((tab) => {
            const active = filterTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => setFilterTab(tab.key)}
                style={[
                  styles.tab,
                  {
                    backgroundColor: active
                      ? tab.color
                      : theme === "dark"
                        ? "rgba(255,255,255,0.08)"
                        : "rgba(0,0,0,0.06)",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.tabText,
                    { color: active ? "#fff" : colors.textSecondary },
                  ]}
                >
                  {tab.label} ({counts[tab.key]})
                </Text>
              </Pressable>
            );
          })}
        </View>

        {loading && !refreshing ? (
          <LoadingOverlay title="Loading photos…" message="Please wait" />
        ) : error ? (
          <View style={styles.errorWrap}>
            <Ionicons name="alert-circle" size={48} color="#ef4444" />
            <Text style={[styles.errorText, { color: colors.textPrimary }]}>
              {error}
            </Text>
            <Pressable onPress={load} style={styles.retryBtn}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : filteredPhotos.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons
              name="images-outline"
              size={64}
              color={colors.emptyText}
            />
            <Text style={[styles.emptyText, { color: colors.emptyText }]}>
              {hasActiveFilters
                ? "No photos match your filters"
                : filterTab === "ALL"
                  ? "No photos submitted in the last 7 days"
                  : `No ${filterTab.toLowerCase()} photos`}
            </Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={refresh} />
            }
          >
            {grouped.map((group) => (
              <View key={group.heading} style={styles.dateSection}>
                <Text
                  style={[styles.dateHeading, { color: colors.textPrimary }]}
                >
                  {group.heading}
                </Text>
                <View style={styles.grid}>
                  {(() => {
                    const rows: AdminSiteDayPhotoDto[][] = [];
                    for (let i = 0; i < group.photos.length; i += NUM_COLUMNS) {
                      rows.push(group.photos.slice(i, i + NUM_COLUMNS));
                    }
                    return rows.map((row, ri) => (
                      <View key={ri} style={styles.gridRow}>
                        {row.map((photo) => (
                          <PhotoCard
                            key={photo.id}
                            item={photo}
                            colors={colors}
                            onPress={() => {
                              setSelectedPhoto(photo);
                              setShowRejectInput(false);
                              setRejectNotes("");
                            }}
                          />
                        ))}
                        {row.length < NUM_COLUMNS && (
                          <View style={styles.emptyCard} />
                        )}
                      </View>
                    ));
                  })()}
                </View>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Photo Detail / Verify Modal */}
        <Modal
          visible={!!selectedPhoto}
          transparent
          animationType="fade"
          onRequestClose={closeModal}
        >
          <View style={styles.modalOverlay}>
            <Pressable style={styles.modalClose} onPress={closeModal}>
              <Ionicons name="close-circle" size={36} color="#fff" />
            </Pressable>
            {selectedPhoto && (
              <ScrollView
                contentContainerStyle={styles.modalScroll}
                showsVerticalScrollIndicator={false}
              >
                <ZoomableImage
                  uri={selectedPhoto.imageUrl}
                  width={width - 32}
                  height={width - 32}
                  borderRadius={12}
                />
                <View style={styles.modalInfo}>
                  <View style={styles.modalBadge}>
                    <Ionicons name="location" size={14} color="#fff" />
                    <Text style={styles.modalBadgeText}>
                      {selectedPhoto.siteCode
                        ? `${selectedPhoto.siteCode} - ${selectedPhoto.siteName}`
                        : selectedPhoto.siteName}
                    </Text>
                  </View>
                  <View style={styles.modalBadge}>
                    <Ionicons name="person" size={14} color="#fff" />
                    <Text style={styles.modalBadgeText}>
                      {selectedPhoto.foremanName}
                    </Text>
                  </View>
                </View>

                {/* Current status */}
                <View
                  style={[
                    styles.currentStatus,
                    { backgroundColor: selectedStatusColors.bg },
                  ]}
                >
                  <Text
                    style={[
                      styles.currentStatusText,
                      { color: selectedStatusColors.text },
                    ]}
                  >
                    {selectedPhoto.verificationStatus}
                  </Text>
                </View>

                {/* Photo details: uploaded time, work date, address */}
                <View style={styles.detailsSection}>
                  <View style={styles.detailRow}>
                    <Ionicons name="cloud-upload" size={14} color="#94a3b8" />
                    <Text style={styles.detailText}>
                      {"Uploaded: "}
                      {new Date(selectedPhoto.uploadedAtISO).toLocaleString(
                        "en-US",
                        {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: true,
                        },
                      )}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Ionicons name="calendar" size={14} color="#94a3b8" />
                    <Text style={styles.detailText}>
                      {"Work date: "}
                      {new Date(selectedPhoto.dateTakenISO).toLocaleDateString(
                        "en-US",
                        {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        },
                      )}
                    </Text>
                  </View>
                  {selectedPhoto.address && (
                    <View style={styles.detailRow}>
                      <Ionicons name="navigate" size={14} color="#94a3b8" />
                      <Text style={styles.detailText} numberOfLines={2}>
                        {selectedPhoto.address}
                      </Text>
                    </View>
                  )}
                  {selectedPhoto.latitude && selectedPhoto.longitude && (
                    <Pressable onPress={openMap} style={styles.mapLinkRow}>
                      <Ionicons name="map" size={14} color="#22c55e" />
                      <Text style={styles.mapLinkText}>View on map</Text>
                    </Pressable>
                  )}
                </View>

                {/* Reject notes input */}
                {showRejectInput && (
                  <TextInput
                    style={styles.rejectInput}
                    placeholder="Rejection reason (optional)"
                    placeholderTextColor="#94a3b8"
                    value={rejectNotes}
                    onChangeText={setRejectNotes}
                    multiline
                  />
                )}

                {/* Actions */}
                {isPending ? (
                  <View style={styles.actionRow}>
                    <Pressable
                      style={[styles.actionBtn, styles.verifyBtn]}
                      onPress={handleVerify}
                      disabled={verifying}
                    >
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color="#fff"
                      />
                      <Text style={styles.actionBtnText}>Verify</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.actionBtn, styles.rejectBtn]}
                      onPress={handleReject}
                      disabled={verifying}
                    >
                      <Ionicons name="close-circle" size={20} color="#fff" />
                      <Text style={styles.actionBtnText}>
                        {showRejectInput ? "Confirm Reject" : "Reject"}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.actionBtn, styles.deleteBtn]}
                      onPress={handleDelete}
                      disabled={verifying}
                    >
                      <Ionicons name="trash" size={20} color="#fff" />
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.actionRow}>
                    <Pressable
                      style={[styles.actionBtn, styles.deleteBtn]}
                      onPress={handleDelete}
                      disabled={verifying}
                    >
                      <Ionicons name="trash" size={18} color="#fff" />
                      <Text style={styles.actionBtnText}>Delete</Text>
                    </Pressable>
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </Modal>
      </View>
    </AuthStyleBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: { fontSize: 24, fontWeight: "900" },
  subtitle: { fontSize: 14, marginTop: 4 },

  searchWrap: { paddingHorizontal: 16, paddingBottom: 10 },
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

  filterBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  filterTrigger: {
    flexGrow: 1,
    flexBasis: "30%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    height: 38,
    borderRadius: 5,
    borderWidth: 1,
  },
  filterTriggerText: { flex: 1, fontSize: 12, fontWeight: "700" },

  tabRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 8,
    paddingBottom: 12,
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  tabText: { fontSize: 12, fontWeight: "700" },

  scrollView: { flex: 1 },
  scrollContent: {
    paddingHorizontal: GRID_PADDING,
    paddingBottom: 32,
  },
  dateSection: { marginBottom: 24 },
  dateHeading: { fontSize: 18, fontWeight: "700", marginBottom: 12 },
  grid: { gap: GRID_GAP },
  gridRow: {
    flexDirection: "row",
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },
  card: {
    width: CARD_WIDTH,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  photo: { width: "100%", height: IMAGE_HEIGHT },
  emptyCard: { width: CARD_WIDTH },

  statusBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusBadgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },

  cardInfo: { padding: 8, gap: 4 },
  cardInfoRow: { flexDirection: "row", alignItems: "flex-start", gap: 5 },
  cardInfoText: { fontSize: 11, fontWeight: "700", flex: 1, flexWrap: "wrap" },
  cardInfoTextMuted: { fontSize: 11, fontWeight: "600", flex: 1 },

  errorWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  errorText: { fontSize: 16, textAlign: "center", marginTop: 12 },
  retryBtn: {
    marginTop: 16,
    backgroundColor: "#22c55e",
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: { color: "#fff", fontWeight: "600" },

  emptyWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  emptyText: { fontSize: 16, textAlign: "center", marginTop: 16 },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
  },
  modalClose: {
    position: "absolute",
    top: 50,
    right: 20,
    zIndex: 10,
  },
  modalScroll: {
    alignItems: "center",
    paddingTop: 80,
    paddingBottom: 40,
    paddingHorizontal: 16,
  },
  modalImage: {
    width: width - 32,
    height: width - 32,
    borderRadius: 12,
  },
  modalInfo: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  modalBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  modalBadgeText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  currentStatus: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  currentStatusText: { fontSize: 14, fontWeight: "800", letterSpacing: 0.5 },

  rejectInput: {
    width: width - 64,
    marginTop: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 10,
    padding: 12,
    color: "#fff",
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: "top",
  },

  actionRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  verifyBtn: { backgroundColor: "#10b981" },
  rejectBtn: { backgroundColor: "#ef4444" },
  deleteBtn: { backgroundColor: "#64748b" },
  actionBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  detailsSection: {
    marginTop: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    padding: 12,
    gap: 8,
    width: width - 64,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  detailText: {
    color: "#cbd5e1",
    fontSize: 13,
    fontWeight: "500",
    flexShrink: 1,
  },
  mapLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  mapLinkText: {
    color: "#22c55e",
    fontSize: 13,
    fontWeight: "600",
  },
});
