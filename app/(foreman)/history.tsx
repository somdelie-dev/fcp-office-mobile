import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
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
import { OptimizedImage } from "@/components/OptimizedImage";
import { ZoomableImage } from "@/components/ZoomableImage";
import {
  apiForemanDeleteSiteDayPhoto,
  apiForemanRecentSiteDayPhotosCached,
  cacheForemanRecentSiteDayPhotos,
  type ForemanRecentSiteDayPhotoDto,
} from "@/lib/apiClient";
import { useNetworkStatus } from "@/lib/offline/hooks";
import { useTheme } from "@/lib/themeContext";

const { width } = Dimensions.get("window");
const GRID_GAP = 10;
const GRID_PADDING = 12;
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
    emptyText: "#64748b",
    inputBg: "#1e293b",
    inputBorder: "#334155",
  },
  light: {
    textPrimary: "#111",
    textSecondary: "#666",
    cardBg: "#fff",
    cardBorder: "#e2e8f0",
    emptyText: "#94a3b8",
    inputBg: "#fff",
    inputBorder: "#e2e8f0",
  },
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  PENDING: { bg: "rgba(251,191,36,0.2)", text: "#f59e0b" },
  VERIFIED: { bg: "rgba(16,185,129,0.2)", text: "#10b981" },
  REJECTED: { bg: "rgba(239,68,68,0.2)", text: "#ef4444" },
  FLAGGED: { bg: "rgba(99,102,241,0.2)", text: "#6366f1" },
};

type PhotoGroup = {
  dateKey: string;
  heading: string;
  photos: ForemanRecentSiteDayPhotoDto[];
};

function parseWorkDate(dateISO: string) {
  const dateOnly = dateISO.slice(0, 10);
  return new Date(`${dateOnly}T00:00:00`);
}

function getTimestamp(photo: ForemanRecentSiteDayPhotoDto) {
  return photo.uploadedAtISO ?? photo.dateTakenISO;
}

function formatTime(photo: ForemanRecentSiteDayPhotoDto) {
  const date = new Date(getTimestamp(photo));
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatUploaded(photo: ForemanRecentSiteDayPhotoDto) {
  if (!photo.uploadedAtISO) return null;
  const date = new Date(photo.uploadedAtISO);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString([], {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getHeading(dateISO: string) {
  const date = parseWorkDate(dateISO);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.getTime() === today.getTime()) return "Today's Submissions";
  if (date.getTime() === yesterday.getTime()) return "Yesterday's Submissions";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "long" });
}

function groupPhotos(photos: ForemanRecentSiteDayPhotoDto[]) {
  const groups = new Map<string, PhotoGroup>();
  for (const photo of photos) {
    const dateKey = photo.dateTakenISO.slice(0, 10);
    if (!groups.has(dateKey)) {
      groups.set(dateKey, {
        dateKey,
        heading: getHeading(photo.dateTakenISO),
        photos: [],
      });
    }
    groups.get(dateKey)!.photos.push(photo);
  }
  return [...groups.values()].sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}

function searchText(photo: ForemanRecentSiteDayPhotoDto) {
  return [
    photo.siteName,
    photo.verificationStatus ?? "PENDING",
    formatTime(photo),
    photo.dateTakenISO,
  ]
    .join(" ")
    .toLowerCase();
}

function PhotoCard({
  photo,
  colors,
  onPress,
}: {
  photo: ForemanRecentSiteDayPhotoDto;
  colors: (typeof themes)["light"];
  onPress: () => void;
}) {
  const status = photo.verificationStatus ?? "PENDING";
  const statusColors = STATUS_COLORS[status] ?? STATUS_COLORS.PENDING;

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.card,
        { backgroundColor: colors.cardBg, borderColor: colors.cardBorder },
      ]}
    >
      <OptimizedImage
        uri={photo.imageUrl}
        size="thumbnail"
        style={styles.photo}
        contentFit="cover"
      />
      <View style={styles.cardDetails}>
        <Text
          style={[styles.cardTitle, { color: colors.textPrimary }]}
          numberOfLines={1}
        >
          {photo.siteName}
        </Text>
        <View style={styles.cardMetaRow}>
          <Ionicons name="time-outline" size={12} color={colors.textSecondary} />
          <Text style={[styles.cardMetaText, { color: colors.textSecondary }]}>
            Taken at {formatTime(photo)}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusColors.bg }]}>
          <Text style={[styles.statusBadgeText, { color: statusColors.text }]}>
            {status}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function PhotoGrid({
  photos,
  colors,
  onPress,
}: {
  photos: ForemanRecentSiteDayPhotoDto[];
  colors: (typeof themes)["light"];
  onPress: (photo: ForemanRecentSiteDayPhotoDto) => void;
}) {
  const rows: ForemanRecentSiteDayPhotoDto[][] = [];
  for (let i = 0; i < photos.length; i += NUM_COLUMNS) {
    rows.push(photos.slice(i, i + NUM_COLUMNS));
  }

  return (
    <View style={styles.grid}>
      {rows.map((row, index) => (
        <View key={index.toString()} style={styles.gridRow}>
          {row.map((photo) => (
            <PhotoCard
              key={photo.id}
              photo={photo}
              colors={colors}
              onPress={() => onPress(photo)}
            />
          ))}
          {row.length < NUM_COLUMNS && <View style={styles.emptyCard} />}
        </View>
      ))}
    </View>
  );
}

