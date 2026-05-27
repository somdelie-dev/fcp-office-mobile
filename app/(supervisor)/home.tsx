import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import { GlassCard } from "@/components/GlassCard";
import LoadingOverlay from "@/components/LoadingOverlay";
import { Ionicons } from "@expo/vector-icons";
import DownloadTimesheetsModal from "@/components/DownloadTimesheetsModal";

import {
  apiMeCached,
  apiSupervisorTimesheetsCached,
  type TimesheetListRowDto,
} from "../../lib/apiClient";
import { useAuth } from "../../lib/auth";
import { useDataCache } from "../../lib/dataCache";
import { useTheme } from "../../lib/themeContext";

// Theme colors
const themes = {
  // ... (existing theme definitions)
  dark: {
    bg: "#0b1220",
    bgSecondary: "#0f172a",
    border: "#1f2a44",
    textPrimary: "white",
    textSecondary: "#94a3b8",
    textTertiary: "#cbd5e1",
    accent: "#38bdf8",
    accentOverlay: "rgba(56,189,248,0.9)",
    accentLight: "rgba(56,189,248,0.18)",
    accentBorder: "rgba(56,189,248,0.45)",
    success: "#16a34a",
    error: "#dc2626",
    warning: "#f59e0b",
    cardBg: "rgba(15,23,42,0.8)",
    cardBgHover: "rgba(15,23,42,0.9)",
    navyLight: "rgba(56,189,248,0.15)",
  },
  light: {
    bg: "#f8fafc",
    bgSecondary: "#ffffff",
    border: "#e2e8f0",
    textPrimary: "#0f172a",
    textSecondary: "#64748b",
    textTertiary: "#475569",
    accent: "#0ea5e9",
    accentOverlay: "rgba(14,165,233,0.9)",
    accentLight: "rgba(14,165,233,0.08)",
    accentBorder: "rgba(14,165,233,0.3)",
    success: "#22c55e",
    error: "#ef4444",
    warning: "#fbbf24",
    cardBg: "rgba(255,255,255,0.65)",
    cardBgHover: "rgba(255,255,255,0.75)",
    navyLight: "rgba(38,45,104,0.08)",
  },
};

