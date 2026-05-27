"use client";

import { useRouter } from "expo-router";
import {
  BarChart3,
  Building2,
  Camera,
  ChevronRight,
  ClipboardList,
  DollarSign,
  QrCode,
  ArrowLeftRight,
  Shield,
  UserCheck,
  UserCog,
  Users,
  Zap,
} from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import { GlassCard } from "@/components/GlassCard";
import LoadingOverlay from "@/components/LoadingOverlay";
import {
  apiAdminDashboardMetricsCached,
  apiAdminTopSiteWages,
  apiAdminWageComparison,
  apiAdminWeeklyAttendanceCached,
  type TopSiteWageDto,
  type WageComparisonPeriod,
} from "@/lib/apiClient";
import { getCurrentFortnight, type Fortnight } from "@/lib/fortnight";
import { useTheme } from "@/lib/themeContext";

type FortnightColumn = {
  iso: string;
  day: string;
  date: string;
};

function addDaysUTC(isoStart: string, days: number) {
  const d = new Date(`${isoStart}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function weekdayShortUTC(iso: string) {
  const d = new Date(`${iso}T00:00:00.000Z`);
  return d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}

function build14Columns(startISO: string): FortnightColumn[] {
  return Array.from({ length: 14 }).map((_, i) => {
    const iso = addDaysUTC(startISO, i);
    return {
      iso,
      day: weekdayShortUTC(iso),
      date: iso.split("-")[2].replace(/^0/, ""),
    };
  });
}

type DashboardStats = {
  employees: number;
  sites: number;
  foremen: number;
  supervisors: number | null;
};

export default function AdminHomeScreen() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fortnight, setFortnight] = useState<Fortnight | null>(null);
  const [scansPerDay, setScansPerDay] = useState<number[]>([]);

  const [stats, setStats] = useState<DashboardStats>({
    employees: 0,
    sites: 0,
    foremen: 0,
    supervisors: null,
  });

  const [topSiteWages, setTopSiteWages] = useState<TopSiteWageDto[]>([]);

  const [wageComparison, setWageComparison] = useState<{
    fortnight: WageComparisonPeriod;
    month: WageComparisonPeriod;
  } | null>(null);

  const load = useCallback(async () => {
    setError(null);

    if (!refreshing) setLoading(true);

    try {
      const fn = getCurrentFortnight();
      setFortnight(fn);
      const period = `${fn.startISO}_${fn.endISO}`;

      const [metricsRes, weeklyRes, wagesRes, wageCompRes] = await Promise.all([
        apiAdminDashboardMetricsCached(refreshing).catch(() => null),
        apiAdminWeeklyAttendanceCached(period, refreshing).catch(() => null),
        apiAdminTopSiteWages().catch((e) => {
          console.warn("Top site wages fetch failed:", e);
          return null;
        }),
        apiAdminWageComparison().catch((e) => {
          console.warn("Wage comparison fetch failed:", e);
          return null;
        }),
      ]);

      if (metricsRes) {
        setStats({
          employees: metricsRes.totalEmployees ?? 0,
          sites: metricsRes.activeSites ?? 0,
          foremen: metricsRes.totalForemen ?? 0,
          supervisors: metricsRes.totalSupervisors ?? null,
        });
      } else {
        setStats({
          employees: 0,
          sites: 0,
          foremen: 0,
          supervisors: null,
        });
      }

      if (weeklyRes && Array.isArray(weeklyRes)) {
        setScansPerDay(
          weeklyRes.map((p) => (typeof p.scans === "number" ? p.scans : 0)),
        );
      } else {
        setScansPerDay([]);
      }

      if (wagesRes?.topSites && wagesRes.topSites.length > 0) {
        setTopSiteWages(wagesRes.topSites);
      } else {
        console.warn("Top site wages empty:", JSON.stringify(wagesRes));
        setTopSiteWages([]);
      }

      if (wageCompRes) {
        setWageComparison(wageCompRes);
      } else {
        setWageComparison(null);
      }
    } catch (e: any) {
      console.error("Failed to load admin dashboard:", e);
      setError(e?.message ?? "Failed to load admin dashboard.");
    } finally {
      setLoading(false);
    }
  }, [refreshing]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const textMain = isDark ? "#f0f4f8" : "#0f1419";
  const textSub = isDark ? "#a0aec0" : "#64748b";

  if (loading && !refreshing) {
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
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header Card with gradient */}
        <GlassCard
          style={[
            styles.headerCard,
            {
              backgroundColor: isDark
                ? "rgba(15,23,42,0.85)"
                : "rgba(255,255,255,0.9)",
            },
          ]}
        >
          <View style={styles.headerContent}>
            <View style={styles.titleSection}>
              <Text style={[styles.h1, { color: textMain }]}>
                Admin Dashboard
              </Text>
              <Text style={[styles.sub, { color: textSub }]}>
                Real-time workforce overview
              </Text>
            </View>
            <View style={styles.iconBadge}>
              <Zap size={24} color="#fbbf24" strokeWidth={2.5} />
            </View>
          </View>

          {error ? (
            <Text style={[styles.errorText, { color: "#ff6b6b" }]}>
              {error}
            </Text>
          ) : null}
        </GlassCard>

        {/* Stats Grid with Gradient Cards */}
        <View style={styles.grid}>
          <StatCard
            title="Active Employees"
            value={stats.employees}
            icon={Users}
            gradient={["#3b82f6", "#1e40af"]}
            isDark={isDark}
          />
          <StatCard
            title="Active Sites"
            value={stats.sites}
            icon={Building2}
            gradient={["#10b981", "#047857"]}
            isDark={isDark}
          />
          <StatCard
            title="Foremen"
            value={stats.foremen}
            icon={UserCheck}
            gradient={["#f59e0b", "#d97706"]}
            isDark={isDark}
          />
          <StatCard
            title="Supervisors"
            value={stats.supervisors ?? "—"}
            icon={Shield}
            gradient={["#8b5cf6", "#6d28d9"]}
            isDark={isDark}
          />
        </View>

        {/* Quick Actions */}
        <GlassCard
          style={[
            styles.chartCard,
            {
              backgroundColor: isDark
                ? "rgba(15,23,42,0.85)"
                : "rgba(255,255,255,0.9)",
            },
          ]}
        >
          <View style={styles.sectionHeader}>
            <View>
              <Text style={[styles.sectionTitle, { color: textMain }]}>
                Quick Actions
              </Text>
              <Text style={[styles.sub, { color: textSub }]}>
                Manage key areas
              </Text>
            </View>
            <Zap size={20} color="#f59e0b" strokeWidth={2} />
          </View>

          <View style={styles.quickActions}>
            <Pressable
              style={({ pressed }) => [
                styles.quickActionBtn,
                {
                  backgroundColor: pressed
                    ? isDark
                      ? "rgba(59,130,246,0.25)"
                      : "rgba(59,130,246,0.12)"
                    : isDark
                      ? "rgba(59,130,246,0.15)"
                      : "rgba(59,130,246,0.08)",
                },
              ]}
              onPress={() =>
                router.push("/(admin-stack)/photo-verifications" as any)
              }
            >
              <View
                style={[
                  styles.quickActionIcon,
                  { backgroundColor: "rgba(59,130,246,0.2)" },
                ]}
              >
                <Camera size={20} color="#3b82f6" strokeWidth={2.2} />
              </View>
              <View style={styles.quickActionText}>
                <Text style={[styles.quickActionTitle, { color: textMain }]}>
                  Scan Outs
                </Text>
                <Text style={[styles.quickActionSub, { color: textSub }]}>
                  Review site photos
                </Text>
              </View>
              <ChevronRight size={18} color={textSub} />
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.quickActionBtn,
                {
                  backgroundColor: pressed
                    ? isDark
                      ? "rgba(16,185,129,0.25)"
                      : "rgba(16,185,129,0.12)"
                    : isDark
                      ? "rgba(16,185,129,0.15)"
                      : "rgba(16,185,129,0.08)",
                },
              ]}
              onPress={() =>
                router.push("/(admin-stack)/attendance-scans" as any)
              }
            >
              <View
                style={[
                  styles.quickActionIcon,
                  { backgroundColor: "rgba(16,185,129,0.2)" },
                ]}
              >
                <QrCode size={20} color="#10b981" strokeWidth={2.2} />
              </View>
              <View style={styles.quickActionText}>
                <Text style={[styles.quickActionTitle, { color: textMain }]}>
                  Attendance Scans
                </Text>
                <Text style={[styles.quickActionSub, { color: textSub }]}>
                  View scan activity
                </Text>
              </View>
              <ChevronRight size={18} color={textSub} />
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.quickActionBtn,
                {
                  backgroundColor: pressed
                    ? isDark
                      ? "rgba(139,92,246,0.25)"
                      : "rgba(139,92,246,0.12)"
                    : isDark
                      ? "rgba(139,92,246,0.15)"
                      : "rgba(139,92,246,0.08)",
                },
              ]}
              onPress={() => router.push("/(admin-stack)/users" as any)}
            >
              <View
                style={[
                  styles.quickActionIcon,
                  { backgroundColor: "rgba(139,92,246,0.2)" },
                ]}
              >
                <UserCog size={20} color="#8b5cf6" strokeWidth={2.2} />
              </View>
              <View style={styles.quickActionText}>
                <Text style={[styles.quickActionTitle, { color: textMain }]}>
                  User Management
                </Text>
                <Text style={[styles.quickActionSub, { color: textSub }]}>
                  Manage app users
                </Text>
              </View>
              <ChevronRight size={18} color={textSub} />
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.quickActionBtn,
                {
                  backgroundColor: pressed
                    ? isDark
                      ? "rgba(236,72,153,0.25)"
                      : "rgba(236,72,153,0.12)"
                    : isDark
                      ? "rgba(236,72,153,0.15)"
                      : "rgba(236,72,153,0.08)",
                },
              ]}
              onPress={() =>
                router.push("/(supervisor-stack)/transfer-employee" as any)
              }
            >
              <View
                style={[
                  styles.quickActionIcon,
                  { backgroundColor: "rgba(236,72,153,0.2)" },
                ]}
              >
                <ArrowLeftRight size={20} color="#ec4899" strokeWidth={2.2} />
              </View>
              <View style={styles.quickActionText}>
                <Text style={[styles.quickActionTitle, { color: textMain }]}>
                  Transfer Employee
                </Text>
                <Text style={[styles.quickActionSub, { color: textSub }]}>
                  Move between sites
                </Text>
              </View>
              <ChevronRight size={18} color={textSub} />
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.quickActionBtn,
                {
                  backgroundColor: pressed
                    ? isDark
                      ? "rgba(245,158,11,0.25)"
                      : "rgba(245,158,11,0.12)"
                    : isDark
                      ? "rgba(245,158,11,0.15)"
                      : "rgba(245,158,11,0.08)",
                },
              ]}
              onPress={() => router.push("/(admin-stack)/activity-logs" as any)}
            >
              <View
                style={[
                  styles.quickActionIcon,
                  { backgroundColor: "rgba(245,158,11,0.2)" },
                ]}
              >
                <ClipboardList size={20} color="#f59e0b" strokeWidth={2.2} />
              </View>
              <View style={styles.quickActionText}>
                <Text style={[styles.quickActionTitle, { color: textMain }]}>
                  Activity Logs
                </Text>
                <Text style={[styles.quickActionSub, { color: textSub }]}>
                  View audit events
                </Text>
              </View>
              <ChevronRight size={18} color={textSub} />
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.quickActionBtn,
                {
                  backgroundColor: pressed
                    ? isDark ? "rgba(16,185,129,0.25)" : "rgba(16,185,129,0.12)"
                    : isDark ? "rgba(16,185,129,0.15)" : "rgba(16,185,129,0.08)",
                },
              ]}
              onPress={() => router.push("/(admin-stack)/materials" as any)}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: "rgba(16,185,129,0.2)" }]}>
                <DollarSign size={20} color="#10b981" strokeWidth={2.2} />
              </View>
              <View style={styles.quickActionText}>
                <Text style={[styles.quickActionTitle, { color: textMain }]}>Materials</Text>
                <Text style={[styles.quickActionSub, { color: textSub }]}>Orders &amp; procurement</Text>
              </View>
              <ChevronRight size={18} color={textSub} />
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.quickActionBtn,
                {
                  backgroundColor: pressed
                    ? isDark ? "rgba(99,102,241,0.25)" : "rgba(99,102,241,0.12)"
                    : isDark ? "rgba(99,102,241,0.15)" : "rgba(99,102,241,0.08)",
                },
              ]}
              onPress={() => router.push("/(admin-stack)/plant" as any)}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: "rgba(99,102,241,0.2)" }]}>
                <Building2 size={20} color="#6366f1" strokeWidth={2.2} />
              </View>
              <View style={styles.quickActionText}>
                <Text style={[styles.quickActionTitle, { color: textMain }]}>Plant &amp; Equipment</Text>
                <Text style={[styles.quickActionSub, { color: textSub }]}>Active deployments</Text>
              </View>
              <ChevronRight size={18} color={textSub} />
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.quickActionBtn,
                {
                  backgroundColor: pressed
                    ? isDark ? "rgba(236,72,153,0.25)" : "rgba(236,72,153,0.12)"
                    : isDark ? "rgba(236,72,153,0.15)" : "rgba(236,72,153,0.08)",
                },
              ]}
              onPress={() => router.push("/(admin-stack)/suppliers" as any)}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: "rgba(236,72,153,0.2)" }]}>
                <Users size={20} color="#ec4899" strokeWidth={2.2} />
              </View>
              <View style={styles.quickActionText}>
                <Text style={[styles.quickActionTitle, { color: textMain }]}>Suppliers</Text>
                <Text style={[styles.quickActionSub, { color: textSub }]}>Manage suppliers</Text>
              </View>
              <ChevronRight size={18} color={textSub} />
            </Pressable>
          </View>
        </GlassCard>

        {/* Attendance Chart */}
        <GlassCard
          style={[
            styles.chartCard,
            {
              backgroundColor: isDark
                ? "rgba(15,23,42,0.85)"
                : "rgba(255,255,255,0.9)",
            },
          ]}
        >
          <View style={styles.sectionHeader}>
            <View>
              <Text style={[styles.sectionTitle, { color: textMain }]}>
                Fortnight Attendance
              </Text>
              <Text style={[styles.sub, { color: textSub }]}>
                14-day scan activity
              </Text>
            </View>
            <BarChart3 size={20} color="#3b82f6" strokeWidth={2} />
          </View>

          <MiniBars
            columns={fortnight ? build14Columns(fortnight.startISO) : []}
            scans={scansPerDay}
          />
        </GlassCard>

        {/* Top 5 Sites by Wages */}
        <GlassCard
          style={[
            styles.chartCard,
            {
              backgroundColor: isDark
                ? "rgba(15,23,42,0.85)"
                : "rgba(255,255,255,0.9)",
            },
          ]}
        >
          <View style={styles.sectionHeader}>
            <View>
              <Text style={[styles.sectionTitle, { color: textMain }]}>
                Top Sites by Wages
              </Text>
              <Text style={[styles.sub, { color: textSub }]}>
                Highest wages this fortnight
              </Text>
            </View>
            <DollarSign size={20} color="#10b981" strokeWidth={2} />
          </View>

          {topSiteWages.length > 0 ? (
            <TopSiteWagesChart sites={topSiteWages} isDark={isDark} />
          ) : (
            <Text
              style={[
                styles.sub,
                { color: textSub, textAlign: "center", paddingVertical: 16 },
              ]}
            >
              No wage data for this fortnight yet
            </Text>
          )}
        </GlassCard>

        {/* Wage Comparison Section */}
        <GlassCard
          style={[
            styles.chartCard,
            {
              backgroundColor: isDark
                ? "rgba(15,23,42,0.85)"
                : "rgba(255,255,255,0.9)",
            },
          ]}
        >
          <View style={styles.sectionHeader}>
            <View>
              <Text style={[styles.sectionTitle, { color: textMain }]}>
                Wage Overview
              </Text>
              <Text style={[styles.sub, { color: textSub }]}>
                Period-over-period comparison
              </Text>
            </View>
          </View>

          <View style={styles.wageCompareContainer}>
            <WageComparisonCard
              label="Fortnight"
              current={wageComparison?.fortnight.current ?? 0}
              previous={wageComparison?.fortnight.previous ?? 0}
              currentLabel={wageComparison?.fortnight.currentLabel ?? "Current"}
              previousLabel={
                wageComparison?.fortnight.previousLabel ?? "Previous"
              }
              color="#6366f1"
              isDark={isDark}
            />
            <WageComparisonCard
              label="Monthly"
              current={wageComparison?.month.current ?? 0}
              previous={wageComparison?.month.previous ?? 0}
              currentLabel={wageComparison?.month.currentLabel ?? "Current"}
              previousLabel={wageComparison?.month.previousLabel ?? "Previous"}
              color="#10b981"
              isDark={isDark}
            />
          </View>
        </GlassCard>
      </ScrollView>
    </AuthStyleBackground>
  );
}

function StatCard(props: {
  title: string;
  value: number | string;
  icon: any;
  gradient: [string, string];
  isDark: boolean;
}) {
  const Icon = props.icon;
  const accentColor = props.gradient[0];

  return (
    <GlassCard style={[styles.statCard, { overflow: "hidden" }]}>
      {/* Gradient background */}
      <View
        style={[
          styles.gradientBg,
          {
            backgroundColor: props.gradient[0],
            opacity: 0.08,
          },
        ]}
      />

      <View style={styles.statContent}>
        <View style={styles.iconContainer}>
          <Icon size={28} color={accentColor} strokeWidth={2.2} />
        </View>
        <View style={styles.statTextGroup}>
          <Text
            style={[
              styles.statTitle,
              { color: props.isDark ? "#a0aec0" : "#64748b" },
            ]}
          >
            {props.title}
          </Text>
          <Text
            style={[
              styles.statValue,
              { color: props.isDark ? "#f0f4f8" : "#0f1419" },
            ]}
          >
            {props.value}
          </Text>
        </View>
      </View>

      {/* Accent border */}
      <View
        style={[
          styles.accentBorder,
          { borderTopColor: accentColor, opacity: 0.3 },
        ]}
      />
    </GlassCard>
  );
}

function MiniBars(props: { columns: FortnightColumn[]; scans: number[] }) {
  const max = Math.max(1, ...props.scans);

  return (
    <View style={styles.barsWrap}>
      {props.columns.map((col, idx) => {
        const scans = props.scans[idx] ?? 0;
        const percentage = (scans / max) * 100;

        // Dynamic color based on intensity
        let barColor = "#3b82f6";
        let borderColor = "#1e40af";
        if (percentage > 70) {
          barColor = "#10b981";
          borderColor = "#047857";
        } else if (percentage > 40) {
          barColor = "#f59e0b";
          borderColor = "#d97706";
        }

        return (
          <View key={col.iso} style={styles.barCol}>
            <View
              style={[
                styles.bar,
                {
                  height: Math.round((scans / max) * 60),
                  backgroundColor: barColor,
                  borderColor: borderColor,
                },
              ]}
            >
              {scans > 0 && (
                <Text
                  style={[
                    styles.barValue,
                    {
                      color: "#fff",
                      transform: [{ rotate: "-90deg" }],
                    },
                  ]}
                >
                  {scans}
                </Text>
              )}
            </View>
            <Text style={[styles.barLabel, { color: "#64748b" }]}>
              {col.date}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const WAGE_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#8b5cf6", "#ec4899"];

function formatCurrency(val: number): string {
  if (val >= 1000) return `R${(val / 1000).toFixed(1)}k`;
  return `R${val.toFixed(0)}`;
}

function TopSiteWagesChart(props: {
  sites: { site: string; wages: number }[];
  isDark: boolean;
}) {
  const max = Math.max(1, ...props.sites.map((s) => s.wages));
  const textMain = props.isDark ? "#f0f4f8" : "#0f1419";
  const textSub = props.isDark ? "#a0aec0" : "#64748b";

  return (
    <View style={styles.wagesContainer}>
      {props.sites.map((item, idx) => {
        const pct = (item.wages / max) * 100;
        const color = WAGE_COLORS[idx % WAGE_COLORS.length];

        return (
          <View key={idx} style={styles.wageRow}>
            <View style={styles.wageLabel}>
              <View style={[styles.wageDot, { backgroundColor: color }]} />
              <Text
                style={[styles.wageSiteName, { color: textMain }]}
                numberOfLines={1}
              >
                {item.site}
              </Text>
            </View>
            <View style={styles.wageBarWrap}>
              <View
                style={[
                  styles.wageBar,
                  {
                    width: `${Math.max(pct, 4)}%`,
                    backgroundColor: color,
                  },
                ]}
              />
            </View>
            <Text style={[styles.wageAmount, { color: textSub }]}>
              {formatCurrency(item.wages)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function formatRand(n: number) {
  return (
    "R" +
    n.toLocaleString("en-ZA", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
  );
}

function WageComparisonCard(props: {
  label: string;
  current: number;
  previous: number;
  currentLabel: string;
  previousLabel: string;
  color: string;
  isDark: boolean;
}) {
  const { current, previous, isDark, color } = props;
  const diff = current - previous;
  const pctChange =
    previous > 0 ? (diff / previous) * 100 : current > 0 ? 100 : 0;
  const isUp = diff >= 0;
  const arrow = isUp ? "\u25b2" : "\u25bc";
  const changeColor = isUp ? "#10b981" : "#ef4444";

  return (
    <View style={styles.wageCompareCard}>
      {/* Header */}
      <Text style={[styles.wageCompareLabel, { color: color }]}>
        {props.label}
      </Text>

      {/* Big percentage */}
      <View style={styles.wageComparePctRow}>
        <Text style={[styles.wageComparePct, { color: changeColor }]}>
          {arrow} {Math.abs(Math.round(pctChange))}%
        </Text>
      </View>

      {/* Current amount */}
      <Text
        style={[
          styles.wageCompareAmount,
          { color: isDark ? "#f0f4f8" : "#0f1419" },
        ]}
      >
        {formatRand(current)}
      </Text>
      <Text style={[styles.wageCompareSub, { color: "#a0aec0" }]}>
        {props.currentLabel}
      </Text>

      {/* Divider */}
      <View
        style={[
          styles.wageCompareDivider,
          {
            backgroundColor: isDark
              ? "rgba(148,163,184,0.15)"
              : "rgba(15,23,42,0.08)",
          },
        ]}
      />

      {/* Previous amount */}
      <Text
        style={[
          styles.wageComparePrevAmount,
          { color: isDark ? "rgba(240,244,248,0.6)" : "rgba(15,20,25,0.5)" },
        ]}
      >
        {formatRand(previous)}
      </Text>
      <Text style={[styles.wageCompareSub, { color: "#a0aec0" }]}>
        {props.previousLabel}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    gap: 14,
  },

  headerCard: {
    padding: 16,
    gap: 8,
    borderRadius: 5,
  },

  headerContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },

  titleSection: {
    flex: 1,
    gap: 4,
  },

  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: 5,
    backgroundColor: "rgba(251,191,36,0.1)",
    justifyContent: "center",
    alignItems: "center",
  },

  h1: {
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: -0.5,
  },

  sub: {
    fontWeight: "600",
    fontSize: 13,
  },

  errorText: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: "600",
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
  },

  quickActions: {
    gap: 8,
  },

  quickActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    gap: 12,
  },

  quickActionIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },

  quickActionText: {
    flex: 1,
    gap: 2,
  },

  quickActionTitle: {
    fontSize: 14,
    fontWeight: "700",
  },

  quickActionSub: {
    fontSize: 12,
    fontWeight: "500",
  },

  statCard: {
    width: "48%",
    padding: 14,
    borderRadius: 5,
    overflow: "hidden",
    position: "relative",
  },

  gradientBg: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 5,
  },

  statContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    zIndex: 1,
  },

  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 5,
    backgroundColor: "rgba(0,0,0,0.05)",
    justifyContent: "center",
    alignItems: "center",
  },

  statTextGroup: {
    flex: 1,
  },

  statTitle: {
    fontWeight: "700",
    fontSize: 11,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },

  statValue: {
    fontWeight: "900",
    fontSize: 24,
    marginTop: 2,
  },

  accentBorder: {
    borderTopWidth: 2,
    marginTop: 10,
  },

  chartCard: {
    padding: 16,
    borderRadius: 5,
    gap: 12,
  },

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  sectionTitle: {
    fontWeight: "900",
    fontSize: 16,
    letterSpacing: -0.3,
  },

  barsWrap: {
    flexDirection: "row",
    gap: 4,
    alignItems: "flex-end",
    height: 80,
    paddingVertical: 8,
  },

  barCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
  },

  barValue: {
    fontSize: 10,
    fontWeight: "800",
  },

  bar: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
    borderWidth: 1.5,
  },

  barLabel: {
    fontSize: 10,
    fontWeight: "700",
  },

  /* Top Sites Wages Chart */
  wagesContainer: {
    gap: 10,
    paddingVertical: 4,
  },

  wageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  wageLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    width: 100,
  },

  wageDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  wageSiteName: {
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },

  wageBarWrap: {
    flex: 1,
    height: 22,
    borderRadius: 6,
    backgroundColor: "rgba(148,163,184,0.1)",
    overflow: "hidden",
    justifyContent: "center",
  },

  wageBar: {
    height: "100%",
    borderRadius: 6,
    opacity: 0.85,
  },

  wageAmount: {
    fontSize: 12,
    fontWeight: "700",
    width: 55,
    textAlign: "right",
  },

  wageCompareContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    gap: 12,
    paddingVertical: 8,
  },

  wageCompareCard: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    gap: 2,
  },

  wageCompareLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },

  wageComparePctRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },

  wageComparePct: {
    fontSize: 26,
    fontWeight: "900",
  },

  wageCompareAmount: {
    fontSize: 18,
    fontWeight: "800",
  },

  wageCompareSub: {
    fontSize: 10,
    fontWeight: "600",
    marginTop: 1,
  },

  wageCompareDivider: {
    width: "60%",
    height: 1,
    marginVertical: 8,
  },

  wageComparePrevAmount: {
    fontSize: 15,
    fontWeight: "700",
  },
});
