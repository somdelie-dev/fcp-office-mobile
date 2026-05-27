import { useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import { ForemanTutorial } from "@/components/ForemanTutorial";
import { GlassCard } from "@/components/GlassCard";
import { useTheme } from "@/lib/themeContext";
import { Ionicons } from "@expo/vector-icons";

import {
  apiForemanDayCached,
  apiForemanDaysCached,
  apiMeCached,
  apiSitesCached,
  OfflineError,
  type Site,
} from "../../lib/apiClient";
import { useAuth } from "../../lib/auth";
import { getSelectedSiteId, setSelectedSiteId } from "../../lib/sitePrefs";

const themes = {
  dark: {
    bg: "#0b1220",
    bgSecondary: "#0f172a",
    border: "#1f2a44",
    textPrimary: "white",
    textSecondary: "#94a3b8",
    accent: "#38bdf8",
    accentLight: "rgba(56,189,248,0.18)",
    success: "#16a34a",
    successLight: "rgba(22,163,74,0.12)",
    error: "#dc2626",
    errorLight: "rgba(220,38,38,0.10)",
    warning: "#f59e0b",
    warningLight: "rgba(245,158,11,0.14)",
    info: "#38bdf8",
    infoLight: "rgba(56,189,248,0.14)",
  },
  light: {
    bg: "#f8fafc",
    bgSecondary: "#ffffff",
    border: "#e2e8f0",
    textPrimary: "#0f172a",
    textSecondary: "#64748b",
    accent: "#0ea5e9",
    accentLight: "rgba(14,165,233,0.08)",
    success: "#22c55e",
    successLight: "rgba(34,197,94,0.12)",
    error: "#ef4444",
    errorLight: "rgba(239,68,68,0.10)",
    warning: "#f59e0b",
    warningLight: "rgba(245,158,11,0.14)",
    info: "#262D68",
    infoLight: "rgba(38,45,104,0.14)",
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
  return n.length ? n : "Foreman";
}

type DayStatus = "PENDING" | "SUBMITTED" | "APPROVED" | "REJECTED";

const STATUS_PENDING: DayStatus = "PENDING";

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getTimeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Morning";
  if (hour < 18) return "Afternoon";
  return "Evening";
}

export default function ForemanHome() {
  const router = useRouter();
  const { theme } = useTheme();
  const colors = themes[theme];

  const { user, updateUser } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState<string | null>(null);

  const [siteName, setSiteName] = useState<string>("");
  const [scannedCount, setScannedCount] = useState<number>(0);
  const [dayStatus, setDayStatus] = useState<DayStatus>("PENDING");
  const [flags, setFlags] = useState<number>(0);
  const [hasPhotoRequest, setHasPhotoRequest] = useState(false);

  const selectedSite = useMemo(
    () => sites.find((s) => s.id === siteId) ?? null,
    [sites, siteId],
  );

  const statusLabel = useMemo(() => {
    if (dayStatus === "APPROVED") return "Approved";
    if (dayStatus === "REJECTED") return "Rejected";
    if (dayStatus === "SUBMITTED") return "Submitted";
    return "Pending";
  }, [dayStatus]);

  const applyDay = useCallback(
    (payload: {
      siteName?: string | null;
      scannedCount?: number | null;
      status?: string | null;
      flags?: number | null;
      fallbackSiteId?: string;
    }) => {
      const sName =
        (payload.siteName ?? "").trim() ||
        (payload.fallbackSiteId
          ? (sites.find((x) => x.id === payload.fallbackSiteId)?.name ?? "")
          : "");

      setSiteName(sName);
      setScannedCount(Number(payload.scannedCount ?? 0) || 0);
      setDayStatus(
        ((payload.status as DayStatus | undefined) ?? "PENDING") as DayStatus,
      );
      setFlags(Number(payload.flags ?? 0) || 0);
    },
    [sites],
  );

  const resetDayNumbers = useCallback(() => {
    setScannedCount(0);
    setDayStatus("PENDING");
    setFlags(0);
  }, []);

  // Prevent out-of-order responses
  const requestSeq = useRef(0);

  const refreshTodayForSite = useCallback(
    async (id: string, forceRefresh = false) => {
      const seq = ++requestSeq.current;
      setError(null);

      try {
        const res = await apiForemanDaysCached(forceRefresh);
        if (seq !== requestSeq.current) return;

        const rawList =
          (Array.isArray((res as any)?.days) && (res as any).days) ||
          (Array.isArray(res as any) && (res as any)) ||
          (Array.isArray((res as any)?.data) && (res as any).data) ||
          [];

        const today = todayISO();

        let match: any = null;
        for (const d of rawList as any[]) {
          const siteIdRaw = String(d?.site?.id ?? d?.siteId ?? "");
          const dateISO = String(d?.dateISO ?? d?.workDateISO ?? d?.date ?? "");
          if (!siteIdRaw || !dateISO) continue;
          if (siteIdRaw === id && dateISO === today) {
            match = d;
            break;
          }
        }

        if (!match) {
          // No attendance yet for today on this site: clear numbers but
          // keep site name and treat it as a non-error state.
          applyDay({
            siteName: null,
            scannedCount: 0,
            status: "PENDING",
            flags: 0,
            fallbackSiteId: id,
          });
          setError(null);
          return;
        }

        const scannedCount =
          Number(
            match.scannedCount ?? match.totalScans ?? match.scansCount ?? 0,
          ) || 0;
        const flags = Number(match.flags ?? 0) || 0;
        const status = (match.status as string | undefined) ?? "PENDING";
        const siteName = String(match.site?.name ?? match.siteName ?? "");

        applyDay({
          siteName,
          scannedCount,
          status,
          flags,
          fallbackSiteId: id,
        });
        setError(null);
      } catch (e: any) {
        if (seq !== requestSeq.current) return;
        // Handle offline gracefully
        if (e instanceof OfflineError) {
          setError("Offline - showing cached data");
          return;
        }
        const s = sites.find((x) => x.id === id);
        if (s) setSiteName(s.name);

        setError(e?.message ?? "Failed to load today’s attendance.");
        resetDayNumbers();
      }

      // Also check for any *fresh* (within 1 hour) site photo requests for today on this site
      try {
        const detail = (await apiForemanDayCached(
          id,
          todayISO(),
          forceRefresh,
        )) as any;
        const reqs = Array.isArray(detail?.photoRequests)
          ? detail.photoRequests
          : [];
        const now = Date.now();
        const hasFresh = reqs.some((r: any) => {
          if (r.status !== "REQUESTED" || !r.requestedAt) return false;
          const requested = new Date(r.requestedAt).getTime();
          if (Number.isNaN(requested)) return false;
          const diffMs = now - requested;
          return diffMs >= 0 && diffMs <= 60 * 60 * 1000;
        });
        setHasPhotoRequest(hasFresh);
      } catch {
        setHasPhotoRequest(false);
      }
    },
    [applyDay, resetDayNumbers, sites],
  );

  // Load ME + sites once
  const loadMeAndSites = useCallback(
    async (forceRefresh = false) => {
      setLoading(true);
      setError(null);

      try {
        const me = await apiMeCached(forceRefresh);
        // Update user with availableForemen from server response
        await updateUser({
          availableForemen: me.user.availableForemen,
          actingForeman: me.user.actingForeman,
        });

        // Fetch sites from the dedicated endpoint to keep
        // behaviour consistent with the Scan screen.
        const sres = await apiSitesCached(forceRefresh);
        const activeSites = (sres.sites ?? []).filter(
          (s: Site) => s.active !== false,
        );
        setSites(activeSites);

        const saved = await getSelectedSiteId();
        const initial =
          saved && activeSites.some((x: Site) => x.id === saved)
            ? saved
            : (activeSites[0]?.id ?? null);

        setSiteId(initial);

        if (!initial) {
          setSiteName("");
          resetDayNumbers();
          return;
        }

        await setSelectedSiteId(initial);
        // IMPORTANT: do NOT call refresh here.
        // The siteId effect below will fetch exactly once.
      } catch (e: any) {
        // Handle offline gracefully
        if (e instanceof OfflineError) {
          setError("Offline - showing cached data");
        } else {
          setError(e?.message ?? "Failed to load data.");
        }
        setSites([]);
        setSiteId(null);
        setSiteName("");
        resetDayNumbers();
      } finally {
        setLoading(false);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [resetDayNumbers],
  );

  useEffect(() => {
    loadMeAndSites();
  }, [loadMeAndSites]);

  // ✅ Single source of truth: whenever siteId changes, fetch today once.
  useEffect(() => {
    if (!siteId) return;
    refreshTodayForSite(siteId);
  }, [siteId, refreshTodayForSite]);

  // State for pull-to-refresh
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    if (!siteId) {
      await loadMeAndSites(true);
      return;
    }

    setRefreshing(true);
    try {
      await refreshTodayForSite(siteId, true); // forceRefresh = true
    } finally {
      setRefreshing(false);
    }
  }, [siteId, refreshTodayForSite, loadMeAndSites]);

  const pickSite = useCallback(
    async (id: string) => {
      // optimistic
      setSiteId(id);
      await setSelectedSiteId(id);

      const s = sites.find((x) => x.id === id);
      if (s) setSiteName(s.name);

      // IMPORTANT: don't call refresh here.
      // The siteId effect will fetch once.
    },
    [sites],
  );

  if (loading) {
    return (
      <AuthStyleBackground>
        <View style={{ flex: 1, padding: 16 }}>
          <GlassCard style={{ padding: 16, alignItems: "center", gap: 10 }}>
            <ActivityIndicator />
            <Text style={{ fontWeight: "900", color: colors.textSecondary }}>
              Loading…
            </Text>
          </GlassCard>
        </View>
      </AuthStyleBackground>
    );
  }

  return (
    <AuthStyleBackground>
      <ForemanTutorial />
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 4,
          flexDirection: "row",
          justifyContent: "flex-end",
        }}
      >
        <Pressable
          onPress={onRefresh}
          style={{
            paddingVertical: 6,
            paddingHorizontal: 10,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.bgSecondary,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            opacity: loading ? 0.5 : 1,
          }}
          disabled={loading}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Ionicons name="refresh" size={16} color={colors.textSecondary} />
          )}
          <Text
            style={{
              color: colors.textSecondary,
              fontWeight: "800",
              fontSize: 12,
            }}
          >
            Refresh
          </Text>
        </Pressable>
      </View>
      <ScrollView
        style={getStyles(colors).wrap}
        contentContainerStyle={{ paddingBottom: 32, gap: 12 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
      >
        <GlassCard style={{ padding: 14 }}>
          <Text style={getStyles(colors).h1}>
            {getTimeGreeting()}, {safeName(user?.name)}
          </Text>
          <Text style={getStyles(colors).sub}>{todayLabel()}</Text>

          <View style={getStyles(colors).statusRow}>
            <View
              style={[
                getStyles(colors).badge,
                getStyles(colors)[
                  getBadgeType(dayStatus) as keyof ReturnType<typeof getStyles>
                ] as any,
              ]}
            >
              <Text style={getStyles(colors).badgeTxt}>{statusLabel}</Text>
            </View>

            {flags > 0 ? (
              <View
                style={[getStyles(colors).badge, getStyles(colors).badgeWarn]}
              >
                <Text style={getStyles(colors).badgeTxt}>
                  {flags} flag{flags === 1 ? "" : "s"}
                </Text>
              </View>
            ) : null}
          </View>
        </GlassCard>

        <GlassCard style={{ padding: 14 }}>
          <View style={getStyles(colors).cardHeaderRow}>
            <Text style={getStyles(colors).sectionTitle}>Site</Text>
            <Text style={getStyles(colors).sectionHint}>
              {sites.length} active
            </Text>
          </View>

          {sites.length === 0 ? (
            <View style={{ marginTop: 10, gap: 10 }}>
              <Text style={getStyles(colors).emptyText}>
                No active sites found. Ask your supervisor to assign you to a
                site.
              </Text>

              <Pressable
                style={getStyles(colors).btnSecondary}
                onPress={() => loadMeAndSites(true)}
              >
                <Text style={getStyles(colors).btnSecondaryTxt}>Try again</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8 }}
                style={{ marginTop: 10 }}
              >
                {sites.map((s) => {
                  const active = s.id === siteId;
                  return (
                    <Pressable
                      key={s.id}
                      onPress={() => pickSite(s.id)}
                      style={[
                        getStyles(colors).pill,
                        active && {
                          backgroundColor: colors.accent,
                          borderColor: colors.accent,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          getStyles(colors).pillTxt,
                          active && getStyles(colors).pillTxtActive,
                        ]}
                      >
                        {s.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <View style={getStyles(colors).todayCard}>
                <Text style={getStyles(colors).label}>Today's Site</Text>
                <Text style={getStyles(colors).siteName} numberOfLines={2}>
                  {siteName || selectedSite?.name || "—"}
                </Text>

                <View style={getStyles(colors).statsRow}>
                  <MiniStat
                    colors={colors}
                    label="Scanned"
                    value={String(scannedCount)}
                  />
                  <MiniStat
                    colors={colors}
                    label="Status"
                    value={statusLabel}
                  />
                </View>

                {hasPhotoRequest && (
                  <View style={getStyles(colors).photoRequestPill}>
                    <Text style={getStyles(colors).photoRequestPillTxt}>
                      New site photo request
                    </Text>
                  </View>
                )}

                {error ? (
                  <View style={getStyles(colors).errorBox}>
                    <Text style={getStyles(colors).errorText}>{error}</Text>
                    <Pressable
                      style={getStyles(colors).retryPill}
                      onPress={() =>
                        siteId ? refreshTodayForSite(siteId) : loadMeAndSites()
                      }
                    >
                      <Text style={getStyles(colors).retryTxt}>Retry</Text>
                    </Pressable>
                  </View>
                ) : null}

                <Pressable
                  style={[
                    {
                      marginTop: 8,
                      backgroundColor: colors.accent,
                      paddingVertical: 12,
                      borderRadius: 10,
                      alignItems: "center" as const,
                    },
                    !siteId && { opacity: 0.5 },
                  ]}
                  disabled={!siteId}
                  onPress={() =>
                    router.push({
                      pathname: "/(foreman)/scan",
                      params: { siteId: siteId ?? "" },
                    })
                  }
                >
                  <Text style={getStyles(colors).btnTxt}>SCAN IN GUYS</Text>
                </Pressable>

                {dayStatus === STATUS_PENDING && (
                  <Pressable
                    style={{
                      marginTop: 8,
                      backgroundColor: colors.bgSecondary,
                      paddingVertical: 12,
                      borderRadius: 10,
                      alignItems: "center" as const,
                      borderWidth: 1,
                      borderColor: colors.accent,
                    }}
                    onPress={() =>
                      router.push({
                        pathname: "/(foreman-stack)/SiteDayPhotoScreen",
                      })
                    }
                  >
                    <Text style={getStyles(colors).btnTxtAlt}>
                      SCAN OUT GUYS
                    </Text>
                  </Pressable>
                )}
              </View>
            </>
          )}
        </GlassCard>

        <Text style={getStyles(colors).footerHint}>
          Tip: select the correct site before scanning to avoid flags.
        </Text>
      </ScrollView>
    </AuthStyleBackground>
  );
}

function getBadgeType(status: DayStatus): string {
  if (status === "APPROVED") return "badgeOk";
  if (status === "REJECTED") return "badgeBad";
  if (status === "SUBMITTED") return "badgeInfo";
  return "badgePending";
}

function MiniStat({
  colors,
  label,
  value,
}: {
  colors: (typeof themes)["dark"];
  label: string;
  value: string;
}) {
  return (
    <View
      style={[
        {
          flex: 1,
          borderRadius: 12,
          paddingVertical: 10,
          paddingHorizontal: 10,
          backgroundColor: colors.bgSecondary,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: "center",
          gap: 4,
        },
      ]}
    >
      <Text
        style={{ fontSize: 16, fontWeight: "900", color: colors.textPrimary }}
      >
        {value}
      </Text>
      <Text
        style={{ color: colors.textSecondary, fontWeight: "800", fontSize: 12 }}
      >
        {label}
      </Text>
    </View>
  );
}

const getStyles = (colors: (typeof themes)["dark"]) =>
  StyleSheet.create({
    wrap: { flex: 1, paddingHorizontal: 16 },

    h1: { fontSize: 20, fontWeight: "900", color: colors.textPrimary },
    sub: { marginTop: 6, color: colors.textSecondary, fontWeight: "800" },

    statusRow: {
      flexDirection: "row",
      gap: 8,
      marginTop: 10,
      flexWrap: "wrap",
    },
    badge: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgSecondary,
    },
    badgeTxt: { fontWeight: "900", fontSize: 12, color: colors.textPrimary },
    badgeOk: { backgroundColor: colors.successLight },
    badgeBad: { backgroundColor: colors.errorLight },
    badgeInfo: { backgroundColor: colors.infoLight },
    badgePending: { backgroundColor: colors.warningLight },
    badgeWarn: { backgroundColor: colors.warningLight },

    cardHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "baseline",
    },
    sectionTitle: {
      color: colors.textPrimary,
      fontWeight: "900",
      fontSize: 14,
    },
    sectionHint: {
      color: colors.textSecondary,
      fontWeight: "800",
      fontSize: 12,
    },

    pill: {
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 999,
      backgroundColor: colors.bgSecondary,
      borderWidth: 1,
      borderColor: colors.border,
    },
    pillTxt: { fontWeight: "900", fontSize: 12, color: colors.textPrimary },
    pillTxtActive: { color: "#fff" },

    todayCard: {
      marginTop: 12,
      padding: 12,
      borderRadius: 8,
      backgroundColor: colors.bgSecondary,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 8,
    },
    label: {
      color: colors.textSecondary,
      fontWeight: "900",
      fontSize: 12,
    },
    siteName: {
      fontSize: 16,
      fontWeight: "900",
      color: colors.textPrimary,
    },

    statsRow: { flexDirection: "row", gap: 12, marginTop: 6 },

    btnTxt: { color: "#fff", fontWeight: "900", letterSpacing: 1 },
    btnTxtAlt: {
      color: colors.accent,
      fontWeight: "900",
      letterSpacing: 1,
    },

    photoRequestPill: {
      marginTop: 6,
      alignSelf: "flex-start" as const,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 999,
      backgroundColor: colors.accentLight,
    },
    photoRequestPillTxt: {
      color: colors.accent,
      fontWeight: "900",
      fontSize: 12,
    },

    btnSecondary: {
      backgroundColor: colors.bgSecondary,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 10,
      borderRadius: 10,
      alignItems: "center" as const,
    },
    btnSecondaryTxt: { color: colors.textPrimary, fontWeight: "900" },

    errorBox: {
      marginTop: 6,
      borderRadius: 12,
      padding: 10,
      backgroundColor: colors.errorLight,
      borderWidth: 1,
      borderColor: colors.error,
      flexDirection: "row" as const,
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    errorText: {
      flex: 1,
      color: colors.error,
      fontWeight: "900",
      fontSize: 12,
    },
    retryPill: {
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 999,
      backgroundColor: colors.bgSecondary,
      borderWidth: 1,
      borderColor: colors.border,
    },
    retryTxt: { fontWeight: "900", color: colors.textPrimary, fontSize: 12 },

    emptyText: {
      color: colors.textSecondary,
      fontWeight: "800",
      lineHeight: 18,
    },

    footerHint: {
      color: colors.textSecondary,
      fontWeight: "800",
      fontSize: 12,
      textAlign: "center" as const,
      marginTop: "auto" as any,
      paddingBottom: 6,
    },
  });
