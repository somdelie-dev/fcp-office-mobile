import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import { GlassCard } from "@/components/GlassCard";
import LoadingOverlay from "@/components/LoadingOverlay";
import {
  apiSupervisorApproveTimesheet,
  apiSupervisorMarkPaid,
  apiSupervisorRejectTimesheet,
  apiSupervisorTimesheetDetail,
  apiSupervisorTimesheetsCached,
  type TimesheetDetailDto,
  type TimesheetListRowDto,
  type TimesheetStatus,
} from "@/lib/apiClient";
import { useDataCache } from "@/lib/dataCache";
import { useTheme } from "@/lib/themeContext";

// --- theme colors (matching home page) ---
const themes = {
  dark: {
    bg: "#0b1220",
    bgSecondary: "#0f172a",
    border: "#1f2a44",
    textPrimary: "white",
    textSecondary: "#94a3b8",
    textTertiary: "#cbd5e1",
    accent: "#38bdf8",
    accentLight: "rgba(56,189,248,0.18)",
    accentBorder: "rgba(56,189,248,0.45)",
    success: "#16a34a",
    error: "#dc2626",
    warning: "#f59e0b",
    cardBg: "rgba(15,23,42,0.8)",
    cardBgHover: "rgba(15,23,42,0.9)",
    modalOverlay: "rgba(0,0,0,0.6)",
  },
  light: {
    bg: "#f8fafc",
    bgSecondary: "#ffffff",
    border: "#e2e8f0",
    textPrimary: "#0f172a",
    textSecondary: "#64748b",
    textTertiary: "#475569",
    accent: "#0ea5e9",
    accentLight: "rgba(14,165,233,0.08)",
    accentBorder: "rgba(14,165,233,0.3)",
    success: "#22c55e",
    error: "#ef4444",
    warning: "#fbbf24",
    cardBg: "rgba(255,255,255,0.65)",
    cardBgHover: "rgba(255,255,255,0.75)",
    modalOverlay: "rgba(0,0,0,0.4)",
  },
};