function todayLabel() {
  const d = new Date();
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function safeName(name?: string | null) {
  const n = (name ?? "").trim();
  return n.length ? n : "Supervisor";
}

// Data structure for supervisor dashboard stats
type OverviewData = {
  submittedCount: number;
  acceptedCount: number;
  approvedCount: number;
  paidCount: number;
  flaggedItems: number;
};

type QuickStat = {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress?: () => void;
};

export default function SupervisorHome() {
  const router = useRouter();
  const { theme } = useTheme();
  const colors = themes[theme];
  const { user, setUser } = useAuth() as unknown as {
    user: any;
    setUser?: (u: any) => void;
  };
  const { supervisorOverview, setSupervisorOverview, isFresh } = useDataCache();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  // Supervisor stats: counts of timesheets by approval status
  const [overview, setOverview] = useState<OverviewData>(
    supervisorOverview?.data || {
      submittedCount: 0,
      acceptedCount: 0,
      approvedCount: 0,
      paidCount: 0,
      flaggedItems: 0,
    },
  );

  const loadData = useCallback(
    async (forceRefresh = false) => {
      // Check if we have fresh cached data
      if (
        !forceRefresh &&
        supervisorOverview &&
        isFresh(supervisorOverview.timestamp)
      ) {
        setOverview(supervisorOverview.data);
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Fetch current user info (cache-first)
        const me = await apiMeCached(forceRefresh);
        setUser?.(me.user);

        // Fetch all timesheets to count by status (cache-first)
        const res: any = await apiSupervisorTimesheetsCached(
          {
            status: "ALL",
          },
          forceRefresh,
        );
        const timesheets = (res?.timesheets ?? []) as TimesheetListRowDto[];

        const submitted = timesheets.filter(
          (t) => t.status === "SUBMITTED",
        ).length;
        const accepted = timesheets.filter(
          (t) => t.status === "ACCEPTED",
        ).length;
        const approved = timesheets.filter(
          (t) => t.status === "APPROVED",
        ).length;
        const paid = timesheets.filter((t) => t.status === "PAID").length;

        const newOverview = {
          submittedCount: submitted,
          acceptedCount: accepted,
          approvedCount: approved,
          paidCount: paid,
          flaggedItems: submitted > 0 ? 1 : 0,
        };

        setOverview(newOverview);
        setSupervisorOverview(newOverview);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load timesheets.");
        setOverview({
          submittedCount: 0,
          acceptedCount: 0,
          approvedCount: 0,
          paidCount: 0,
          flaggedItems: 0,
        });
      } finally {
        setLoading(false);
      }
    },
    [supervisorOverview, isFresh, setUser, setSupervisorOverview],
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const quickStats: QuickStat[] = useMemo(
    () => [
      {
        label: "Pending Review",
        value: String(overview.submittedCount),
        icon: "document-text",
        color: "#DC2626", // Red for action needed
        onPress: () =>
          router.push({
            pathname: "/(supervisor)/timesheets",
            params: { status: "SUBMITTED" },
          }),
      },
      {
        label: "Accepted Today",
        value: String(overview.acceptedCount),
        icon: "thumbs-up",
        color: "#0891B2", // Cyan for accepted
        onPress: () =>
          router.push({
            pathname: "/(supervisor)/timesheets",
            params: { status: "ACCEPTED" },
          }),
      },
      {
        label: "Approved",
        value: String(overview.approvedCount),
        icon: "checkmark-circle",
        color: "#16A34A", // Green for approved
        onPress: () =>
          router.push({
            pathname: "/(supervisor)/timesheets",
            params: { status: "APPROVED" },
          }),
      },
      {
        label: "Paid Out",
        value: String(overview.paidCount),
        icon: "cash",
        color: "#2563EB", // Blue for completed
        onPress: () =>
          router.push({
            pathname: "/(supervisor)/timesheets",
            params: { status: "PAID" },
          }),
      },
    ],
    [overview, router],
  );

  if (loading) {
    return (
      <AuthStyleBackground>
        <LoadingOverlay
          icon="⏳"
          title="Loading dashboard…"
          message="Please wait while we fetch your data"
        />
      </AuthStyleBackground>
    );
  }

  return (
    <AuthStyleBackground>
      <ScrollView style={styles.wrap} showsVerticalScrollIndicator={false}>
        <GlassCard style={styles.topCard}>
          <Text style={[styles.h1, { color: colors.textPrimary }]}>
            Welcome back, {safeName(user?.name)}
          </Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]}>
            {todayLabel()}
          </Text>

          {overview.flaggedItems > 0 && (
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.badge,
                  styles.badgeWarn,
                  {
                    backgroundColor: colors.warning + "22",
                    borderColor: colors.warning + "44",
                  },
                ]}
              >
                <Ionicons
                  name="alert-circle"
                  size={14}
                  color={colors.warning}
                />
                <Text style={[styles.badgeTxt, { color: colors.warning }]}>
                  {overview.submittedCount} timesheet
                  {overview.submittedCount === 1 ? "" : "s"} pending your review
                </Text>
              </View>
            </View>
          )}
        </GlassCard>
        <GlassCard style={styles.bottomCard}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            Quick Actions
          </Text>

          <View style={styles.actionsList}>
            <ActionButton
              icon="document-text"
              label="Review All Timesheets"
              badge={
                overview.submittedCount > 0
                  ? overview.submittedCount
                  : undefined
              }
              onPress={() => router.push("/(supervisor)/timesheets")}
              theme={colors}
            />
            <ActionButton
              icon="download"
              label="Download Timesheets"
              onPress={() => setDownloadModalOpen(true)}
              theme={colors}
            />
            {/* quick action for scan */}
            <ActionButton
              icon="qr-code"
              label="Scan Guys"
              onPress={() => router.push("/(supervisor-stack)/scan")}
              theme={colors}
            />
            <ActionButton
              icon="swap-horizontal"
              label="Adjust Attendance"
              onPress={() => router.push("/(supervisor-stack)/transfer-employee")}
              theme={colors}
            />
            {/* <ActionButton
              icon="people"
              label="Manage Foremen"
              onPress={() => router.push("/(supervisor-stack)/foremen")}
              theme={colors}
            /> */}
            <ActionButton
              icon="images"
              label="Photo Verification"
              onPress={() => router.push("/(supervisor-stack)/photos")}
              theme={colors}
            />

            <ActionButton
              icon="person"
              label="Manage Your Guys"
              onPress={() => router.push("/(supervisor-stack)/employees")}
              theme={colors}
            />
            <ActionButton
              icon="stats-chart"
              label="Reports & Analytics"
              onPress={() => router.push("/(supervisor-stack)/reports")}
              theme={colors}
            />
          </View>
        </GlassCard>
        <GlassCard style={styles.middleCard}>
          <View style={styles.cardHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              Overview
            </Text>
            <Pressable onPress={() => loadData(true)}>
              <Ionicons name="refresh" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          {error ? (
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
                onPress={() => loadData(true)}
              >
                <Text style={[styles.retryTxt, { color: colors.textPrimary }]}>
                  Retry
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.statsGrid}>
              {quickStats.map((stat, idx) => (
                <QuickStatCard key={idx} {...stat} theme={colors} />
              ))}
            </View>
          )}
        </GlassCard>

        <Text style={[styles.footerHint, { color: colors.textSecondary }]}>
          Review and approve timesheets promptly to maintain payroll schedules.
        </Text>
        <View style={{ height: 20 }} />
      </ScrollView>

      <DownloadTimesheetsModal
        visible={downloadModalOpen}
        onClose={() => setDownloadModalOpen(false)}
      />
    </AuthStyleBackground>
  );
}

