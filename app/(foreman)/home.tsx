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
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import { CustomAlert } from "@/components/CustomAlert";
import ForemanDownloadTimesheetModal from "@/components/ForemanDownloadTimesheetModal";
import { ForemanTutorial } from "@/components/ForemanTutorial";
import ScanInCubeFace from "@/components/foreman/ScanInCubeFace";
import { GlassPanel } from "@/components/team";
import {
  useFaceTheme,
  type FaceColorPalette,
} from "@/components/team/faceTheme";
import {
  CubeSpinStage,
  type CubeSpinStageHandle,
} from "@/components/transitions/CubeSpinStage";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import {
  apiForemanDayCached,
  apiForemanDaysCached,
  apiForemanScanOutPending,
  apiMe,
  apiMeCached,
  apiSitesCached,
  OfflineError,
  type Site,
} from "../../lib/apiClient";
import { useAuth } from "../../lib/auth";
import { getCurrentFortnight, isISOInRange } from "../../lib/fortnight";
import { getSelectedSiteId, setSelectedSiteId } from "../../lib/sitePrefs";
import { SCAN_CUBE_TRANSITION_ENABLED } from "../../lib/transitionFlags";
import { ArrowBigDownIcon } from "lucide-react-native";

// Nudges the eye toward the site dropdown just below - a small vertical
// bounce, looped indefinitely while this row is on screen.
function BouncingDownArrow({ color }: { color: string }) {
  const translateY = useSharedValue(0);

  useEffect(() => {
    translateY.value = withRepeat(
      withSequence(
        withTiming(6, { duration: 500 }),
        withTiming(0, { duration: 500 }),
      ),
      -1,
      true,
    );
  }, [translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <ArrowBigDownIcon size={16} color={color} />
    </Animated.View>
  );
}

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
  const { colors, radius, typography } = useFaceTheme();
  const styles = useMemo(() => getStyles(colors, radius), [colors, radius]);

  const { user, updateUser } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Admin-controlled: which scan-out flow(s) the app currently offers.
  // Defaults to both enabled until /api/app/me responds (and for older
  // cached responses that pre-date this field).
  const [scanOutFaceEnabled, setScanOutFaceEnabled] = useState(true);
  const [scanOutPhotoEnabled, setScanOutPhotoEnabled] = useState(true);
  const [scanOutMethodPickerOpen, setScanOutMethodPickerOpen] = useState(false);

  const [siteName, setSiteName] = useState<string>("");
  const [scannedCount, setScannedCount] = useState<number>(0);
  const [flags, setFlags] = useState<number>(0);
  const [hasPhotoRequest, setHasPhotoRequest] = useState(false);

  // Who's still on site (scanned in, not yet scanned out) vs. already gone —
  // drives whether the SCAN OUT button appears at all and the "Scanned Out"
  // stat tile, independent of the day's submission status.
  const [pendingScanOutCount, setPendingScanOutCount] = useState<number>(0);
  const [scannedOutCount, setScannedOutCount] = useState<number>(0);

  const selectedSite = useMemo(
    () => sites.find((s) => s.id === siteId) ?? null,
    [sites, siteId],
  );

  const applyDay = useCallback(
    (payload: {
      siteName?: string | null;
      scannedCount?: number | null;
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
      setFlags(Number(payload.flags ?? 0) || 0);
    },
    [sites],
  );

  const resetDayNumbers = useCallback(() => {
    setScannedCount(0);
    setFlags(0);
    setPendingScanOutCount(0);
    setScannedOutCount(0);
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
            flags: 0,
            fallbackSiteId: id,
          });
          setError(null);
        } else {
          const scannedCount =
            Number(
              match.scannedCount ?? match.totalScans ?? match.scansCount ?? 0,
            ) || 0;
          const flags = Number(match.flags ?? 0) || 0;
          const siteName = String(match.site?.name ?? match.siteName ?? "");

          applyDay({
            siteName,
            scannedCount,
            flags,
            fallbackSiteId: id,
          });
          setError(null);
        }
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

      // Who's scanned in but not out yet — same source the face scan-out
      // scanner uses, so this count and that screen never disagree.
      try {
        const pending = await apiForemanScanOutPending(id, todayISO());
        const stillIn = pending.employees.length;
        setPendingScanOutCount(stillIn);
        setScannedOutCount(
          Math.max(0, (pending.totalScannedInToday ?? 0) - stillIn),
        );
      } catch {
        setPendingScanOutCount(0);
        setScannedOutCount(0);
      }
    },
    [applyDay, resetDayNumbers, sites],
  );

  // Load ME + sites once
  // Among the given active sites, the one with the most attendance scans
  // logged (by this foreman) within the current fortnight — the site
  // they've clearly been working, so it's the best guess when nothing was
  // explicitly picked. Returns null when there's no fortnight scan data to
  // rank by (e.g. a foreman just starting a new fortnight).
  const pickMostActiveSiteThisFortnight = useCallback(
    async (activeSites: Site[], forceRefresh: boolean) => {
      try {
        const res = await apiForemanDaysCached(forceRefresh);
        const rawList =
          (Array.isArray((res as any)?.days) && (res as any).days) ||
          (Array.isArray(res as any) && (res as any)) ||
          (Array.isArray((res as any)?.data) && (res as any).data) ||
          [];

        const { startISO, endISO } = getCurrentFortnight();
        const activeIds = new Set(activeSites.map((s) => s.id));
        const totalsBySiteId = new Map<string, number>();

        for (const d of rawList as any[]) {
          const siteIdRaw = String(d?.site?.id ?? d?.siteId ?? "");
          const dateISO = String(d?.dateISO ?? d?.workDateISO ?? d?.date ?? "");
          if (!siteIdRaw || !dateISO) continue;
          if (!activeIds.has(siteIdRaw)) continue;
          if (!isISOInRange(dateISO, startISO, endISO)) continue;

          const count = Number(d?.scannedCount ?? d?.totalScans ?? 0) || 0;
          totalsBySiteId.set(
            siteIdRaw,
            (totalsBySiteId.get(siteIdRaw) ?? 0) + count,
          );
        }

        let bestSiteId: string | null = null;
        let bestCount = 0;
        for (const [id, count] of totalsBySiteId) {
          if (count > bestCount) {
            bestCount = count;
            bestSiteId = id;
          }
        }
        return bestSiteId;
      } catch {
        // Best-effort ranking only — fall back to no auto-pick.
        return null;
      }
    },
    [],
  );

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

        setScanOutFaceEnabled(me.appSettings?.scanOutFaceEnabled ?? true);
        setScanOutPhotoEnabled(me.appSettings?.scanOutPhotoEnabled ?? true);

        // Fetch sites from the dedicated endpoint to keep
        // behaviour consistent with the Scan screen.
        const sres = await apiSitesCached(forceRefresh);
        const activeSites = (sres.sites ?? []).filter(
          (s: Site) => s.active !== false,
        );
        setSites(activeSites);

        const saved = await getSelectedSiteId();
        const savedIsValid =
          saved && activeSites.some((x: Site) => x.id === saved);

        // Auto-select when there's exactly one site, a previously chosen
        // site is still valid, or — with several sites and nothing saved —
        // whichever site this foreman has scanned the most people at so far
        // this fortnight. Otherwise the foreman must pick one from the
        // dropdown before the site detail/buttons appear.
        let initial: string | null = savedIsValid
          ? saved
          : activeSites.length === 1
            ? activeSites[0].id
            : null;

        if (!initial && activeSites.length > 1) {
          initial = await pickMostActiveSiteThisFortnight(
            activeSites,
            forceRefresh,
          );
        }

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
    [resetDayNumbers, pickMostActiveSiteThisFortnight],
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

  const handleSelectSite = useCallback(
    (id: string) => {
      setDropdownOpen(false);
      pickSite(id);
    },
    [pickSite],
  );

  const [downloadModalOpen, setDownloadModalOpen] = useState(false);

  // Foremen sometimes tap straight through without re-checking the
  // auto-selected site, so both scan actions are gated behind a confirm
  // dialog naming the site before we navigate.
  const [confirmScan, setConfirmScan] = useState<"IN" | "OUT" | null>(null);

  const cubeStageRef = useRef<CubeSpinStageHandle>(null);

  const goScanIn = useCallback(() => {
    let navigated = false;
    const navigateToScan = () => {
      if (navigated) return;
      navigated = true;
      router.push({
        pathname: "/(foreman)/scan",
        params: { siteId: siteId ?? "" },
      });
    };

    if (!SCAN_CUBE_TRANSITION_ENABLED) {
      navigateToScan();
      return;
    }

    // Play the tumble first, then navigate once the stage is back at rest —
    // matches the "reset to identity on completion" contract in CubeSpinStage.
    // If the stage unmounts mid-spin for any reason, this callback never
    // fires, so a fallback timer guarantees the tap still lands.
    cubeStageRef.current?.spin(navigateToScan);
    setTimeout(navigateToScan, 900);
  }, [router, siteId]);

  const navigateToScanOut = useCallback(
    (method: "FACE" | "PHOTO") => {
      setScanOutMethodPickerOpen(false);
      if (method === "PHOTO") {
        router.push({
          pathname: "/(foreman-stack)/SiteDayPhotoScreen",
          params: { siteId: siteId ?? "", siteName },
        });
        return;
      }
      router.push({
        pathname: "/(foreman-stack)/scan-out-face",
        params: { siteId: siteId ?? "", siteName },
      });
    },
    [router, siteId, siteName],
  );

  const goScanOut = useCallback(async () => {
    // This is an admin kill-switch, not a cosmetic setting — read it fresh
    // every time rather than trusting whatever loaded at Home mount
    // (apiMeCached can be up to an hour stale). Falls back to the
    // last-known values on a network failure so a flaky connection can't
    // block a foreman from scanning out at all.
    let face = scanOutFaceEnabled;
    let photo = scanOutPhotoEnabled;
    try {
      const me = await apiMe();
      face = me.appSettings?.scanOutFaceEnabled ?? true;
      photo = me.appSettings?.scanOutPhotoEnabled ?? true;
      setScanOutFaceEnabled(face);
      setScanOutPhotoEnabled(photo);
    } catch {
      // Offline/timeout — proceed with last-known values.
    }

    // Both enabled: let the foreman choose. Only one enabled: skip the
    // picker and go straight there — today's behaviour when face-only.
    if (face && photo) {
      setScanOutMethodPickerOpen(true);
      return;
    }
    navigateToScanOut(photo ? "PHOTO" : "FACE");
  }, [scanOutFaceEnabled, scanOutPhotoEnabled, navigateToScanOut]);

  if (loading) {
    return (
      <AuthStyleBackground>
        <View style={{ flex: 1, padding: 16 }}>
          <GlassPanel contentPadding={16} radius={5}>
            <View style={{ alignItems: "center", gap: 10 }}>
              <ActivityIndicator color={colors.success} />
              <Text style={typography.bodyStrong}>Loading…</Text>
            </View>
          </GlassPanel>
        </View>
      </AuthStyleBackground>
    );
  }

  return (
    <CubeSpinStage
      ref={cubeStageRef}
      back={<ScanInCubeFace siteName={siteName || selectedSite?.name} />}
      front={
        <AuthStyleBackground>
          <ForemanTutorial />
          <ScrollView
            style={styles.wrap}
            contentContainerStyle={{
              paddingTop: 8,
              paddingBottom: 32,
              gap: 12,
            }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.success}
                colors={[colors.success]}
              />
            }
          >
            <GlassPanel contentPadding={16} radius={5} elevated showSheen>
              <Text style={typography.title}>
                {getTimeGreeting()}, {safeName(user?.name)}
              </Text>

              <View style={styles.dateRow}>
                <Text style={typography.body}>{todayLabel()}</Text>
                <Pressable
                  onPress={onRefresh}
                  style={styles.refreshPill}
                  disabled={loading}
                >
                  {refreshing ? (
                    <ActivityIndicator size="small" color={colors.success} />
                  ) : (
                    <Ionicons
                      name="refresh"
                      size={16}
                      color={colors.textSecondary}
                    />
                  )}
                  <Text style={styles.refreshTxt}>Refresh</Text>
                </Pressable>
              </View>

              {flags > 0 ? (
                <View style={{ flexDirection: "row", marginTop: 10 }}>
                  <View style={styles.flagBadge}>
                    <Text style={styles.flagBadgeTxt}>
                      {flags} flag{flags === 1 ? "" : "s"}
                    </Text>
                  </View>
                </View>
              ) : null}

              <Pressable
                style={styles.downloadTimesheetBtn}
                onPress={() => setDownloadModalOpen(true)}
              >
                <Ionicons
                  name="download-outline"
                  size={16}
                  color={colors.success}
                />
                <Text style={styles.downloadTimesheetTxt}>
                  Download Timesheet
                </Text>
              </Pressable>
            </GlassPanel>

            <GlassPanel contentPadding={16} radius={5}>
              <View style={styles.cardHeaderRow}>
                <View style={styles.cardHeaderTitle}>
                  <Text style={typography.headline}>Click Select Site</Text>
                  <BouncingDownArrow color={colors.textTertiary} />
                </View>
                <Text style={typography.caption}>{sites.length} active</Text>
              </View>

              {sites.length === 0 ? (
                <View style={{ marginTop: 10, gap: 10 }}>
                  <Text style={[typography.body, { lineHeight: 18 }]}>
                    No active sites found. Ask your supervisor to assign you to
                    a site.
                  </Text>

                  <Pressable
                    style={styles.btnSecondary}
                    onPress={() => loadMeAndSites(true)}
                  >
                    <Text style={typography.bodyStrong}>Try again</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  <Pressable
                    style={styles.siteDropdownTrigger}
                    onPress={() => sites.length > 1 && setDropdownOpen(true)}
                  >
                    <Ionicons
                      name="location-outline"
                      size={16}
                      color={colors.success}
                    />
                    <Text style={styles.siteDropdownTxt} numberOfLines={1}>
                      {selectedSite?.name ?? "Select a site"}
                    </Text>
                    {sites.length > 1 && (
                      <Ionicons
                        name="chevron-down"
                        size={16}
                        color={colors.textTertiary}
                      />
                    )}
                  </Pressable>

                  {!siteId ? (
                    <Text style={[typography.caption, { marginTop: 10 }]}>
                      Choose a site above to start scanning.
                    </Text>
                  ) : (
                    <View style={styles.todayCard}>
                      <Text style={typography.label}>Today&apos;s Site</Text>
                      <Text style={typography.headline} numberOfLines={2}>
                        {siteName || selectedSite?.name || "—"}
                      </Text>

                      <View style={styles.statsRow}>
                        <MiniStat
                          colors={colors}
                          radius={radius}
                          label="Scanned"
                          value={String(scannedCount)}
                        />
                        <MiniStat
                          colors={colors}
                          radius={radius}
                          label="Scanned Out"
                          value={String(scannedOutCount)}
                        />
                      </View>

                      {hasPhotoRequest && (
                        <View style={styles.photoRequestPill}>
                          <Text style={styles.photoRequestPillTxt}>
                            New site photo request
                          </Text>
                        </View>
                      )}

                      {error ? (
                        <View style={styles.errorBox}>
                          <Text style={styles.errorText}>{error}</Text>
                          <Pressable
                            style={styles.retryPill}
                            onPress={() =>
                              siteId
                                ? refreshTodayForSite(siteId)
                                : loadMeAndSites()
                            }
                          >
                            <Text style={typography.bodyStrong}>Retry</Text>
                          </Pressable>
                        </View>
                      ) : null}

                      <Pressable
                        style={styles.btnPrimary}
                        onPress={() => setConfirmScan("IN")}
                      >
                        <Text style={styles.btnPrimaryTxt}>SCAN IN GUYS</Text>
                      </Pressable>

                      {/* Single scan-out entry point. Routes straight to
                      whichever method is admin-enabled (Settings > System
                      > Scan-Out Method); asks via goScanOut's picker sheet
                      when both are on. Only shown once someone is actually
                      still scanned in — nothing to scan out otherwise. */}
                      {pendingScanOutCount > 0 && (
                        <Pressable
                          style={styles.btnOutline}
                          onPress={() => setConfirmScan("OUT")}
                        >
                          <Text style={styles.btnOutlineTxt}>
                            SCAN OUT GUYS ({pendingScanOutCount})
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  )}
                </>
              )}
            </GlassPanel>

            <Text style={styles.footerHint}>
              Tip: select the correct site before scanning to avoid flags.
            </Text>
          </ScrollView>

          <Modal
            visible={dropdownOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setDropdownOpen(false)}
          >
            <Pressable
              style={styles.modalBackdrop}
              onPress={() => setDropdownOpen(false)}
            >
              <Pressable style={styles.modalSheet} onPress={() => {}}>
                <Text style={[typography.label, { marginBottom: 8 }]}>
                  Select a site
                </Text>
                <ScrollView style={{ maxHeight: 360 }}>
                  {sites.map((s) => {
                    const active = s.id === siteId;
                    return (
                      <Pressable
                        key={s.id}
                        style={[
                          styles.modalRow,
                          active && styles.modalRowActive,
                        ]}
                        onPress={() => handleSelectSite(s.id)}
                      >
                        <Text
                          style={[
                            typography.bodyStrong,
                            active && { color: colors.success },
                          ]}
                        >
                          {s.name}
                        </Text>
                        {active && (
                          <Ionicons
                            name="checkmark"
                            size={18}
                            color={colors.success}
                          />
                        )}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </Pressable>
            </Pressable>
          </Modal>

          <Modal
            visible={scanOutMethodPickerOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setScanOutMethodPickerOpen(false)}
          >
            <Pressable
              style={styles.modalBackdrop}
              onPress={() => setScanOutMethodPickerOpen(false)}
            >
              <Pressable style={styles.modalSheet} onPress={() => {}}>
                <Text style={[typography.label, { marginBottom: 8 }]}>
                  Scan out with
                </Text>
                <Pressable
                  style={styles.modalRow}
                  onPress={() => navigateToScanOut("FACE")}
                >
                  <Text style={typography.bodyStrong}>Face Scan Out</Text>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={colors.textTertiary}
                  />
                </Pressable>
                <Pressable
                  style={styles.modalRow}
                  onPress={() => navigateToScanOut("PHOTO")}
                >
                  <Text style={typography.bodyStrong}>Photo Scan Out</Text>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={colors.textTertiary}
                  />
                </Pressable>
              </Pressable>
            </Pressable>
          </Modal>

          <CustomAlert
            visible={confirmScan !== null}
            title={
              confirmScan === "OUT" ? "Confirm scan out" : "Confirm scan in"
            }
            message={`Scan ${confirmScan === "OUT" ? "out" : "in"} for ${
              siteName || selectedSite?.name || "this site"
            }?`}
            onDismiss={() => setConfirmScan(null)}
            buttons={[
              { text: "Cancel", style: "cancel" },
              ...(sites.length > 1
                ? [
                    {
                      text: "Change Site",
                      onPress: () => setDropdownOpen(true),
                    },
                  ]
                : []),
              {
                text: "Continue",
                onPress: () => {
                  if (confirmScan === "OUT") goScanOut();
                  else if (confirmScan === "IN") goScanIn();
                },
              },
            ]}
          />

          <ForemanDownloadTimesheetModal
            visible={downloadModalOpen}
            onClose={() => setDownloadModalOpen(false)}
          />
        </AuthStyleBackground>
      }
    />
  );
}

function MiniStat({
  colors,
  radius,
  label,
  value,
}: {
  colors: FaceColorPalette;
  radius: { sm: number };
  label: string;
  value: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        borderRadius: radius.sm,
        paddingVertical: 10,
        paddingHorizontal: 10,
        backgroundColor: colors.glassFillStrong,
        borderWidth: 1,
        borderColor: colors.glassBorder,
        alignItems: "center",
        gap: 4,
      }}
    >
      <Text
        style={{ fontSize: 16, fontWeight: "800", color: colors.textPrimary }}
      >
        {value}
      </Text>
      <Text
        style={{
          color: colors.textSecondary,
          fontWeight: "700",
          fontSize: 12,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

const getStyles = (
  colors: FaceColorPalette,
  radius: { sm: number; md: number; lg: number; xl: number; pill: number },
) =>
  StyleSheet.create({
    wrap: { flex: 1, paddingHorizontal: 16 },

    dateRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 4,
    },

    refreshPill: {
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      backgroundColor: colors.glassFillStrong,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    refreshTxt: {
      color: colors.textSecondary,
      fontWeight: "700",
      fontSize: 12,
    },

    cardHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "baseline",
    },

    flagBadge: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: radius.pill,
      backgroundColor: colors.warningDim,
      borderWidth: 1,
      borderColor: colors.warningBorder,
    },
    flagBadgeTxt: { fontWeight: "800", fontSize: 12, color: colors.warning },

    downloadTimesheetBtn: {
      marginTop: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 10,
      borderRadius: radius.sm,
      backgroundColor: colors.successDim,
      borderWidth: 1,
      borderColor: colors.successBorder,
    },
    downloadTimesheetTxt: {
      fontWeight: "800",
      fontSize: 13,
      color: colors.success,
    },

    siteDropdownTrigger: {
      marginTop: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: radius.sm,
      backgroundColor: colors.glassFillStrong,
      borderWidth: 1,
      borderColor: colors.glassBorder,
    },
    siteDropdownTxt: {
      flex: 1,
      color: colors.textPrimary,
      fontWeight: "700",
      fontSize: 14,
    },

    todayCard: {
      marginTop: 12,
      padding: 12,
      borderRadius: radius.sm,
      backgroundColor: colors.glassFillStrong,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      gap: 8,
    },

    statsRow: { flexDirection: "row", gap: 12, marginTop: 6 },

    btnPrimary: {
      marginTop: 8,
      backgroundColor: colors.success,
      paddingVertical: 12,
      borderRadius: radius.sm,
      alignItems: "center",
    },
    btnPrimaryTxt: {
      color: colors.textOnPrimary,
      fontWeight: "800",
      letterSpacing: 1,
    },

    btnOutline: {
      marginTop: 8,
      backgroundColor: "transparent",
      paddingVertical: 12,
      borderRadius: radius.sm,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.success,
    },
    btnOutlineTxt: {
      color: colors.success,
      fontWeight: "800",
      letterSpacing: 1,
    },

    photoRequestPill: {
      marginTop: 6,
      alignSelf: "flex-start",
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: radius.pill,
      backgroundColor: colors.primaryDim,
    },
    photoRequestPillTxt: {
      color: colors.primary,
      fontWeight: "800",
      fontSize: 12,
    },

    btnSecondary: {
      backgroundColor: colors.glassFillStrong,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      paddingVertical: 10,
      borderRadius: radius.sm,
      alignItems: "center",
    },

    errorBox: {
      marginTop: 6,
      borderRadius: radius.sm,
      padding: 10,
      backgroundColor: colors.dangerDim,
      borderWidth: 1,
      borderColor: colors.dangerBorder,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    errorText: {
      flex: 1,
      color: colors.danger,
      fontWeight: "800",
      fontSize: 12,
    },
    retryPill: {
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: radius.pill,
      backgroundColor: colors.glassFillStrong,
      borderWidth: 1,
      borderColor: colors.glassBorder,
    },

    footerHint: {
      color: colors.textTertiary,
      fontWeight: "700",
      fontSize: 12,
      textAlign: "center",
      marginTop: "auto" as any,
      paddingBottom: 6,
    },

    modalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      paddingHorizontal: 24,
    },
    modalSheet: {
      backgroundColor: colors.backgroundElevated,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      padding: 16,
    },
    modalRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 14,
      paddingHorizontal: 4,
      borderBottomWidth: 1,
      borderBottomColor: colors.glassBorder,
    },
    modalRowActive: {
      backgroundColor: colors.successDim,
      borderRadius: radius.sm,
      paddingHorizontal: 10,
    },
    cardHeaderTitle: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
  });