// --- small helpers (no deps) ---
function isoToNice(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function badgeColor(status: TimesheetStatus) {
  switch (status) {
    case "SUBMITTED":
      return "#2563eb";
    case "ACCEPTED":
      return "#0891b2";
    case "APPROVED":
      return "#16a34a";
    case "REJECTED":
      return "#dc2626";
    case "PAID":
      return "#7c3aed";
    default:
      return "#64748b";
  }
}

function moneyZAR(value: number) {
  const rounded = Math.round(value * 100) / 100;
  return "R " + rounded.toFixed(2);
}

type StatusFilter = "ALL" | TimesheetStatus;

export default function ApprovalsScreen() {
  const { theme } = useTheme();
  const colors = themes[theme];
  const insets = useSafeAreaInsets();
  const { supervisorTimesheets, setSupervisorTimesheets, isFresh } =
    useDataCache();

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [items, setItems] = useState<TimesheetListRowDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState<string | undefined>();
  const [detail, setDetail] = useState<TimesheetDetailDto | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [actionBusy, setActionBusy] = useState<
    null | "approve" | "reject" | "paid"
  >(null);

  const load = useCallback(async () => {
    const cacheKey = `${status}_${q.trim()}`;

    if (
      !q.trim() &&
      supervisorTimesheets[cacheKey] &&
      isFresh(supervisorTimesheets[cacheKey].timestamp)
    ) {
      setItems(supervisorTimesheets[cacheKey].data.timesheets ?? []);
      setLoading(false);
      setError(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res: any = await apiSupervisorTimesheetsCached({
        q: q.trim() ? q.trim() : undefined,
        status,
        limit: 200,
      });
      setItems(res.timesheets ?? []);
      setSupervisorTimesheets(cacheKey, res);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load timesheets");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [q, status, supervisorTimesheets, isFresh, setSupervisorTimesheets]);

  const refresh = useCallback(async () => {
    try {
      setRefreshing(true);
      setError(null);
      const res: any = await apiSupervisorTimesheetsCached(
        {
          q: q.trim() ? q.trim() : undefined,
          status,
          limit: 200,
        },
        true,
      );
      setItems(res.timesheets ?? []);
      const cacheKey = `${status}_${q.trim()}`;
      setSupervisorTimesheets(cacheKey, res);
    } catch (e: any) {
      setError(e?.message ?? "Failed to refresh");
    } finally {
      setRefreshing(false);
    }
  }, [q, status, setSupervisorTimesheets]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = useCallback(async (id: string, siteId?: string) => {
    setSelectedId(id);
    setSelectedSiteId(siteId);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await apiSupervisorTimesheetDetail(id, siteId);
      setDetail(res as TimesheetDetailDto);
    } catch (e: any) {
      Alert.alert("Failed to load detail", e?.message ?? "Unknown error");
      setSelectedId(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const closeDetail = useCallback(() => {
    setSelectedId(null);
    setSelectedSiteId(undefined);
    setDetail(null);
  }, []);

  const canApprove =
    detail?.status === "SUBMITTED" || detail?.status === "ACCEPTED";
  const canReject = detail?.status === "SUBMITTED";
  const canMarkPaid = detail?.status === "APPROVED";

  const doApprove = useCallback(async () => {
    if (!detail?.id) return;
    setActionBusy("approve");
    try {
      await apiSupervisorApproveTimesheet(detail.id, selectedSiteId);
      Alert.alert("Approved", "Timesheet approved.");
      await openDetail(detail.id, selectedSiteId);
      await load();
    } catch (e: any) {
      Alert.alert("Approve failed", e?.message ?? "Unknown error");
    } finally {
      setActionBusy(null);
    }
  }, [detail?.id, load, openDetail, selectedSiteId]);

  const doReject = useCallback(async () => {
    if (!detail?.id) return;
    setRejectModal({
      visible: true,
      onClose: () => setRejectModal(null),
    });
  }, [detail?.id]);

  const doPaid = useCallback(async () => {
    if (!detail?.id) return;
    setActionBusy("paid");
    try {
      await apiSupervisorMarkPaid(detail.id, selectedSiteId);
      Alert.alert("Paid", "Timesheet marked as paid.");
      await openDetail(detail.id, selectedSiteId);
      await load();
    } catch (e: any) {
      Alert.alert("Mark paid failed", e?.message ?? "Unknown error");
    } finally {
      setActionBusy(null);
    }
  }, [detail?.id, load, openDetail, selectedSiteId]);

  const [rejectModal, setRejectModal] = useState<null | {
    visible: boolean;
    onClose: () => void;
  }>(null);
  const [rejectReasonInput, setRejectReasonInput] = useState("");

  useEffect(() => {
    if (rejectModal?.visible) setRejectReasonInput("");
  }, [rejectModal?.visible]);

  const statusOptions: StatusFilter[] = useMemo(
    () => ["ALL", "SUBMITTED", "ACCEPTED", "APPROVED", "REJECTED", "PAID"],
    [],
  );

  if (loading) {
    return (
      <AuthStyleBackground>
        <LoadingOverlay
          icon="⏳"
          title="Loading timesheets…"
          message="Please wait while we fetch your timesheets"
        />
      </AuthStyleBackground>
    );
  }

  return (
    <AuthStyleBackground>
      <ScrollView style={styles.wrap} showsVerticalScrollIndicator={false}>
        <GlassCard style={styles.topCard}>
          <View style={styles.headerRow}>
            <Text style={[styles.h1, { color: colors.textPrimary }]}>
              Approvals
            </Text>
            <Pressable onPress={() => load()}>
              <Ionicons name="refresh" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View style={{ height: 12 }} />

          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search foreman / site…"
            placeholderTextColor={colors.textSecondary}
            style={[
              styles.searchInput,
              {
                borderColor: colors.border,
                backgroundColor: colors.bgSecondary,
                color: colors.textPrimary,
              },
            ]}
            returnKeyType="search"
            onSubmitEditing={load}
          />

          <View style={{ height: 12 }} />

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {statusOptions.map((s) => {
              const active = status === s;
              return (
                <Pressable
                  key={s}
                  onPress={() => setStatus(s)}
                  style={[
                    styles.filterPill,
                    {
                      borderColor: active ? colors.accent : colors.border,
                      backgroundColor: active
                        ? colors.accentLight
                        : colors.bgSecondary,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.filterPillText,
                      {
                        color: active ? colors.accent : colors.textTertiary,
                      },
                    ]}
                  >
                    {s}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </GlassCard>

        {error ? (
          <GlassCard style={styles.middleCard}>
            <View
              style={[
                styles.errorBox,
                {
                  backgroundColor: colors.error + "15",
                  borderColor: colors.error + "33",
                },
              ]}
            >
              <Text style={[styles.errorText, { color: colors.error }]}>
                {error}
              </Text>
              <Pressable
                style={[
                  styles.retryPill,
                  {
                    backgroundColor: colors.bgSecondary,
                    borderColor: colors.border,
                  },
                ]}
                onPress={() => load()}
              >
                <Text style={[styles.retryTxt, { color: colors.textPrimary }]}>
                  Retry
                </Text>
              </Pressable>
            </View>
          </GlassCard>
        ) : (
          <GlassCard style={styles.middleCard}>
            {items.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                No timesheets found.
              </Text>
            ) : (
              <FlatList
                scrollEnabled={false}
                data={items}
                keyExtractor={(it) => it.rowKey ?? it.id}
                renderItem={({ item }) => {
                  return (
                    <Pressable
                      onPress={() => openDetail(item.id, item.siteId)}
                      style={[
                        styles.timesheetItem,
                        {
                          borderColor: colors.border,
                          backgroundColor: colors.cardBg,
                        },
                      ]}
                    >
                      <View style={styles.itemContent}>
                        <Text
                          style={[
                            styles.itemForemanName,
                            { color: colors.textPrimary },
                          ]}
                        >
                          {item.foremanName}
                        </Text>
                        <Text
                          style={[
                            styles.itemDate,
                            { color: colors.textSecondary },
                          ]}
                        >
                          {isoToNice(item.startISO)} → {isoToNice(item.endISO)}
                        </Text>
                        <Text
                          style={[
                            styles.itemSite,
                            { color: colors.textTertiary },
                          ]}
                        >
                          {(item.siteCode ? item.siteCode + " · " : "") +
                            item.siteName}
                        </Text>
                      </View>

                      <View
                        style={[
                          styles.statusBadge,
                          {
                            backgroundColor: colors.accentLight,
                            borderColor: colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusBadgeText,
                            {
                              color: badgeColor(item.status ?? "SUBMITTED"),
                            },
                          ]}
                        >
                          {item.status}
                        </Text>
                      </View>
                    </Pressable>
                  );
                }}
              />
            )}
          </GlassCard>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Detail Modal */}
      <Modal
        visible={!!selectedId}
        animationType="slide"
        onRequestClose={closeDetail}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.bg }]}>
          {/* Header */}
          <View
            style={[
              styles.modalHeader,
              {
                backgroundColor: colors.bgSecondary,
                borderBottomColor: colors.border,
                paddingTop: Math.max(insets.top, 14),
              },
            ]}
          >
            <View style={styles.modalHeaderLeft}>
              <Ionicons name="document-text" size={22} color={colors.accent} />
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                Timesheet Detail
              </Text>
            </View>
            <Pressable
              onPress={closeDetail}
              style={({ pressed }) => [
                styles.modalCloseBtn,
                {
                  backgroundColor: pressed ? colors.accentLight : "transparent",
                },
              ]}
            >
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>

          {detailLoading || !detail ? (
            <View style={styles.detailLoadingContainer}>
              <ActivityIndicator size="large" color={colors.accent} />
              <View style={{ height: 14 }} />
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: 15,
                  fontWeight: "500",
                }}
              >
                Loading timesheet…
              </Text>
            </View>
          ) : (
            <ScrollView
              style={styles.detailContent}
              contentContainerStyle={{ paddingBottom: 30 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Hero Card */}
              <View
                style={[
                  styles.detailHeroCard,
                  {
                    borderColor: colors.accentBorder,
                    backgroundColor: colors.accentLight,
                  },
                ]}
              >
                <View style={styles.detailHeroTop}>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.detailForemanName,
                        { color: colors.textPrimary },
                      ]}
                    >
                      {detail.foremanName ?? detail.foreman?.name ?? "Foreman"}
                    </Text>
                    <View style={styles.detailDateRow}>
                      <Ionicons
                        name="calendar-outline"
                        size={14}
                        color={colors.textSecondary}
                      />
                      <Text
                        style={[
                          styles.detailDate,
                          { color: colors.textSecondary },
                        ]}
                      >
                        {isoToNice(detail.startISO)} →{" "}
                        {isoToNice(detail.endISO)}
                      </Text>
                    </View>
                    <View style={styles.detailSiteRow}>
                      <Ionicons
                        name="location-outline"
                        size={14}
                        color={colors.textTertiary}
                      />
                      <Text
                        style={[
                          styles.detailSite,
                          { color: colors.textTertiary },
                        ]}
                        numberOfLines={2}
                      >
                        {detail.sitesLabel}
                      </Text>
                    </View>
                  </View>
                  <View
                    style={[
                      styles.statusBadgeLarge,
                      { backgroundColor: badgeColor(detail.status) + "22" },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBadgeLargeText,
                        { color: badgeColor(detail.status) },
                      ]}
                    >
                      {detail.status}
                    </Text>
                  </View>
                </View>

                {detail.submittedAt && (
                  <View style={styles.detailSubmittedRow}>
                    <Ionicons
                      name="time-outline"
                      size={13}
                      color={colors.textSecondary}
                    />
                    <Text
                      style={{
                        color: colors.textSecondary,
                        fontSize: 12,
                        marginLeft: 4,
                      }}
                    >
                      Submitted {isoToNice(detail.submittedAt)}
                    </Text>
                  </View>
                )}
              </View>

              {/* Stats Grid */}
              <View style={styles.statsGrid}>
                <View
                  style={[
                    styles.statCard,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.cardBg,
                    },
                  ]}
                >
                  <Ionicons
                    name="calendar"
                    size={20}
                    color={colors.accent}
                    style={{ marginBottom: 6 }}
                  />
                  <Text
                    style={[styles.statValue, { color: colors.textPrimary }]}
                  >
                    {detail.totals?.totalDays ??
                      detail.rows?.reduce(
                        (a, r) => a + (r.daysWorked ?? 0),
                        0,
                      ) ??
                      0}
                  </Text>
                  <Text
                    style={[styles.statLabel, { color: colors.textSecondary }]}
                  >
                    Total Days
                  </Text>
                </View>

                <View
                  style={[
                    styles.statCard,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.cardBg,
                    },
                  ]}
                >
                  <Ionicons
                    name="wallet"
                    size={20}
                    color={colors.success}
                    style={{ marginBottom: 6 }}
                  />
                  <Text
                    style={[styles.statValue, { color: colors.textPrimary }]}
                  >
                    {moneyZAR(
                      detail.totals?.totalPay ??
                        detail.rows?.reduce((a, r) => a + (r.pay ?? 0), 0) ??
                        0,
                    )}
                  </Text>
                  <Text
                    style={[styles.statLabel, { color: colors.textSecondary }]}
                  >
                    Total Pay
                  </Text>
                </View>
              </View>

              {/* Actions */}
              <View style={styles.actionsSection}>
                <View style={styles.actionsRow}>
                  <Pressable
                    disabled={!canApprove || actionBusy != null}
                    onPress={doApprove}
                    style={({ pressed }) => [
                      styles.actionButtonPrimary,
                      {
                        backgroundColor:
                          !canApprove || actionBusy
                            ? "rgba(22,163,74,0.15)"
                            : pressed
                              ? "#15803d"
                              : colors.success,
                        opacity: !canApprove ? 0.5 : 1,
                      },
                    ]}
                  >
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color="white"
                      style={{ marginRight: 6 }}
                    />
                    <Text style={styles.actionButtonText}>
                      {actionBusy === "approve" ? "Approving…" : "Approve"}
                    </Text>
                  </Pressable>

                  <Pressable
                    disabled={!canReject || actionBusy != null}
                    onPress={doReject}
                    style={({ pressed }) => [
                      styles.actionButtonPrimary,
                      {
                        backgroundColor:
                          !canReject || actionBusy
                            ? "rgba(220,38,38,0.15)"
                            : pressed
                              ? "#b91c1c"
                              : colors.error,
                        opacity: !canReject ? 0.5 : 1,
                      },
                    ]}
                  >
                    <Ionicons
                      name="close-circle"
                      size={18}
                      color="white"
                      style={{ marginRight: 6 }}
                    />
                    <Text style={styles.actionButtonText}>
                      {actionBusy === "reject" ? "Rejecting…" : "Reject"}
                    </Text>
                  </Pressable>
                </View>

                <Pressable
                  disabled={!canMarkPaid || actionBusy != null}
                  onPress={doPaid}
                  style={({ pressed }) => [
                    styles.actionButtonSecondary,
                    {
                      backgroundColor:
                        !canMarkPaid || actionBusy
                          ? "rgba(124,58,237,0.15)"
                          : pressed
                            ? "#6d28d9"
                            : "#7c3aed",
                      opacity: !canMarkPaid ? 0.5 : 1,
                    },
                  ]}
                >
                  <Ionicons
                    name="cash"
                    size={18}
                    color="white"
                    style={{ marginRight: 6 }}
                  />
                  <Text style={styles.actionButtonText}>
                    {actionBusy === "paid" ? "Marking…" : "Mark as Paid"}
                  </Text>
                </Pressable>
              </View>

              {/* Workers Section */}
              <View style={styles.workersSection}>
                <View style={styles.workersSectionHeader}>
                  <Ionicons
                    name="people"
                    size={18}
                    color={colors.accent}
                    style={{ marginRight: 8 }}
                  />
                  <Text
                    style={[
                      styles.workersSectionTitle,
                      { color: colors.textPrimary },
                    ]}
                  >
                    Workers
                  </Text>
                  <View
                    style={[
                      styles.workerCountBadge,
                      { backgroundColor: colors.accentLight },
                    ]}
                  >
                    <Text style={{ color: colors.accent, fontWeight: "700" }}>
                      {detail.rows?.length ?? 0}
                    </Text>
                  </View>
                </View>

                <FlatList
                  scrollEnabled={false}
                  data={detail.rows ?? []}
                  keyExtractor={(r) => r.employeeId}
                  renderItem={({ item }) => (
                    <View
                      style={[
                        styles.workerCard,
                        {
                          borderColor: colors.border,
                          backgroundColor: colors.cardBg,
                        },
                      ]}
                    >
                      <View style={styles.workerCardHeader}>
                        <View
                          style={[
                            styles.workerAvatar,
                            { backgroundColor: colors.accentLight },
                          ]}
                        >
                          <Ionicons
                            name="person"
                            size={16}
                            color={colors.accent}
                          />
                        </View>
                        <Text
                          style={[
                            styles.workerName,
                            { color: colors.textPrimary },
                          ]}
                        >
                          {item.fullName}
                        </Text>
                      </View>
                      <View style={styles.workerStats}>
                        <View style={styles.workerStatItem}>
                          <Text
                            style={[
                              styles.workerStatValue,
                              { color: colors.textPrimary },
                            ]}
                          >
                            {item.daysWorked}
                          </Text>
                          <Text
                            style={[
                              styles.workerStatLabel,
                              { color: colors.textSecondary },
                            ]}
                          >
                            days
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.workerStatDivider,
                            { backgroundColor: colors.border },
                          ]}
                        />
                        <View style={styles.workerStatItem}>
                          <Text
                            style={[
                              styles.workerStatValue,
                              { color: colors.textPrimary },
                            ]}
                          >
                            {moneyZAR(item.dayRate)}
                          </Text>
                          <Text
                            style={[
                              styles.workerStatLabel,
                              { color: colors.textSecondary },
                            ]}
                          >
                            rate
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.workerStatDivider,
                            { backgroundColor: colors.border },
                          ]}
                        />
                        <View style={styles.workerStatItem}>
                          <Text
                            style={[
                              styles.workerStatValue,
                              { color: colors.success },
                            ]}
                          >
                            {moneyZAR(item.pay)}
                          </Text>
                          <Text
                            style={[
                              styles.workerStatLabel,
                              { color: colors.textSecondary },
                            ]}
                          >
                            total
                          </Text>
                        </View>
                      </View>
                    </View>
                  )}
                />
              </View>
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* Reject reason modal */}
      <Modal
        visible={!!rejectModal?.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setRejectModal(null)}
      >
        <View
          style={[
            styles.rejectModalOverlay,
            {
              backgroundColor: colors.modalOverlay,
            },
          ]}
        >
          <View
            style={[
              styles.rejectModalContent,
              {
                backgroundColor: colors.bgSecondary,
                borderColor: colors.border,
              },
            ]}
          >
            <Text
              style={[styles.rejectModalTitle, { color: colors.textPrimary }]}
            >
              Reject Timesheet
            </Text>
            <Text
              style={[styles.rejectModalDesc, { color: colors.textSecondary }]}
            >
              Enter a reason (this will be visible to the foreman).
            </Text>

            <View style={{ height: 10 }} />

            <TextInput
              value={rejectReasonInput}
              onChangeText={setRejectReasonInput}
              placeholder="Reason…"
              placeholderTextColor={colors.textSecondary}
              style={[
                styles.rejectInput,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.bg,
                  color: colors.textPrimary,
                },
              ]}
              multiline
            />

            <View style={{ height: 12 }} />

            <View style={styles.rejectModalActions}>
              <Pressable
                onPress={() => setRejectModal(null)}
                style={[
                  styles.rejectCancelBtn,
                  {
                    backgroundColor: "rgba(148,163,184,0.2)",
                  },
                ]}
              >
                <Text
                  style={{
                    color: colors.textTertiary,
                    fontWeight: "800",
                  }}
                >
                  Cancel
                </Text>
              </Pressable>

              <Pressable
                onPress={async () => {
                  if (!rejectReasonInput.trim()) {
                    Alert.alert(
                      "Reason required",
                      "Please enter a rejection reason.",
                    );
                    return;
                  }
                  setRejectModal(null);
                  try {
                    setActionBusy("reject");
                    if (!detail?.id) return;
                    await apiSupervisorRejectTimesheet(
                      detail.id,
                      rejectReasonInput.trim(),
                      selectedSiteId,
                    );
                    Alert.alert("Rejected", "Timesheet rejected.");
                    await openDetail(detail.id, selectedSiteId);
                    await load();
                  } catch (e: any) {
                    Alert.alert("Reject failed", e?.message ?? "Unknown error");
                  } finally {
                    setActionBusy(null);
                  }
                }}
                style={[
                  styles.rejectSubmitBtn,
                  {
                    backgroundColor: colors.error,
                  },
                ]}
              >
                <Text
                  style={{
                    color: colors.textPrimary,
                    fontWeight: "900",
                  }}
                >
                  Reject
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </AuthStyleBackground>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 0,
  },

  topCard: {
    padding: 14,
    marginBottom: 12,
  },

  middleCard: {
    padding: 14,
    marginBottom: 12,
  },

  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  h1: {
    fontSize: 20,
    fontWeight: "900",
  },

  searchInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  filterRow: {
    flexDirection: "row",
    gap: 8,
    paddingRight: 4,
  },

  filterPill: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },

  filterPillText: {
    fontWeight: "600",
    fontSize: 12,
  },

  emptyText: {
    fontWeight: "600",
    textAlign: "center",
    paddingVertical: 20,
  },

  timesheetItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    alignItems: "flex-start",
  },

  itemContent: {
    flex: 1,
  },

  itemForemanName: {
    fontWeight: "700",
    fontSize: 14,
  },

  itemDate: {
    marginTop: 2,
    fontSize: 12,
  },

  itemSite: {
    marginTop: 6,
    fontSize: 12,
  },

  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
  },

  statusBadgeText: {
    fontWeight: "800",
    fontSize: 11,
  },

  errorBox: {
    marginTop: 8,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  errorText: {
    flex: 1,
    fontWeight: "900",
    fontSize: 12,
  },

  retryPill: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },

  retryTxt: {
    fontWeight: "900",
    fontSize: 12,
  },

  modalContainer: {
    flex: 1,
  },

  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },

  modalHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
  },

  modalCloseBtn: {
    padding: 8,
    borderRadius: 20,
  },

  detailLoadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  detailContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },

  detailHeroCard: {
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 16,
  },

  detailHeroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },

  detailForemanName: {
    fontWeight: "800",
    fontSize: 18,
    marginBottom: 8,
  },

  detailDateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },

  detailDate: {
    fontSize: 13,
    fontWeight: "500",
  },

  detailSiteRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: 4,
  },

  detailSite: {
    fontSize: 13,
    flex: 1,
  },

  statusBadgeLarge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },

  statusBadgeLargeText: {
    fontWeight: "800",
    fontSize: 12,
    letterSpacing: 0.5,
  },

  detailSubmittedRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(148,163,184,0.2)",
  },

  statsGrid: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },

  statCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
  },

  statValue: {
    fontSize: 20,
    fontWeight: "800",
  },

  statLabel: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
  },

  actionsSection: {
    marginTop: 20,
  },

  actionsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },

  actionButtonPrimary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
  },

  actionButtonSecondary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
  },

  actionButtonText: {
    color: "white",
    fontWeight: "700",
    fontSize: 15,
  },

  workersSection: {
    marginTop: 24,
  },

  workersSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },

  workersSectionTitle: {
    fontSize: 16,
    fontWeight: "800",
  },

  workerCountBadge: {
    marginLeft: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },

  workerCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },

  workerCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },

  workerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  workerName: {
    fontWeight: "700",
    fontSize: 15,
  },

  workerStats: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },

  workerStatItem: {
    alignItems: "center",
    flex: 1,
  },

  workerStatValue: {
    fontWeight: "700",
    fontSize: 14,
  },

  workerStatLabel: {
    fontSize: 11,
    marginTop: 2,
  },

  workerStatDivider: {
    width: 1,
    height: 24,
  },

  rejectModalOverlay: {
    flex: 1,
    justifyContent: "center",
    padding: 16,
  },

  rejectModalContent: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
  },

  rejectModalTitle: {
    fontWeight: "900",
    fontSize: 16,
  },

  rejectModalDesc: {
    marginTop: 6,
    fontSize: 13,
  },

  rejectInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  rejectModalActions: {
    flexDirection: "row",
    gap: 10,
  },

  rejectCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },

  rejectSubmitBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
});
