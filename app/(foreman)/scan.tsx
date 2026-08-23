import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import { GlassPanel } from "@/components/team";
import { useFaceTheme, type FaceColorPalette } from "@/components/team/faceTheme";
import { Ionicons } from "@expo/vector-icons";
import { setAudioModeAsync, useAudioPlayer } from "expo-audio";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  apiAttendanceTodayCached,
  apiDeleteScan,
  apiForemanEmployees,
  apiScanBulk,
  apiSitesCached,
  type AttendanceDayDto,
  type AttendanceScanDto,
  type Site,
} from "../../lib/apiClient";
import { useAuth, type ForemanOption } from "../../lib/auth";
import { clearBatch, getBatch, setBatch } from "../../lib/batchPrefs";
import { scheduleSiteDayPhotoReminder } from "../../lib/push";
import { setSelectedSiteId } from "../../lib/sitePrefs";
import { useLocation } from "../../lib/useLocation";

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Extract employee code from QR payload
 * Accepts any format from database:
 * - "EMP_ABC123"
 * - "ABC123"
 * - "WORKER001"
 * - "WORKER: CODE" (extracts after colon)
 */
function extractEmployeeCode(payload: string): string | null {
  const raw = String(payload ?? "").trim();
  if (!raw) return null;

  let code = raw.toUpperCase();

  // If it contains a colon, take substring after colon
  const colonIdx = code.indexOf(":");
  if (colonIdx !== -1) {
    code = code.slice(colonIdx + 1).trim();
  }

  // Remove all whitespace
  code = code.replace(/\s+/g, "");

  // Accept any non-empty code (no format validation)
  return code.length > 0 ? code : null;
}