function QuickStatCard({
  label,
  value,
  icon,
  color,
  onPress,
  theme,
}: QuickStat & { theme: typeof themes.dark }) {
  const content = (
    <View
      style={[
        styles.statCard,
        onPress && styles.statCardClickable,
        { backgroundColor: theme.cardBg, borderColor: theme.border },
      ]}
    >
      <View style={[styles.statIconCircle, { backgroundColor: color + "20" }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={[styles.statValue, { color: theme.textPrimary }]}>
        {value}
      </Text>
      <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
        {label}
      </Text>
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={styles.statItem}>
        {content}
      </Pressable>
    );
  }

  return <View style={styles.statItem}>{content}</View>;
}

function ActionButton({
  icon,
  label,
  badge,
  onPress,
  theme,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  badge?: number;
  onPress?: () => void;
  theme: typeof themes.dark;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.actionBtn,
        { backgroundColor: theme.cardBg, borderColor: theme.border },
        pressed && { backgroundColor: theme.cardBgHover },
      ]}
      onPress={onPress}
    >
      <View style={styles.actionBtnLeft}>
        <View
          style={[
            styles.actionIconCircle,
            { backgroundColor: theme.navyLight },
          ]}
        >
          <Ionicons name={icon} size={20} color={theme.accent} />
        </View>
        <Text style={[styles.actionLabel, { color: theme.textPrimary }]}>
          {label}
        </Text>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {badge !== undefined && badge > 0 && (
          <View style={[styles.actionBadge, { backgroundColor: theme.error }]}>
            <Text style={styles.actionBadgeTxt}>{badge}</Text>
          </View>
        )}
        <Ionicons
          name="chevron-forward"
          size={20}
          color={theme.textSecondary}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 16, paddingTop: 0 },

  topCard: {
    padding: 14,
    marginBottom: 12,
  },

  middleCard: {
    padding: 14,
    marginBottom: 12,
  },

  bottomCard: {
    padding: 14,
    marginBottom: 12,
  },

  h1: { fontSize: 20, fontWeight: "900" },
  sub: { marginTop: 6, fontWeight: "800" },

  statusRow: { flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  badgeTxt: { fontWeight: "900", fontSize: 12 },
  badgeWarn: {},

  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: { fontWeight: "900", fontSize: 14 },

  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 4,
  },

  statItem: {
    width: "48%",
  },

  statCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    gap: 8,
  },
  statCardClickable: {},
  statIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: { fontSize: 24, fontWeight: "900" },
  statLabel: {
    fontWeight: "800",
    fontSize: 12,
    textAlign: "center",
  },

  actionsList: {
    marginTop: 12,
    gap: 8,
  },

  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 5,
    borderWidth: 1,
  },
  actionBtnLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  actionIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: "900",
    flex: 1,
  },
  actionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    minWidth: 24,
    alignItems: "center",
  },
  actionBadgeTxt: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
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
  errorText: { flex: 1, fontWeight: "900", fontSize: 12 },
  retryPill: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  retryTxt: { fontWeight: "900", fontSize: 12 },

  footerHint: {
    fontWeight: "800",
    fontSize: 12,
    textAlign: "center",
    marginTop: 20,
    paddingBottom: 6,
  },
});