export default function ForemanPhotoHistory() {
  const router = useRouter();
  const { theme } = useTheme();
  const colors = themes[theme];
  const networkStatus = useNetworkStatus();
  const hasLoadedRef = useRef(false);

  const [photos, setPhotos] = useState<ForemanRecentSiteDayPhotoDto[]>([]);
  const [selectedPhoto, setSelectedPhoto] =
    useState<ForemanRecentSiteDayPhotoDto | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else if (!hasLoadedRef.current) setLoading(true);
    setError(null);
    try {
      const result = await apiForemanRecentSiteDayPhotosCached(refresh);
      setPhotos(result.photos ?? []);
      hasLoadedRef.current = true;
    } catch (e: any) {
      setError(e?.message ?? "Failed to load photos.");
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

  const visiblePhotos = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return photos;
    return photos.filter((photo) => searchText(photo).includes(query));
  }, [photos, search]);

  const groupedPhotos = useMemo(() => groupPhotos(visiblePhotos), [visiblePhotos]);

  const openCamera = () => {
    setSelectedPhoto(null);
    router.push("/(foreman-stack)/SiteDayPhotoScreen" as any);
  };

  const deleteSelected = () => {
    if (!selectedPhoto) return;
    Alert.alert(
      "Delete Photo",
      "Delete this submitted photo? Verified photos cannot be removed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              await apiForemanDeleteSiteDayPhoto(selectedPhoto.id);
              const nextPhotos = photos.filter(
                (photo) => photo.id !== selectedPhoto.id,
              );
              setPhotos(nextPhotos);
              await cacheForemanRecentSiteDayPhotos(nextPhotos);
              setSelectedPhoto(null);
            } catch (e: any) {
              Alert.alert("Unable to delete", e?.message ?? "Please try again.");
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  const selectedStatus = selectedPhoto?.verificationStatus ?? "PENDING";
  const selectedColors =
    STATUS_COLORS[selectedStatus] ?? STATUS_COLORS.PENDING;
  const canDelete = selectedPhoto && selectedStatus !== "VERIFIED";

  return (
    <AuthStyleBackground>
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              My Site Photos
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Last 7 days {networkStatus === "offline" ? "- Offline cache" : ""}
            </Text>
          </View>
          <Pressable style={styles.takeButton} onPress={openCamera}>
            <Ionicons name="camera-outline" size={18} color="#fff" />
            <Text style={styles.takeButtonText}>Take Photo</Text>
          </Pressable>
        </View>

        <View style={styles.searchSection}>
          <View
            style={[
              styles.searchContainer,
              { backgroundColor: colors.inputBg, borderColor: colors.inputBorder },
            ]}
          >
            <Ionicons name="search-outline" size={20} color={colors.textSecondary} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search site or status"
              placeholderTextColor={colors.textSecondary}
              style={[styles.searchInput, { color: colors.textPrimary }]}
              returnKeyType="search"
            />
            {!!search && (
              <Pressable onPress={() => setSearch("")} hitSlop={8}>
                <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
              </Pressable>
            )}
          </View>
        </View>

        {loading && !refreshing ? (
          <LoadingOverlay visible message="Loading photos..." />
        ) : error ? (
          <View style={styles.centerContent}>
            <Ionicons name="alert-circle" size={46} color="#ef4444" />
            <Text style={[styles.messageText, { color: colors.textPrimary }]}>
              {error}
            </Text>
            <Pressable style={styles.retryButton} onPress={() => load()}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : groupedPhotos.length === 0 ? (
          <View style={styles.centerContent}>
            <Ionicons name="images-outline" size={60} color={colors.emptyText} />
            <Text style={[styles.messageText, { color: colors.emptyText }]}>
              {search.trim() ? "No photos match your search" : "No photos submitted yet"}
            </Text>
            {!search.trim() && (
              <Pressable style={styles.retryButton} onPress={openCamera}>
                <Text style={styles.retryText}>Take a Photo</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />
            }
            showsVerticalScrollIndicator={false}
          >
            {groupedPhotos.map((group) => (
              <View key={group.dateKey} style={styles.dateSection}>
                <Text style={[styles.dateHeading, { color: colors.textPrimary }]}>
                  {group.heading}
                </Text>
                <PhotoGrid photos={group.photos} colors={colors} onPress={setSelectedPhoto} />
              </View>
            ))}
          </ScrollView>
        )}

        <Modal
          visible={!!selectedPhoto}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedPhoto(null)}
        >
          <View style={styles.modalOverlay}>
            <Pressable style={styles.modalClose} onPress={() => setSelectedPhoto(null)}>
              <Ionicons name="close-circle" size={36} color="#fff" />
            </Pressable>
            {selectedPhoto && (
              <ScrollView
                contentContainerStyle={styles.modalScroll}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.modalImageWrap}>
                  <ZoomableImage
                    uri={selectedPhoto.imageUrl}
                    width={width - 32}
                    height={width - 32}
                    borderRadius={12}
                  />
                </View>
                <View style={styles.modalBadgeRow}>
                  <View style={styles.modalBadge}>
                    <Ionicons name="location" size={14} color="#fff" />
                    <Text style={styles.modalBadgeText}>{selectedPhoto.siteName}</Text>
                  </View>
                  <View style={styles.modalBadge}>
                    <Ionicons name="time" size={14} color="#fff" />
                    <Text style={styles.modalBadgeText}>Taken at {formatTime(selectedPhoto)}</Text>
                  </View>
                </View>
                <View style={[styles.currentStatus, { backgroundColor: selectedColors.bg }]}>
                  <Text style={[styles.currentStatusText, { color: selectedColors.text }]}>
                    {selectedStatus}
                  </Text>
                </View>
                {!!formatUploaded(selectedPhoto) && (
                  <Text style={styles.modalDetail}>
                    Uploaded: {formatUploaded(selectedPhoto)}
                  </Text>
                )}
                {selectedPhoto.verificationNotes && (
                  <View style={styles.noteBox}>
                    <Text style={styles.noteLabel}>Review note</Text>
                    <Text style={styles.noteText}>{selectedPhoto.verificationNotes}</Text>
                  </View>
                )}
                <View style={styles.actionRow}>
                  {selectedStatus === "REJECTED" && (
                    <Pressable style={[styles.actionButton, styles.retakeButton]} onPress={openCamera}>
                      <Ionicons name="camera-outline" size={18} color="#fff" />
                      <Text style={styles.actionText}>Retake Photo</Text>
                    </Pressable>
                  )}
                  {canDelete && (
                    <Pressable
                      style={[styles.actionButton, styles.deleteButton]}
                      disabled={deleting}
                      onPress={deleteSelected}
                    >
                      {deleting ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Ionicons name="trash-outline" size={18} color="#fff" />
                      )}
                      <Text style={styles.actionText}>
                        {deleting ? "Deleting..." : "Delete"}
                      </Text>
                    </Pressable>
                  )}
                </View>
                {selectedStatus === "VERIFIED" && (
                  <Text style={styles.lockedText}>Verified photos cannot be deleted.</Text>
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
    paddingTop: 6,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  title: { fontSize: 18, fontWeight: "900" },
  subtitle: { fontSize: 13, marginTop: 3 },
  takeButton: {
    backgroundColor: "#262D68",
    borderRadius: 8,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: "center",
  },
  takeButtonText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  searchSection: { paddingHorizontal: GRID_PADDING, paddingBottom: 12 },
  searchContainer: {
    minHeight: 40,
    borderRadius: 5,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 8 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: GRID_PADDING, paddingBottom: 32 },
  dateSection: { marginBottom: 24 },
  dateHeading: { fontSize: 18, fontWeight: "700", marginBottom: 12 },
  grid: { gap: GRID_GAP },
  gridRow: { flexDirection: "row", gap: GRID_GAP, marginBottom: GRID_GAP },
  card: {
    width: CARD_WIDTH,
    borderRadius: 5,
    borderWidth: 1,
    overflow: "hidden",
  },
  photo: { width: "100%", height: IMAGE_HEIGHT },
  emptyCard: { width: CARD_WIDTH },
  cardDetails: { padding: 10, gap: 6 },
  cardTitle: { fontSize: 13, fontWeight: "700" },
  cardMetaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  cardMetaText: { fontSize: 11 },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginTop: 2,
  },
  statusBadgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  centerContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  messageText: { fontSize: 15, textAlign: "center", marginTop: 14 },
  retryButton: {
    marginTop: 16,
    backgroundColor: "#262D68",
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: { color: "#fff", fontWeight: "700" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalClose: { position: "absolute", right: 20, top: 50, zIndex: 10 },
  modalScroll: {
    alignItems: "center",
    paddingTop: 80,
    paddingBottom: 40,
    paddingHorizontal: 16,
  },
  modalImageWrap: { width: width - 32, borderRadius: 12, overflow: "hidden" },
  modalBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
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
  modalBadgeText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  currentStatus: {
    marginTop: 16,
    alignSelf: "stretch",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  currentStatusText: { fontSize: 14, fontWeight: "800", letterSpacing: 0.5 },
  modalDetail: { marginTop: 12, color: "#cbd5e1", fontSize: 13 },
  noteBox: {
    alignSelf: "stretch",
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "rgba(239,68,68,0.18)",
  },
  noteLabel: { color: "#fca5a5", fontSize: 12, fontWeight: "800", marginBottom: 4 },
  noteText: { color: "#fff", fontSize: 14 },
  actionRow: { flexDirection: "row", gap: 12, marginTop: 18 },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retakeButton: { backgroundColor: "#2563eb" },
  deleteButton: { backgroundColor: "#ef4444" },
  actionText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  lockedText: { marginTop: 16, color: "#94a3b8", fontSize: 13 },
});
