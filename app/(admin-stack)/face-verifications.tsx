import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
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
import {
  apiAdminApproveFaceEnrollment,
  apiAdminDeleteFaceEnrollment,
  apiAdminEmployeeFaceVerificationHistory,
  apiAdminFaceEnrollments,
  apiAdminRejectFaceEnrollment,
  type FaceEnrollmentDto,
  type FaceEnrollmentPose,
  type FaceVerificationAttemptDto,
} from "@/lib/apiClient";
import { useTheme } from "@/lib/themeContext";

const { width } = Dimensions.get("window");
const GRID_GAP = 10;
const GRID_PADDING = 16;
const NUM_COLUMNS = 2;
const CARD_WIDTH =
  (width - GRID_PADDING * 2 - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

// Pose reference photos inside the profile modal — same 2-column grid, sized
// against the modal card's own width (capped at profileCard's maxWidth: 480)
// rather than the full screen width.
const POSE_GRID_GAP = 10;
const POSE_CARD_WIDTH =
  (Math.min(width, 480) - GRID_PADDING * 2 - POSE_GRID_GAP) / 2;

const themes = {
  dark: {
    textPrimary: "#e5e7eb",
    textSecondary: "#94a3b8",
    textMuted: "#64748b",
    cardBg: "#1e293b",
    cardBorder: "#334155",
    tabBg: "#1e293b",
    tabBorder: "#334155",
    inputBg: "#0f172a",
    inputBorder: "#334155",
  },
  light: {
    textPrimary: "#111",
    textSecondary: "#666",
    textMuted: "#94a3b8",
    cardBg: "#fff",
    cardBorder: "#e2e8f0",
    tabBg: "#f5f5f5",
    tabBorder: "#e0e0e0",
    inputBg: "#f8fafc",
    inputBorder: "#e2e8f0",
  },
};

type EmployeeGroup = {
  employeeId: string;
  employeeName: string;
  foremanName: string;
  enrolledAtISO: string;
  photos: FaceEnrollmentDto[];
};

const POSE_ORDER: FaceEnrollmentPose[] = [
  "FRONT",
  "LEFT",
  "RIGHT",
  "SMILE",
  "NEUTRAL",
];

function groupByEmployee(enrollments: FaceEnrollmentDto[]): EmployeeGroup[] {
  const map = new Map<string, EmployeeGroup>();
  for (const e of enrollments) {
    const existing = map.get(e.employeeId);
    if (existing) existing.photos.push(e);
    else
      map.set(e.employeeId, {
        employeeId: e.employeeId,
        employeeName: e.employeeName,
        foremanName: e.foremanName,
        enrolledAtISO: e.enrolledAtISO,
        photos: [e],
      });
  }
  return Array.from(map.values()).sort(
    (a, b) =>
      new Date(a.enrolledAtISO).getTime() - new Date(b.enrolledAtISO).getTime(),
  );
}

function groupPhotosByPose(
  photos: FaceEnrollmentDto[],
): Record<FaceEnrollmentPose, FaceEnrollmentDto[]> {
  const map = Object.fromEntries(
    POSE_ORDER.map((pose) => [pose, [] as FaceEnrollmentDto[]]),
  ) as Record<FaceEnrollmentPose, FaceEnrollmentDto[]>;
  for (const photo of photos) map[photo.pose]?.push(photo);
  for (const pose of POSE_ORDER) {
    map[pose].sort(
      (a, b) =>
        new Date(b.enrolledAtISO).getTime() -
        new Date(a.enrolledAtISO).getTime(),
    );
  }
  return map;
}

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function poseLabel(pose: string) {
  return pose.charAt(0) + pose.slice(1).toLowerCase();
}

type Tab = "pending" | "verified";

export default function AdminFaceVerificationsScreen() {
  const { theme } = useTheme();
  const colors = themes[theme];

  const [tab, setTab] = useState<Tab>("pending");

  // Pending-approval queue
  const [enrollments, setEnrollments] = useState<FaceEnrollmentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [rejectTarget, setRejectTarget] = useState<FaceEnrollmentDto | null>(
    null,
  );
  const [rejectReason, setRejectReason] = useState("");

  const setBusy = (id: string, busy: boolean) =>
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });

  const loadPending = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await apiAdminFaceEnrollments("PENDING_APPROVAL");
      setEnrollments(res.enrollments ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load pending face verifications.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadPending();
    }, [loadPending]),
  );

  const groups = useMemo(() => groupByEmployee(enrollments), [enrollments]);

  const removeFromList = (id: string) =>
    setEnrollments((prev) => prev.filter((e) => e.id !== id));

  const handleApprove = async (photo: FaceEnrollmentDto) => {
    setBusy(photo.id, true);
    try {
      await apiAdminApproveFaceEnrollment(photo.id);
      removeFromList(photo.id);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to approve photo.");
    } finally {
      setBusy(photo.id, false);
    }
  };

  const openReject = (photo: FaceEnrollmentDto) => {
    setRejectReason("");
    setRejectTarget(photo);
  };

  const confirmReject = async () => {
    if (!rejectTarget) return;
    const photo = rejectTarget;
    if (!rejectReason.trim()) return;
    setBusy(photo.id, true);
    try {
      await apiAdminRejectFaceEnrollment(photo.id, rejectReason.trim());
      removeFromList(photo.id);
      setRejectTarget(null);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to reject photo.");
    } finally {
      setBusy(photo.id, false);
    }
  };

  // Verified employees — loaded lazily on first visit to the tab.
  const [verifiedEnrollments, setVerifiedEnrollments] = useState<
    FaceEnrollmentDto[]
  >([]);
  const [verifiedLoading, setVerifiedLoading] = useState(false);
  const [verifiedLoaded, setVerifiedLoaded] = useState(false);
  const [verifiedError, setVerifiedError] = useState<string | null>(null);

  const loadVerified = useCallback(async () => {
    setVerifiedLoading(true);
    setVerifiedError(null);
    try {
      const res = await apiAdminFaceEnrollments("APPROVED");
      setVerifiedEnrollments(res.enrollments ?? []);
    } catch (e: any) {
      setVerifiedError(e?.message ?? "Failed to load verified team members.");
    } finally {
      setVerifiedLoading(false);
      setVerifiedLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (tab === "verified" && !verifiedLoaded) loadVerified();
  }, [tab, verifiedLoaded, loadVerified]);

  const verifiedGroups = useMemo(
    () => groupByEmployee(verifiedEnrollments),
    [verifiedEnrollments],
  );

  // Profile modal — reference photos come from the already-loaded verified
  // group; verification history is fetched per employee only when opened.
  const [profileTarget, setProfileTarget] = useState<EmployeeGroup | null>(
    null,
  );
  const [attempts, setAttempts] = useState<FaceVerificationAttemptDto[]>([]);
  const [attemptsLoading, setAttemptsLoading] = useState(false);
  const [attemptsError, setAttemptsError] = useState<string | null>(null);

  const openProfile = async (group: EmployeeGroup) => {
    setProfileTarget(group);
    setAttempts([]);
    setAttemptsError(null);
    setAttemptsLoading(true);
    try {
      const res = await apiAdminEmployeeFaceVerificationHistory(
        group.employeeId,
      );
      setAttempts(res.attempts ?? []);
    } catch (e: any) {
      setAttemptsError(e?.message ?? "Failed to load verification history.");
    } finally {
      setAttemptsLoading(false);
    }
  };

  const approvedAtForGroup = (group: EmployeeGroup) =>
    group.photos.find((p) => p.approvedAtISO)?.approvedAtISO ?? null;
  const approvedByForGroup = (group: EmployeeGroup) =>
    group.photos.find((p) => p.approvedByName)?.approvedByName ?? null;

  const deletePhoto = (photo: FaceEnrollmentDto, lastForPose: boolean) => {
    Alert.alert(
      `Delete ${poseLabel(photo.pose)} reference`,
      lastForPose
        ? "This is the only approved reference for this pose. Deleting it will leave this pose with no approved reference. This cannot be undone."
        : "This permanently removes this photo and its embedding. It will no longer be used for future scan-out matching. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setBusy(photo.id, true);
            try {
              await apiAdminDeleteFaceEnrollment(photo.id);
              setVerifiedEnrollments((prev) =>
                prev.filter((e) => e.id !== photo.id),
              );
              setProfileTarget((prev) =>
                prev
                  ? { ...prev, photos: prev.photos.filter((p) => p.id !== photo.id) }
                  : prev,
              );
            } catch (e: any) {
              Alert.alert("Error", e?.message ?? "Failed to delete photo.");
            } finally {
              setBusy(photo.id, false);
            }
          },
        },
      ],
    );
  };

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: "pending", label: "Pending Approval", count: groups.length },
    { key: "verified", label: "Verified", count: verifiedGroups.length },
  ];

  return (
    <AuthStyleBackground>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Face Verifications
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {tab === "pending"
              ? `${groups.length} team member${groups.length === 1 ? "" : "s"} awaiting approval`
              : `${verifiedGroups.length} verified team member${verifiedGroups.length === 1 ? "" : "s"}`}
          </Text>
        </View>

        <View
          style={[
            styles.tabRow,
            { backgroundColor: colors.tabBg, borderColor: colors.tabBorder },
          ]}
        >
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                style={[styles.tab, active && styles.tabActive]}
              >
                <Text
                  style={[
                    styles.tabText,
                    { color: active ? "#fff" : colors.textPrimary },
                  ]}
                >
                  {t.label} ({t.count})
                </Text>
              </Pressable>
            );
          })}
        </View>

        {tab === "pending" ? (
          loading && !refreshing ? (
            <View style={styles.centerFill}>
              <ActivityIndicator size="large" color="#4f46e5" />
            </View>
          ) : error ? (
            <View style={styles.centerFill}>
              <Ionicons name="alert-circle" size={48} color="#ef4444" />
              <Text style={[styles.errorText, { color: colors.textPrimary }]}>
                {error}
              </Text>
              <Pressable onPress={() => loadPending()} style={styles.retryBtn}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          ) : groups.length === 0 ? (
            <View style={styles.centerFill}>
              <Ionicons
                name="scan-outline"
                size={64}
                color={colors.textMuted}
              />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                All caught up — no reference photos are waiting for approval
              </Text>
            </View>
          ) : (
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => loadPending(true)}
                />
              }
            >
              {groups.map((group) => (
                <View
                  key={group.employeeId}
                  style={[
                    styles.groupCard,
                    {
                      backgroundColor: colors.cardBg,
                      borderColor: colors.cardBorder,
                    },
                  ]}
                >
                  <View style={styles.groupHeader}>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.groupName,
                          { color: colors.textPrimary },
                        ]}
                        numberOfLines={1}
                      >
                        {group.employeeName}
                      </Text>
                      <Text
                        style={[
                          styles.groupMeta,
                          { color: colors.textSecondary },
                        ]}
                      >
                        Captured by {group.foremanName} ·{" "}
                        {timeAgo(group.enrolledAtISO)}
                      </Text>
                    </View>
                    <View style={styles.countBadge}>
                      <Text style={styles.countBadgeText}>
                        {group.photos.length} photo
                        {group.photos.length === 1 ? "" : "s"}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.grid}>
                    {group.photos.map((photo) => {
                      const busy = busyIds.has(photo.id);
                      return (
                        <View
                          key={photo.id}
                          style={[
                            styles.photoCard,
                            { borderColor: colors.cardBorder },
                          ]}
                        >
                          <View style={styles.photoWrap}>
                            <Image
                              source={{ uri: photo.imageUrl }}
                              style={styles.photo}
                            />
                            <View style={styles.poseBadge}>
                              <Text style={styles.poseBadgeText}>
                                {poseLabel(photo.pose)}
                              </Text>
                            </View>
                          </View>
                          <View style={styles.photoFooter}>
                            {photo.qualityScore != null && (
                              <Text
                                style={[
                                  styles.qualityText,
                                  { color: colors.textMuted },
                                ]}
                              >
                                Quality {Math.round(photo.qualityScore * 100)}%
                              </Text>
                            )}
                            <View style={styles.photoActions}>
                              <Pressable
                                style={[styles.photoActionBtn, styles.approveBtn]}
                                onPress={() => handleApprove(photo)}
                                disabled={busy}
                              >
                                {busy ? (
                                  <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                  <Ionicons
                                    name="checkmark"
                                    size={16}
                                    color="#fff"
                                  />
                                )}
                              </Pressable>
                              <Pressable
                                style={[styles.photoActionBtn, styles.rejectBtn]}
                                onPress={() => openReject(photo)}
                                disabled={busy}
                              >
                                <Ionicons name="close" size={16} color="#fff" />
                              </Pressable>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ))}
            </ScrollView>
          )
        ) : verifiedLoading ? (
          <View style={styles.centerFill}>
            <ActivityIndicator size="large" color="#4f46e5" />
          </View>
        ) : verifiedError ? (
          <View style={styles.centerFill}>
            <Ionicons name="alert-circle" size={48} color="#ef4444" />
            <Text style={[styles.errorText, { color: colors.textPrimary }]}>
              {verifiedError}
            </Text>
            <Pressable onPress={loadVerified} style={styles.retryBtn}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : verifiedGroups.length === 0 ? (
          <View style={styles.centerFill}>
            <Ionicons
              name="shield-checkmark-outline"
              size={64}
              color={colors.textMuted}
            />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              No verified team members yet — approved reference photos will
              appear here
            </Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.grid}>
              {verifiedGroups.map((group) => {
                const cover =
                  group.photos.find((p) => p.pose === "FRONT") ??
                  group.photos[0];
                return (
                  <Pressable
                    key={group.employeeId}
                    onPress={() => openProfile(group)}
                    style={[
                      styles.verifiedCard,
                      {
                        backgroundColor: colors.cardBg,
                        borderColor: colors.cardBorder,
                      },
                    ]}
                  >
                    <Image
                      source={{ uri: cover.imageUrl }}
                      style={styles.verifiedPhoto}
                    />
                    <View style={styles.verifiedFooter}>
                      <Text
                        style={[
                          styles.verifiedName,
                          { color: colors.textPrimary },
                        ]}
                        numberOfLines={1}
                      >
                        {group.employeeName}
                      </Text>
                      <View style={styles.verifiedMetaRow}>
                        <Ionicons
                          name="shield-checkmark"
                          size={12}
                          color="#10b981"
                        />
                        <Text style={styles.verifiedMetaText}>
                          {group.photos.length} photo
                          {group.photos.length === 1 ? "" : "s"}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        )}

        {/* Reject reason modal */}
        <Modal
          visible={!!rejectTarget}
          transparent
          animationType="fade"
          onRequestClose={() => setRejectTarget(null)}
        >
          <View style={styles.dialogOverlay}>
            <View
              style={[
                styles.dialogCard,
                { backgroundColor: colors.cardBg, borderColor: colors.cardBorder },
              ]}
            >
              <Text style={[styles.dialogTitle, { color: colors.textPrimary }]}>
                Reject {rejectTarget?.pose.toLowerCase()} photo
                {rejectTarget ? ` — ${rejectTarget.employeeName}` : ""}
              </Text>
              <TextInput
                style={[
                  styles.dialogInput,
                  {
                    backgroundColor: colors.inputBg,
                    borderColor: colors.inputBorder,
                    color: colors.textPrimary,
                  },
                ]}
                placeholder="Reason (required) — e.g. blurry, face obscured, wrong person"
                placeholderTextColor={colors.textMuted}
                value={rejectReason}
                onChangeText={setRejectReason}
                multiline
              />
              <View style={styles.dialogActions}>
                <Pressable
                  style={[styles.dialogBtn, styles.dialogCancelBtn]}
                  onPress={() => setRejectTarget(null)}
                >
                  <Text style={[styles.dialogBtnText, { color: colors.textPrimary }]}>
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.dialogBtn,
                    styles.dialogRejectBtn,
                    (!rejectReason.trim() ||
                      (!!rejectTarget && busyIds.has(rejectTarget.id))) &&
                      styles.dialogBtnDisabled,
                  ]}
                  onPress={confirmReject}
                  disabled={
                    !rejectReason.trim() ||
                    (!!rejectTarget && busyIds.has(rejectTarget.id))
                  }
                >
                  {rejectTarget && busyIds.has(rejectTarget.id) ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.dialogBtnTextLight}>Reject Photo</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* Employee face-verification profile modal */}
        <Modal
          visible={!!profileTarget}
          transparent
          animationType="fade"
          onRequestClose={() => setProfileTarget(null)}
        >
          <View style={styles.dialogOverlay}>
            <View
              style={[
                styles.profileCard,
                { backgroundColor: colors.cardBg, borderColor: colors.cardBorder },
              ]}
            >
              {/* Fixed header, outside the ScrollView, so Close is always
                  reachable regardless of how much content is below it. */}
              <View style={styles.profileHeaderRow}>
                <Ionicons name="shield-checkmark" size={18} color="#10b981" />
                <Text
                  style={[styles.profileTitle, { color: colors.textPrimary }]}
                  numberOfLines={1}
                >
                  {profileTarget?.employeeName}
                </Text>
                <Pressable
                  onPress={() => setProfileTarget(null)}
                  hitSlop={10}
                  style={styles.profileCloseBtn}
                >
                  <Ionicons
                    name="close"
                    size={20}
                    color={colors.textSecondary}
                  />
                </Pressable>
              </View>
              <Text
                style={[styles.profileSubtitle, { color: colors.textSecondary }]}
              >
                Face verification profile
              </Text>

              <ScrollView
                style={styles.profileScroll}
                showsVerticalScrollIndicator={false}
              >
                {profileTarget && (
                  <>

                    <View
                      style={[
                        styles.infoBox,
                        { backgroundColor: colors.inputBg, borderColor: colors.inputBorder },
                      ]}
                    >
                      <View style={styles.infoRow}>
                        <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
                          Status
                        </Text>
                        <View style={styles.statusPill}>
                          <Text style={styles.statusPillText}>APPROVED</Text>
                        </View>
                      </View>
                      <View style={styles.infoRow}>
                        <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
                          Captured by
                        </Text>
                        <Text style={[styles.infoValue, { color: colors.textPrimary }]}>
                          {profileTarget.foremanName}
                        </Text>
                      </View>
                      <View style={styles.infoRow}>
                        <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
                          Enrolled
                        </Text>
                        <Text style={[styles.infoValue, { color: colors.textPrimary }]}>
                          {new Date(profileTarget.enrolledAtISO).toLocaleString()}
                        </Text>
                      </View>
                      {approvedAtForGroup(profileTarget) && (
                        <View style={styles.infoRow}>
                          <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
                            Approved
                          </Text>
                          <Text style={[styles.infoValue, { color: colors.textPrimary }]}>
                            {new Date(
                              approvedAtForGroup(profileTarget)!,
                            ).toLocaleString()}
                            {approvedByForGroup(profileTarget)
                              ? ` by ${approvedByForGroup(profileTarget)}`
                              : ""}
                          </Text>
                        </View>
                      )}
                    </View>

                    <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
                      Reference Faces — 5 poses
                    </Text>
                    {POSE_ORDER.map((pose) => {
                      const photosForPose = groupPhotosByPose(
                        profileTarget.photos,
                      )[pose];
                      return (
                        <View key={pose} style={{ marginBottom: 14 }}>
                          <View style={styles.poseHeaderRow}>
                            <Text
                              style={[styles.poseHeaderText, { color: colors.textPrimary }]}
                            >
                              {poseLabel(pose)}
                            </Text>
                            {photosForPose.length > 1 && (
                              <View style={styles.outlineBadge}>
                                <Text
                                  style={[styles.outlineBadgeText, { color: colors.textSecondary }]}
                                >
                                  {photosForPose.length} approved references
                                </Text>
                              </View>
                            )}
                          </View>
                          {photosForPose.length === 0 ? (
                            <Text
                              style={[styles.noRefText, { color: colors.textMuted, borderColor: colors.cardBorder }]}
                            >
                              No approved reference for this pose
                            </Text>
                          ) : (
                            <View style={styles.poseGrid}>
                              {photosForPose.map((photo, i) => (
                                <View
                                  key={photo.id}
                                  style={[
                                    styles.poseCard,
                                    { borderColor: colors.cardBorder },
                                  ]}
                                >
                                  <View style={styles.photoWrap}>
                                    <Image
                                      source={{ uri: photo.imageUrl }}
                                      style={styles.posePhoto}
                                    />
                                    {photosForPose.length > 1 && (
                                      <View
                                        style={[
                                          styles.ageBadge,
                                          i === 0
                                            ? styles.ageBadgeNewest
                                            : i === photosForPose.length - 1
                                              ? styles.ageBadgeOldest
                                              : styles.ageBadgeOlder,
                                        ]}
                                      >
                                        <Text style={styles.ageBadgeText}>
                                          {i === 0
                                            ? "Newest"
                                            : i === photosForPose.length - 1
                                              ? "Oldest"
                                              : "Older"}
                                        </Text>
                                      </View>
                                    )}
                                    <Pressable
                                      style={styles.deletePhotoBtn}
                                      onPress={() =>
                                        deletePhoto(
                                          photo,
                                          photosForPose.length === 1,
                                        )
                                      }
                                      disabled={busyIds.has(photo.id)}
                                    >
                                      <Ionicons name="trash" size={12} color="#fff" />
                                    </Pressable>
                                  </View>
                                  {photo.qualityScore != null && (
                                    <Text
                                      style={[styles.poseCardMeta, { color: colors.textMuted }]}
                                    >
                                      Quality {Math.round(photo.qualityScore * 100)}%
                                    </Text>
                                  )}
                                </View>
                              ))}
                            </View>
                          )}
                        </View>
                      );
                    })}

                    <View style={styles.sectionLabelRow}>
                      <Ionicons name="pulse" size={12} color={colors.textSecondary} />
                      <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginBottom: 0 }]}>
                        Verification history
                      </Text>
                    </View>
                    {attemptsLoading ? (
                      <ActivityIndicator size="small" color="#4f46e5" style={{ marginVertical: 12 }} />
                    ) : attemptsError ? (
                      <Text style={styles.attemptsErrorText}>{attemptsError}</Text>
                    ) : attempts.length === 0 ? (
                      <Text
                        style={[styles.noRefText, { color: colors.textMuted, borderColor: colors.cardBorder }]}
                      >
                        No scan-out verification attempts recorded yet
                      </Text>
                    ) : (
                      attempts.map((a) => (
                        <View
                          key={a.id}
                          style={[styles.attemptRow, { borderColor: colors.cardBorder }]}
                        >
                          <View>
                            <Text style={[styles.attemptMatch, { color: colors.textPrimary }]}>
                              {Math.round(a.confidence * 100)}% match
                            </Text>
                            <Text style={[styles.attemptDate, { color: colors.textSecondary }]}>
                              {new Date(a.createdAtISO).toLocaleString()}
                            </Text>
                          </View>
                          {a.livenessPassed !== null && (
                            <View style={styles.outlineBadge}>
                              <Text
                                style={[styles.outlineBadgeText, { color: colors.textSecondary }]}
                              >
                                {a.livenessPassed ? "Liveness OK" : "Liveness flagged"}
                              </Text>
                            </View>
                          )}
                        </View>
                      ))
                    )}
                  </>
                )}
              </ScrollView>
              <Pressable
                style={[styles.dialogBtn, styles.dialogCancelBtn, { marginTop: 12 }]}
                onPress={() => setProfileTarget(null)}
              >
                <Text style={[styles.dialogBtnText, { color: colors.textPrimary }]}>
                  Close
                </Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </View>
    </AuthStyleBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 24, fontWeight: "900" },
  subtitle: { fontSize: 13, fontWeight: "600", marginTop: 4 },

  tabRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 4,
    gap: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  tab: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 9 },
  tabActive: { backgroundColor: "#4f46e5" },
  tabText: { fontSize: 12, fontWeight: "800" },

  centerFill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  errorText: { fontSize: 16, textAlign: "center" },
  retryBtn: {
    backgroundColor: "#22c55e",
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: { color: "#fff", fontWeight: "600" },
  emptyText: { fontSize: 15, textAlign: "center", lineHeight: 22 },

  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: GRID_PADDING, paddingBottom: 32 },

  groupCard: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 16 },
  groupHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 8 },
  groupName: { fontSize: 15, fontWeight: "800" },
  groupMeta: { fontSize: 12, fontWeight: "600", marginTop: 2 },
  countBadge: {
    backgroundColor: "rgba(148,163,184,0.15)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  countBadgeText: { fontSize: 10, fontWeight: "700", color: "#94a3b8" },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: GRID_GAP },
  photoCard: { width: CARD_WIDTH, borderRadius: 10, borderWidth: 1, overflow: "hidden" },
  photoWrap: { position: "relative" },
  photo: { width: "100%", height: CARD_WIDTH * 0.85 },
  poseBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    backgroundColor: "rgba(0,0,0,0.65)",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
  },
  poseBadgeText: { fontSize: 10, fontWeight: "700", color: "#fff" },
  photoFooter: { padding: 8, gap: 6 },
  qualityText: { fontSize: 10 },
  photoActions: { flexDirection: "row", gap: 6 },
  photoActionBtn: {
    flex: 1,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  approveBtn: { backgroundColor: "#16a34a" },
  rejectBtn: { backgroundColor: "#dc2626" },

  verifiedCard: {
    width: CARD_WIDTH,
    borderRadius: 10,
    borderWidth: 1,
    overflow: "hidden",
  },
  verifiedPhoto: { width: "100%", height: CARD_WIDTH * 0.9 },
  verifiedFooter: { padding: 8, gap: 3 },
  verifiedName: { fontSize: 12, fontWeight: "700" },
  verifiedMetaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  verifiedMetaText: { fontSize: 10, color: "#10b981", fontWeight: "600" },

  dialogOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  dialogCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  dialogTitle: { fontSize: 15, fontWeight: "800", marginBottom: 10 },
  dialogInput: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    fontSize: 14,
    minHeight: 70,
    textAlignVertical: "top",
  },
  dialogActions: { flexDirection: "row", gap: 10, marginTop: 14 },
  dialogBtn: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  dialogCancelBtn: { backgroundColor: "rgba(148,163,184,0.15)" },
  dialogRejectBtn: { backgroundColor: "#dc2626" },
  dialogBtnDisabled: { opacity: 0.5 },
  dialogBtnText: { fontWeight: "700", fontSize: 14 },
  dialogBtnTextLight: { fontWeight: "700", fontSize: 14, color: "#fff" },

  profileCard: {
    width: "100%",
    maxWidth: 480,
    maxHeight: "85%",
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  // profileCard has no explicit height (only maxHeight), so `flex: 1` here
  // would zero out flexBasis and try to grow into space that, from Yoga's
  // point of view, doesn't definitely exist — collapsing the ScrollView to
  // ~0px. flexShrink alone keeps the natural (content) height as the basis
  // and only shrinks it down to fit when content exceeds profileCard's cap,
  // which is what actually keeps Close on screen without hiding the content.
  profileScroll: { flexShrink: 1 },
  profileHeaderRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  profileTitle: { fontSize: 17, fontWeight: "800", flex: 1 },
  profileCloseBtn: { padding: 2 },
  profileSubtitle: { fontSize: 12, marginBottom: 14 },

  infoBox: { borderRadius: 10, borderWidth: 1, padding: 10, gap: 6, marginBottom: 16 },
  infoRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  infoLabel: { fontSize: 12 },
  infoValue: { fontSize: 12, fontWeight: "600" },
  statusPill: {
    backgroundColor: "#059669",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  statusPillText: { fontSize: 10, fontWeight: "700", color: "#fff" },

  sectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  sectionLabelRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 4 },

  poseHeaderRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  poseHeaderText: { fontSize: 13, fontWeight: "700" },
  outlineBadge: {
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.4)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  outlineBadgeText: { fontSize: 9, fontWeight: "600" },
  noRefText: {
    fontSize: 10,
    textAlign: "center",
    padding: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 10,
  },

  poseGrid: { flexDirection: "row", flexWrap: "wrap", gap: POSE_GRID_GAP },
  poseCard: {
    width: POSE_CARD_WIDTH,
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
  },
  posePhoto: { width: "100%", height: POSE_CARD_WIDTH },
  poseCardMeta: { fontSize: 10, textAlign: "center", paddingVertical: 4 },
  ageBadge: {
    position: "absolute",
    top: 3,
    left: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 999,
  },
  ageBadgeNewest: { backgroundColor: "rgba(5,150,105,0.85)" },
  ageBadgeOldest: { backgroundColor: "rgba(217,119,6,0.85)" },
  ageBadgeOlder: { backgroundColor: "rgba(0,0,0,0.6)" },
  ageBadgeText: { fontSize: 8, fontWeight: "700", color: "#fff" },
  deletePhotoBtn: {
    position: "absolute",
    top: 3,
    right: 3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },

  attemptRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
  },
  attemptMatch: { fontSize: 12, fontWeight: "700" },
  attemptDate: { fontSize: 10, marginTop: 2 },
  attemptsErrorText: { fontSize: 12, color: "#ef4444" },
});
