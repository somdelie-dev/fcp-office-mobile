import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  Dimensions,
  Image,
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
} from "react-native";

import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import LoadingOverlay from "@/components/LoadingOverlay";
import { ZoomableImage } from "@/components/ZoomableImage";
import {
  apiAdminVerifyPhoto,
  apiSupervisorSiteDayPhotos,
  type SupervisorSiteDayPhotoDto,
} from "@/lib/apiClient";
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
    badgeBg: "rgba(0,0,0,0.7)",
    badgeText: "#fff",
    sectionBg: "#0f172a",
    emptyText: "#64748b",
    inputBg: "#1e293b",
    inputBorder: "#334155",
  },
  light: {
    textPrimary: "#111",
    textSecondary: "#666",
    cardBg: "#fff",
    cardBorder: "#e2e8f0",
    badgeBg: "rgba(0,0,0,0.6)",
    badgeText: "#fff",
    sectionBg: "#f8fafc",
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

type GroupedPhotos = {
  dateKey: string;
  heading: string;
  photos: SupervisorSiteDayPhotoDto[];
};

function getPhotoTimestamp(photo: SupervisorSiteDayPhotoDto) {
  return photo.uploadedAtISO ?? photo.dateTakenISO;
}

function formatPhotoTime(photo: SupervisorSiteDayPhotoDto) {
  const timestamp = new Date(getPhotoTimestamp(photo));
  if (Number.isNaN(timestamp.getTime())) return "Time unavailable";
  return timestamp.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getSearchText(photo: SupervisorSiteDayPhotoDto) {
  const timestamp = new Date(getPhotoTimestamp(photo));
  const formattedDateTime = Number.isNaN(timestamp.getTime())
    ? ""
    : timestamp.toLocaleString();

  return [
    photo.siteName,
    photo.foremanName,
    photo.verificationStatus ?? "PENDING",
    formattedDateTime,
  ]
    .join(" ")
    .toLowerCase();
}

function getDateHeading(dateStr: string): { dateKey: string; heading: string } {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const photoDate = new Date(date);
  photoDate.setHours(0, 0, 0, 0);

  const dateKey = photoDate.toISOString().split("T")[0];

  if (photoDate.getTime() === today.getTime()) {
    return { dateKey, heading: "Today's Submissions" };
  }
  if (photoDate.getTime() === yesterday.getTime()) {
    return { dateKey, heading: "Yesterday's Submissions" };
  }

  const day = photoDate.getDate();
  const monthName = photoDate.toLocaleDateString("en-US", { month: "long" });
  return { dateKey, heading: `${day} ${monthName}` };
}

function groupPhotosByDate(
  photos: SupervisorSiteDayPhotoDto[],
): GroupedPhotos[] {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const filtered = photos.filter((p) => {
    const photoDate = new Date(p.dateTakenISO);
    return photoDate >= sevenDaysAgo;
  });

  const groups: Record<string, GroupedPhotos> = {};

  for (const photo of filtered) {
    const { dateKey, heading } = getDateHeading(photo.dateTakenISO);
    if (!groups[dateKey]) {
      groups[dateKey] = { dateKey, heading, photos: [] };
    }
    groups[dateKey].photos.push(photo);
  }

  // Sort groups by date descending (newest first)
  return Object.values(groups).sort(
    (a, b) => new Date(b.dateKey).getTime() - new Date(a.dateKey).getTime(),
  );
}

function PhotoCard({
  item,
  colors,
  onPress,
}: {
  item: SupervisorSiteDayPhotoDto;
  colors: (typeof themes)["light"];
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.card,
        { backgroundColor: colors.cardBg, borderColor: colors.cardBorder },
      ]}
    >
      <Image source={{ uri: item.imageUrl }} style={styles.photo} />
      <View style={styles.cardDetails}>
        <Text
          style={[styles.cardTitle, { color: colors.textPrimary }]}
          numberOfLines={1}
        >
          {item.siteName}
        </Text>
        <View style={styles.cardMetaRow}>
          <Ionicons
            name="person-outline"
            size={12}
            color={colors.textSecondary}
          />
          <Text
            style={[styles.cardMetaText, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            {item.foremanName}
          </Text>
        </View>
        <View style={styles.cardMetaRow}>
          <Ionicons
            name="time-outline"
            size={12}
            color={colors.textSecondary}
          />
          <Text style={[styles.cardMetaText, { color: colors.textSecondary }]}>
            Taken at {formatPhotoTime(item)}
          </Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor:
                STATUS_COLORS[item.verificationStatus ?? "PENDING"]?.bg ??
                STATUS_COLORS.PENDING.bg,
            },
          ]}
        >
          <Text
            style={[
              styles.statusBadgeText,
              {
                color:
                  STATUS_COLORS[item.verificationStatus ?? "PENDING"]?.text ??
                  STATUS_COLORS.PENDING.text,
              },
            ]}
          >
            {item.verificationStatus ?? "PENDING"}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function PhotoGrid({
  photos,
  colors,
  onPhotoPress,
}: {
  photos: SupervisorSiteDayPhotoDto[];
  colors: (typeof themes)["light"];
  onPhotoPress: (photo: SupervisorSiteDayPhotoDto) => void;
}) {
  const rows: SupervisorSiteDayPhotoDto[][] = [];
  for (let i = 0; i < photos.length; i += NUM_COLUMNS) {
    rows.push(photos.slice(i, i + NUM_COLUMNS));
  }

  return (
    <View style={styles.grid}>
      {rows.map((row, rowIdx) => (
        <View key={rowIdx} style={styles.gridRow}>
          {row.map((photo) => (
            <PhotoCard
              key={photo.id}
              item={photo}
              colors={colors}
              onPress={() => onPhotoPress(photo)}
            />
          ))}
          {/* Fill empty space if odd number */}
          {row.length < NUM_COLUMNS && <View style={styles.emptyCard} />}
        </View>
      ))}
    </View>
  );
}

export default function SupervisorPhotosScreen() {
  const { theme } = useTheme();
  const colors = themes[theme];

  const [photos, setPhotos] = useState<SupervisorSiteDayPhotoDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedPhoto, setSelectedPhoto] =
    useState<SupervisorSiteDayPhotoDto | null>(null);

  const [submittingAction, setSubmittingAction] = useState<
    "VERIFY" | "REJECT" | null
  >(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);

  const verificationStatus = selectedPhoto?.verificationStatus ?? "PENDING";
  const isPending = verificationStatus === "PENDING";

  const visiblePhotos = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return photos;
    return photos.filter((photo) => getSearchText(photo).includes(query));
  }, [photos, search]);

  const groupedPhotos = useMemo(
    () => groupPhotosByDate(visiblePhotos),
    [visiblePhotos],
  );

  const handleVerify = async () => {
    if (!selectedPhoto) return;
    setSubmittingAction("VERIFY");
    setShowRejectInput(false);

    try {
      await apiAdminVerifyPhoto(selectedPhoto.id, { status: "VERIFIED" });

      setPhotos((prev) =>
        prev.map((p) =>
          p.id === selectedPhoto.id
            ? { ...p, verificationStatus: "VERIFIED" }
            : p,
        ),
      );

      setSelectedPhoto(null);
      setRejectNotes("");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to verify photo.");
    } finally {
      setSubmittingAction(null);
    }
  };

  const handleReject = async () => {
    if (!selectedPhoto) return;

    if (!showRejectInput) {
      setShowRejectInput(true);
      return;
    }

    setSubmittingAction("REJECT");
    try {
      const notes = rejectNotes.trim();
      await apiAdminVerifyPhoto(selectedPhoto.id, {
        status: "REJECTED",
        notes: notes || undefined,
      });

      setPhotos((prev) =>
        prev.map((p) =>
          p.id === selectedPhoto.id
            ? { ...p, verificationStatus: "REJECTED" }
            : p,
        ),
      );

      setSelectedPhoto(null);
      setShowRejectInput(false);
      setRejectNotes("");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to reject photo.");
    } finally {
      setSubmittingAction(null);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiSupervisorSiteDayPhotos();
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
      const res = await apiSupervisorSiteDayPhotos();
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

  return (
    <AuthStyleBackground>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Photo Verification
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Last 7 days
          </Text>
        </View>

        <View style={styles.searchSection}>
          <View
            style={[
              styles.searchContainer,
              {
                backgroundColor: colors.inputBg,
                borderColor: colors.inputBorder,
              },
            ]}
          >
            <Ionicons
              name="search-outline"
              size={20}
              color={colors.textSecondary}
            />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search site, foreman or status"
              placeholderTextColor={colors.textSecondary}
              style={[styles.searchInput, { color: colors.textPrimary }]}
              returnKeyType="search"
              autoCapitalize="none"
            />
            {!!search && (
              <Pressable onPress={() => setSearch("")} hitSlop={8}>
                <Ionicons
                  name="close-circle"
                  size={20}
                  color={colors.textSecondary}
                />
              </Pressable>
            )}
          </View>
        </View>

        {loading && !refreshing ? (
          <LoadingOverlay visible message="Loading photos..." />
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
        ) : groupedPhotos.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons
              name="images-outline"
              size={64}
              color={colors.emptyText}
            />
            <Text style={[styles.emptyText, { color: colors.emptyText }]}>
              {search.trim()
                ? "No photos match your search"
                : "No photos submitted in the last 7 days"}
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
            {groupedPhotos.map((group) => (
              <View key={group.dateKey} style={styles.dateSection}>
                <Text
                  style={[styles.dateHeading, { color: colors.textPrimary }]}
                >
                  {group.heading}
                </Text>
                <PhotoGrid
                  photos={group.photos}
                  colors={colors}
                  onPhotoPress={setSelectedPhoto}
                />
              </View>
            ))}
          </ScrollView>
        )}

        {/* Full Image Modal */}
        <Modal
          visible={!!selectedPhoto}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedPhoto(null)}
        >
          <KeyboardAvoidingView
            style={styles.modalOverlay}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <Pressable
              style={styles.modalClose}
              onPress={() => setSelectedPhoto(null)}
            >
              <Ionicons name="close-circle" size={36} color="#fff" />
            </Pressable>
            {selectedPhoto && (
              <ScrollView
                contentContainerStyle={styles.modalScroll}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="none"
              >
                <View key={selectedPhoto.id} style={styles.modalImageWrap}>
                  <ZoomableImage
                    uri={selectedPhoto.imageUrl}
                    width={width - 32}
                    height={width - 32}
                    borderRadius={12}
                  />
                </View>

                <View style={styles.modalInfo}>
                  <View style={styles.modalBadge}>
                    <Ionicons name="location" size={14} color="#fff" />
                    <Text style={styles.modalBadgeText}>
                      {selectedPhoto.siteName}
                    </Text>
                  </View>
                  <View style={styles.modalBadge}>
                    <Ionicons name="person" size={14} color="#fff" />
                    <Text style={styles.modalBadgeText}>
                      {selectedPhoto.foremanName}
                    </Text>
                  </View>
                  <View style={styles.modalBadge}>
                    <Ionicons name="time" size={14} color="#fff" />
                    <Text style={styles.modalBadgeText}>
                      Taken at {formatPhotoTime(selectedPhoto)}
                    </Text>
                  </View>
                </View>

                <View style={styles.currentStatus}>
                  <Text style={styles.currentStatusText}>
                    {verificationStatus}
                  </Text>
                </View>

                {showRejectInput && (
                  <TextInput
                    style={styles.rejectInput}
                    placeholder="Rejection reason (optional)"
                    placeholderTextColor="#94a3b8"
                    value={rejectNotes}
                    onChangeText={setRejectNotes}
                    multiline
                    autoFocus
                    blurOnSubmit={false}
                  />
                )}

                {isPending ? (
                  <View style={styles.actionRow}>
                    <Pressable
                      style={[styles.actionBtn, styles.verifyBtn]}
                      disabled={submittingAction !== null}
                      onPress={handleVerify}
                    >
                      {submittingAction === "VERIFY" ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Ionicons
                          name="checkmark-circle"
                          size={20}
                          color="#fff"
                        />
                      )}
                      <Text style={styles.actionBtnText}>
                        {submittingAction === "VERIFY"
                          ? "Verifying..."
                          : "Verify"}
                      </Text>
                    </Pressable>

                    <Pressable
                      style={[styles.actionBtn, styles.rejectBtn]}
                      disabled={submittingAction !== null}
                      onPress={handleReject}
                    >
                      {submittingAction === "REJECT" ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Ionicons
                          name="close-circle"
                          size={20}
                          color="#fff"
                        />
                      )}
                      <Text style={styles.actionBtnText}>
                        {submittingAction === "REJECT"
                          ? "Rejecting..."
                          : showRejectInput
                            ? "Confirm Reject"
                            : "Reject"}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </ScrollView>
            )}
          </KeyboardAvoidingView>
        </Modal>
      </View>
    </AuthStyleBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 18,
    fontWeight: "900",
  },
  subtitle: {
    fontSize: 14,
    backgroundColor: "rgba(0,0,0,0.1)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  searchSection: {
    paddingHorizontal: GRID_PADDING,
    paddingBottom: 12,
  },
  searchContainer: {
    minHeight: 40,
    borderRadius: 5,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: GRID_PADDING,
    paddingBottom: 32,
  },
  dateSection: {
    marginBottom: 24,
  },
  dateHeading: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
  },
  grid: {
    gap: GRID_GAP,
  },
  gridRow: {
    flexDirection: "row",
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },
  card: {
    width: CARD_WIDTH,
    borderRadius: 5,
    borderWidth: 1,
    overflow: "hidden",
  },
  photo: {
    width: "100%",
    height: IMAGE_HEIGHT,
  },
  emptyCard: {
    width: CARD_WIDTH,
  },
  cardDetails: {
    padding: 10,
    gap: 6,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  cardMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  cardMetaText: {
    fontSize: 11,
    flexShrink: 1,
  },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginTop: 2,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  errorWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  errorText: {
    fontSize: 16,
    textAlign: "center",
    marginTop: 12,
  },
  retryBtn: {
    marginTop: 16,
    backgroundColor: "#16A34A",
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: {
    color: "#fff",
    fontWeight: "600",
  },
  emptyWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 16,
    textAlign: "center",
    marginTop: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalClose: {
    position: "absolute",
    top: 50,
    right: 20,
    zIndex: 10,
  },
  modalContent: {
    width: "100%",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  modalImage: {
    width: width - 32,
    height: width - 32,
    borderRadius: 12,
  },
  modalInfo: {
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
  modalBadgeText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },

  // --- Verify/Reject modal UI (matches admin photo-verifications behavior) ---
  modalScroll: {
    alignItems: "center",
    paddingTop: 80,
    paddingBottom: 40,
    paddingHorizontal: 16,
  },
  modalImageWrap: {
    width: width - 32,
    borderRadius: 12,
    overflow: "hidden",
  },

  currentStatus: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    alignSelf: "stretch",
  },
  currentStatusText: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: "#fff",
  },

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
    justifyContent: "center",
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
  actionBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