/** First letter of up to two words, for the avatar fallback circle. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const second = parts.length > 1 ? (parts[1][0] ?? "") : "";
  return (first + second).toUpperCase();
}

export default function ForemanScan() {
  const params = useLocalSearchParams<{ siteId?: string }>();
  const router = useRouter();
  const dateISO = useMemo(() => todayISO(), []);

  const { colors, radius, typography } = useFaceTheme();
  const styles = useMemo(() => getStyles(colors, radius), [colors, radius]);

  const { user, setActingForeman } = useAuth();

  // Check if user is an assistant
  const isAssistant = useMemo(
    () => (user?.availableForemen ?? []).length > 0,
    [user?.availableForemen],
  );
  const actingForeman = user?.actingForeman ?? null;

  const [permission, requestPermission] = useCameraPermissions();
  const { getLocationWithAddress } = useLocation();

  const [loading, setLoading] = useState(true);
  const [busySubmit, setBusySubmit] = useState(false);

  // Site is normally resolved once from the siteId route param (set by the
  // home screen's confirm-and-select gate). If it's missing/invalid, the
  // fallback picker below lets the foreman choose right here instead of
  // being sent back to home.
  const [site, setSite] = useState<Site | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [sitePickerOpen, setSitePickerOpen] = useState(false);

  const [day, setDay] = useState<AttendanceDayDto | null>(null);
  const serverScans = day?.scans ?? [];

  // Local batch (offline)
  const [batch, setBatchState] = useState<string[]>([]);
  const batchSet = useMemo(
    () => new Set(batch.map((x) => x.toUpperCase())),
    [batch],
  );

  const serverSet = useMemo(() => {
    const s = new Set<string>();
    for (const scan of serverScans) {
      // NOTE: your API returns employee.code; use it.
      s.add(String(scan.employee.code ?? "").toUpperCase());
    }
    return s;
  }, [serverScans]);

  // Code -> employee lookup so the batch list can show a real name/photo
  // instead of the raw QR code — display only, the scan itself still
  // submits by code.
  const [employeesByCode, setEmployeesByCode] = useState<
    Map<string, { fullName: string; faceImageUrl?: string | null }>
  >(new Map());

  useEffect(() => {
    apiForemanEmployees()
      .then((res) => {
        const map = new Map<
          string,
          { fullName: string; faceImageUrl?: string | null }
        >();
        for (const e of res.employees ?? []) {
          map.set(String(e.code ?? "").toUpperCase(), {
            fullName: e.fullName,
            faceImageUrl: e.faceImageUrl,
          });
        }
        setEmployeesByCode(map);
      })
      .catch(() => {
        // Name lookup is a display nicety — batch scanning still works by
        // code alone if this fails.
      });
  }, [actingForeman]);

  const [status, setStatus] = useState<string>("Loading…");

  // throttle scanning
  const lastScanAtRef = useRef<number>(0);
  const okPlayer = useAudioPlayer(require("@/assets/sounds/beep.mp3"));
  const errPlayer = useAudioPlayer(require("@/assets/sounds/error.mp3"));

  const playOk = useCallback(() => {
    try {
      if (!okPlayer) return;
      okPlayer.seekTo(0);
      okPlayer.play();
    } catch {}
  }, [okPlayer]);

  const playErr = useCallback(() => {
    try {
      if (!errPlayer) return;
      errPlayer.seekTo(0);
      errPlayer.play();
    } catch {}
  }, [errPlayer]);

  function canAcceptScanNow() {
    const now = Date.now();
    if (now - lastScanAtRef.current < 650) return false;
    lastScanAtRef.current = now;
    return true;
  }

  const loadBatchForSite = useCallback(
    async (siteId: string) => {
      const savedBatch = await getBatch(siteId, dateISO);
      setBatchState(savedBatch);
    },
    [dateISO],
  );

  const refreshTodayForSite = useCallback(async (siteId: string) => {
    try {
      const dres = await apiAttendanceTodayCached(siteId);
      setDay(dres.day);
      setStatus("Scan guy cards (batch mode)…");
    } catch (e: any) {
      setStatus(e?.message ?? "Failed to load today.");
      setDay(null);
    }
  }, []);

  const refreshToday = useCallback(async () => {
    if (!site) {
      setDay(null);
      return;
    }

    await refreshTodayForSite(site.id);
  }, [site, refreshTodayForSite]);

  // Resolve the site named by the route param. Always fetches the site list
  // (not just when the param is missing) so the fallback picker below has
  // something to show if resolution fails for any reason.
  const loadSite = useCallback(async () => {
    if (isAssistant && !actingForeman) {
      setLoading(false);
      setStatus("Select a foreman first.");
      return;
    }

    setLoading(true);
    try {
      const sres = await apiSitesCached(); // x-acting-foreman-id header injected by apiFetch
      const list = (sres.sites ?? []).filter((x) => x.active !== false);
      setSites(list);

      const siteId = typeof params.siteId === "string" ? params.siteId : "";
      if (!siteId) {
        setSite(null);
        setStatus("No site selected.");
        return;
      }

      const match = list.find((x) => x.id === siteId) ?? null;
      if (!match) {
        setSite(null);
        setStatus("That site is no longer active.");
        return;
      }

      setSite(match);
      await setSelectedSiteId(match.id);
      await loadBatchForSite(match.id);
      await refreshTodayForSite(match.id);
    } catch (e: any) {
      setSite(null);
      setStatus(e?.message ?? "Failed to load site.");
    } finally {
      setLoading(false);
    }
  }, [params.siteId, isAssistant, actingForeman, loadBatchForSite, refreshTodayForSite]);

  // Fallback picker's own selection path — same resolution loadSite does for
  // a param'd site, just triggered by a tap instead of the route param.
  const pickSite = useCallback(
    async (chosen: Site) => {
      setSitePickerOpen(false);
      setSite(chosen);
      setStatus("Scan guy cards (batch mode)…");
      await setSelectedSiteId(chosen.id);
      await loadBatchForSite(chosen.id);
      await refreshTodayForSite(chosen.id);
    },
    [loadBatchForSite, refreshTodayForSite],
  );

  // Handle foreman selection for assistants
  const handleSelectForeman = useCallback(
    async (foreman: ForemanOption) => {
      try {
        await setActingForeman(foreman);
        // Site will reload via useEffect when actingForeman changes
      } catch (e: any) {
        Alert.alert("Error", e?.message ?? "Failed to select foreman");
      }
    },
    [setActingForeman],
  );

  // Handle changing foreman (clear selection)
  const handleChangeForeman = useCallback(async () => {
    await setActingForeman(null);
    setSite(null);
    setDay(null);
    setBatchState([]);
    setStatus("Select a foreman first.");
  }, [setActingForeman]);

  useEffect(() => {
    loadSite();
  }, [loadSite]);

  useEffect(() => {
    refreshToday();
  }, [refreshToday]);

  useEffect(() => {
    if (permission?.granted) {
      setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
        shouldPlayInBackground: false,
        interruptionMode: "mixWithOthers",
        shouldRouteThroughEarpiece: false,
      }).catch(() => {});
    }
  }, [permission?.granted]);

  // persist batch whenever it changes
  useEffect(() => {
    if (!site) return;
    setBatch(site.id, dateISO, batch).catch(() => {});
  }, [batch, site, dateISO]);

  async function handlePayload(payload: string) {
    if (!site) return;

    const code = extractEmployeeCode(payload);
    if (!code) {
      playErr();
      setStatus("⚠️ Not a guy card QR");
      return;
    }

    const key = code.toUpperCase();

    if (serverSet.has(key)) {
      playErr();
      setStatus(`ℹ️ Already saved today: ${code}`);
      return;
    }

    if (batchSet.has(key)) {
      playErr();
      setStatus(`ℹ️ Already in batch: ${code}`);
      return;
    }

    playOk();
    setBatchState((prev) => [...prev, code]);
    setStatus(`➕ Added to batch: ${code}`);
  }

  function removeFromBatch(code: string) {
    const key = code.toUpperCase();
    setBatchState((prev) => prev.filter((x) => x.toUpperCase() !== key));
    setStatus(`🗑️ Removed from batch: ${code}`);
  }

  function undoLastScan() {
    setBatchState((prev) => {
      if (!prev.length) return prev;
      const last = prev[prev.length - 1];
      setStatus(`↩️ Undone: ${last}`);
      return prev.slice(0, -1);
    });
  }

  async function clearLocalBatch() {
    if (!site) return;
    Alert.alert(
      "Clear batch?",
      "This removes locally scanned items (not server scans).",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            setBatchState([]);
            await clearBatch(site.id, dateISO);
            setStatus("Batch cleared");
          },
        },
      ],
    );
  }

  async function submitBatch() {
    if (!site) return;
    if (!batch.length) return;

    setBusySubmit(true);
    setStatus("Getting location…");

    try {
      // Get device location — required for submission
      const location = await getLocationWithAddress();
      if (!location) {
        setStatus(
          "⚠️ Could not get location. Please enable location services.",
        );
        Alert.alert(
          "Location Required",
          "Could not get your location.\n\nOn Huawei: go to Settings → Location, enable it and set mode to 'High accuracy'. Also go to Settings → Battery → App launch and disable battery optimization for this app.",
        );
        setBusySubmit(false);
        return;
      }

      setStatus("Submitting batch…");

      // ✅ FIX: apiScanBulk needs (siteId, workDateISO, qrCodeValues[], location)
      const res = await apiScanBulk(site.id, dateISO, batch, {
        latitude: location.latitude,
        longitude: location.longitude,
        address: location.address,
      });

      await refreshTodayForSite(site.id);

      setBatchState([]);
      await clearBatch(site.id, dateISO);

      // Your server returns { ok, siteDayId, results: [...] }
      const created = res.results.filter(
        (r: { status: string }) => r.status === "CREATED",
      ).length;
      const dupes = res.results.filter(
        (r: { status: string }) => r.status === "ALREADY_SCANNED",
      ).length;
      const unknown = res.results.filter(
        (r: { status: string }) => r.status === "UNKNOWN",
      ).length;
      const inactive = res.results.filter(
        (r: { status: string }) => r.status === "INACTIVE",
      ).length;

      const parts: string[] = [];
      parts.push(`Saved: ${created}`);
      if (dupes) parts.push(`Already scanned: ${dupes}`);
      if (unknown) parts.push(`Unknown: ${unknown}`);
      if (inactive) parts.push(`Inactive: ${inactive}`);

      playOk();
      Alert.alert("Batch submitted", parts.join("\n"), [
        {
          text: "OK",
          // Site selection now lives on the home screen — send the
          // foreman back there instead of re-opening a picker here.
          onPress: () => router.back(),
        },
      ]);
      setStatus(`✅ Submitted. Saved ${created}.`);

      // Schedule site day photo reminder notification at midnight
      // Only if at least one scan was created and site exists
      if (created > 0 && site) {
        scheduleSiteDayPhotoReminder(site.name).catch(() => {
          // Ignore notification scheduling errors
        });
      }
    } catch (e: any) {
      setStatus(`⚠️ Submit failed: ${e?.message ?? "Unknown error"}`);
      Alert.alert("Submit failed", e?.message ?? "Unknown error");
    } finally {
      setBusySubmit(false);
    }
  }

  async function onDeleteServerScan(item: AttendanceScanDto) {
    Alert.alert(
      "Remove saved scan?",
      `Remove ${item.employee.fullName} (${item.employee.code}) from today?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await apiDeleteScan(item.id);
              await refreshToday();
              setStatus("Removed");
            } catch (e: any) {
              Alert.alert("Error", e?.message ?? "Failed to remove scan");
            }
          },
        },
      ],
    );
  }

  if (!permission?.granted) {
    return (
      <AuthStyleBackground>
        <View style={styles.scrollContainer}>
          <GlassPanel radius={5} contentPadding={16}>
            <View style={{ gap: 10 }}>
              <Text style={typography.headline}>Camera permission needed</Text>
              <Text style={typography.body}>
                We use the camera to scan guy QR cards.
              </Text>

              <Pressable style={styles.btnPrimary} onPress={requestPermission}>
                <Text style={styles.btnPrimaryText}>Allow camera</Text>
              </Pressable>
            </View>
          </GlassPanel>
        </View>
      </AuthStyleBackground>
    );
  }

  if (loading) {
    return (
      <AuthStyleBackground>
        <View style={styles.scrollContainer}>
          <GlassPanel radius={5} contentPadding={16}>
            <View style={{ alignItems: "center", gap: 10 }}>
              <ActivityIndicator color={colors.success} />
              <Text style={typography.bodyStrong}>Loading…</Text>
            </View>
          </GlassPanel>
        </View>
      </AuthStyleBackground>
    );
  }

  // Assistant foreman selection step
  if (isAssistant && !actingForeman) {
    return (
      <AuthStyleBackground>
        <View style={styles.scrollContainer}>
          <GlassPanel radius={5} contentPadding={16}>
            <View style={{ gap: 12 }}>
              <Text style={typography.headline}>Select Foreman</Text>
              <Text style={typography.body}>
                Choose which foreman you are acting for to see their sites
                and scan your team.
              </Text>

              <FlatList
                data={user?.availableForemen ?? []}
                keyExtractor={(item) => item.foremanId}
                scrollEnabled={false}
                contentContainerStyle={{ gap: 10, marginTop: 8 }}
                renderItem={({ item }) => (
                  <Pressable
                    style={styles.foremanOption}
                    onPress={() => handleSelectForeman(item)}
                  >
                    <Text style={typography.bodyStrong}>{item.name}</Text>
                    <Text style={{ fontSize: 18, fontWeight: "900", color: colors.success }}>
                      →
                    </Text>
                  </Pressable>
                )}
                ListEmptyComponent={
                  <View style={{ padding: 14 }}>
                    <Text style={typography.body}>
                      No foremen available. Please contact your supervisor.
                    </Text>
                  </View>
                }
              />
            </View>
          </GlassPanel>
        </View>
      </AuthStyleBackground>
    );
  }

  // No valid site — let the foreman pick one right here instead of sending
  // them back to home.
  if (!site) {
    return (
      <AuthStyleBackground>
        <View style={styles.scrollContainer}>
          <GlassPanel radius={5} contentPadding={16}>
            <View style={{ gap: 10 }}>
              <Text style={typography.headline}>No site selected</Text>
              <Text style={typography.body}>{status}</Text>

              <Pressable
                style={styles.siteDropdownTrigger}
                onPress={() => sites.length > 0 && setSitePickerOpen(true)}
              >
                <Ionicons
                  name="location-outline"
                  size={16}
                  color={colors.success}
                />
                <Text style={styles.siteDropdownTxt}>
                  {sites.length > 0 ? "Select a site" : "No active sites"}
                </Text>
                {sites.length > 0 && (
                  <Ionicons
                    name="chevron-down"
                    size={16}
                    color={colors.textTertiary}
                  />
                )}
              </Pressable>
            </View>
          </GlassPanel>
        </View>

        <Modal
          visible={sitePickerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setSitePickerOpen(false)}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setSitePickerOpen(false)}
          >
            <Pressable style={styles.modalSheet} onPress={() => {}}>
              <Text style={typography.label}>Select a site</Text>
              <ScrollView style={{ maxHeight: 360, marginTop: 8 }}>
                {sites.map((s) => (
                  <Pressable
                    key={s.id}
                    style={styles.modalRow}
                    onPress={() => pickSite(s)}
                  >
                    <Text style={typography.bodyStrong}>{s.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      </AuthStyleBackground>
    );
  }

  const isDayPending = day?.status === "PENDING";
  const canShowCamera = !busySubmit && isDayPending;

  return (
    <AuthStyleBackground>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Scanner */}
        <GlassPanel radius={5} contentPadding={14}>
          <View style={{ gap: 10 }}>
            <View style={styles.siteBanner}>
              <Ionicons name="location" size={20} color={colors.success} />
              <View style={{ flex: 1 }}>
                <Text style={styles.siteBannerName} numberOfLines={1}>
                  {site.name}
                </Text>
                <Text style={typography.caption}>{dateISO}</Text>
              </View>
            </View>

            <View
              style={[
                styles.cameraBox,
                canShowCamera && { borderColor: colors.successBorder },
                !canShowCamera && { backgroundColor: colors.glassFillStrong },
              ]}
            >
              {canShowCamera ? (
                <CameraView
                  style={{ flex: 1 }}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  onBarcodeScanned={(result) => {
                    const data = (result as any)?.data ?? "";
                    if (!canAcceptScanNow()) return;
                    handlePayload(String(data));
                  }}
                />
              ) : (
                <View style={styles.cameraDisabledInner}>
                  <Text style={typography.headline}>
                    {busySubmit
                      ? "Submitting batch…"
                      : `Cannot scan - day is ${(day?.status ?? "PENDING").toLowerCase()}`}
                  </Text>
                  <Text style={[typography.body, { textAlign: "center" }]}>
                    {busySubmit
                      ? "Please wait for the current submit to finish."
                      : "Once submitted or approved, scanning is disabled for this day."}
                  </Text>
                </View>
              )}
            </View>

            <Text style={typography.bodyStrong}>{status}</Text>

            <View style={styles.actions}>
              <Text style={typography.caption}>
                Batch: {batch.length} • Saved today: {serverScans.length}
              </Text>
              <Pressable style={styles.btnSecondary} onPress={refreshToday}>
                <Text style={typography.bodyStrong}>Refresh</Text>
              </Pressable>
            </View>
          </View>
        </GlassPanel>

        {/* Header */}
        <GlassPanel radius={5} contentPadding={14}>
          <View style={{ gap: 6 }}>
            <Text style={typography.title}>Scan Attendance</Text>

            {/* Acting foreman indicator for assistants */}
            {isAssistant && actingForeman ? (
              <View style={styles.actingForemanContainer}>
                <View style={styles.actingForemanPill}>
                  <Text style={styles.actingForemanText}>
                    Acting for:{" "}
                    <Text style={{ fontWeight: "900" }}>
                      {actingForeman.name}
                    </Text>
                  </Text>
                </View>
                <Pressable
                  style={styles.changeForemanBtn}
                  onPress={handleChangeForeman}
                >
                  <Text style={typography.bodyStrong}>Change</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.batchControls}>
              <Pressable
                style={[styles.batchBtnOutline, !batch.length && { opacity: 0.4 }]}
                disabled={!batch.length}
                onPress={undoLastScan}
              >
                <Text style={typography.bodyStrong}>Undo last</Text>
              </Pressable>

              <Pressable
                style={[styles.batchBtnOutline, !batch.length && { opacity: 0.4 }]}
                disabled={!batch.length}
                onPress={clearLocalBatch}
              >
                <Text style={typography.bodyStrong}>Clear batch</Text>
              </Pressable>
            </View>

            <Pressable
              style={[
                styles.submitButton,
                (!batch.length || busySubmit) && { opacity: 0.6 },
              ]}
              disabled={!batch.length || busySubmit}
              onPress={submitBatch}
            >
              {busySubmit ? (
                <>
                  <ActivityIndicator size="small" color={colors.textOnPrimary} />
                  <Text style={styles.submitButtonText}>SUBMITTING…</Text>
                </>
              ) : (
                <Text style={styles.submitButtonText}>
                  SUBMIT ({batch.length})
                </Text>
              )}
            </Pressable>

            <Text style={typography.caption}>
              Tip: Scan many cards, check batch list, then submit once. Tap a
              batch row to remove it.
            </Text>
          </View>
        </GlassPanel>

        {/* Batch list */}
        <GlassPanel radius={5} contentPadding={0}>
          <View style={styles.listHeader}>
            <Text style={typography.label}>Batch (not submitted yet)</Text>
            <Text style={typography.caption}>Tap a row to remove</Text>
          </View>

          <FlatList
            data={batch}
            keyExtractor={(code, idx) => `${code}-${idx}`}
            scrollEnabled={false} // ✅ IMPORTANT
            contentContainerStyle={{ paddingBottom: 10 }}
            renderItem={({ item }) => {
              const known = employeesByCode.get(item.toUpperCase());
              return (
                <Pressable
                  onPress={() => removeFromBatch(item)}
                  style={styles.batchRow}
                >
                  {known?.faceImageUrl ? (
                    <Image
                      source={{ uri: known.faceImageUrl }}
                      style={styles.avatar}
                    />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Text style={styles.avatarFallbackTxt}>
                        {initials(known?.fullName ?? item)}
                      </Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={typography.bodyStrong} numberOfLines={1}>
                      {known?.fullName ?? item}
                    </Text>
                    <Text style={typography.caption}>
                      {known ? item : "Unrecognized code"}
                    </Text>
                  </View>
                  <Ionicons
                    name="close-circle"
                    size={22}
                    color={colors.textTertiary}
                  />
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View style={{ padding: 14 }}>
                <Text style={typography.body}>
                  No items in batch yet. Scan guy cards to add them.
                </Text>
              </View>
            }
          />
        </GlassPanel>

        {/* Server scans list */}
        <GlassPanel radius={5} contentPadding={0}>
          <View style={styles.listHeader}>
            <Text style={typography.label}>Saved Today (server)</Text>
            <Text style={typography.caption}>Long-press to remove</Text>
          </View>

          <FlatList
            data={serverScans}
            keyExtractor={(i) => i.id}
            scrollEnabled={false} // ✅ IMPORTANT
            contentContainerStyle={{ paddingBottom: 20 }}
            renderItem={({ item }) => (
              <Pressable
                onLongPress={() => onDeleteServerScan(item)}
                style={styles.scanRow}
              >
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={typography.bodyStrong} numberOfLines={1}>
                    {item.employee.fullName}
                  </Text>
                  <Text style={typography.caption}>
                    {item.employee.code} •{" "}
                    {new Date(item.scannedAt).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>

                <View style={styles.badgeOk}>
                  <Text style={styles.badgeOkTxt}>OK</Text>
                </View>
              </Pressable>
            )}
            ListEmptyComponent={
              <View style={{ padding: 14 }}>
                <Text style={typography.body}>
                  No saved scans yet. Submit your batch to save.
                </Text>
              </View>
            }
          />
        </GlassPanel>
      </ScrollView>
    </AuthStyleBackground>
  );
}

const getStyles = (
  colors: FaceColorPalette,
  radius: { sm: number; md: number; lg: number; xl: number; pill: number },
) =>
  StyleSheet.create({
    scrollContainer: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 28,
      gap: 12,
    },

    siteBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: radius.sm,
      backgroundColor: colors.successDim,
      borderWidth: 1,
      borderColor: colors.successBorder,
    },
    siteBannerName: {
      fontSize: 17,
      fontWeight: "800",
      color: colors.textPrimary,
    },

    siteDropdownTrigger: {
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
      paddingVertical: 14,
      paddingHorizontal: 4,
      borderBottomWidth: 1,
      borderBottomColor: colors.glassBorder,
    },

    cameraBox: {
      height: 260,
      borderRadius: radius.sm,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: colors.glassBorder,
    },
    cameraDisabledInner: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 18,
      gap: 6,
    },

    actions: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },

    btnPrimary: {
      backgroundColor: colors.success,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: radius.sm,
      alignItems: "center",
    },
    btnPrimaryText: { color: colors.textOnPrimary, fontWeight: "800" },

    btnSecondary: {
      backgroundColor: colors.glassFillStrong,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: radius.sm,
      alignItems: "center",
    },

    batchControls: { flexDirection: "row", gap: 10, alignItems: "center" },

    batchBtnOutline: {
      flex: 1,
      backgroundColor: colors.glassFillStrong,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      paddingVertical: 12,
      borderRadius: radius.sm,
      alignItems: "center",
    },

    submitButton: {
      width: "100%",
      backgroundColor: colors.success,
      paddingVertical: 14,
      borderRadius: radius.sm,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 10,
      marginTop: 12,
    },
    submitButtonText: {
      color: colors.textOnPrimary,
      fontWeight: "800",
      letterSpacing: 0.5,
      fontSize: 14,
    },

    listHeader: {
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.glassBorder,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "baseline",
    },

    batchRow: {
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.glassBorder,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 10,
    },

    scanRow: {
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.glassBorder,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 10,
    },

    badgeOk: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: radius.pill,
      backgroundColor: colors.successDim,
      borderWidth: 1,
      borderColor: colors.successBorder,
    },
    badgeOkTxt: { fontWeight: "800", color: colors.success, fontSize: 12 },

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

    // Foreman selection styles
    foremanOption: {
      paddingVertical: 14,
      paddingHorizontal: 14,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      backgroundColor: colors.glassFillStrong,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },

    // Acting foreman indicator styles
    actingForemanContainer: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 4,
      flexWrap: "wrap",
    },
    actingForemanPill: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: radius.pill,
      backgroundColor: colors.primaryDim,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    actingForemanText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.primary,
    },
    changeForemanBtn: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: radius.pill,
      backgroundColor: colors.glassFillStrong,
      borderWidth: 1,
      borderColor: colors.glassBorder,
    },
  });
