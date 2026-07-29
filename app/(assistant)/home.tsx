import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import { GlassCard } from "@/components/GlassCard";
import { useTheme } from "@/lib/themeContext";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useLocalSearchParams } from "expo-router";
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
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";

import {
    recordPendingScan,
    recordSubmittedBatch,
} from "@/lib/assistantHistoryStore";
import {
    apiAttendanceTodayCached,
    apiDeleteScan,
    apiScanBulk,
    apiSitesCached,
    type AttendanceDayDto,
    type AttendanceScanDto,
    type Site,
} from "../../lib/apiClient";
import { useAuth, type ForemanOption } from "../../lib/auth";
import { clearBatch, getBatch, setBatch } from "../../lib/batchPrefs";
import { getSelectedSiteId, setSelectedSiteId } from "../../lib/sitePrefs";
import { useLocation } from "../../lib/useLocation";

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function extractEmployeeCode(payload: string): string | null {
  const raw = String(payload ?? "").trim();
  if (!raw) return null;

  let code = raw.toUpperCase();
  const colonIdx = code.indexOf(":");
  if (colonIdx !== -1) code = code.slice(colonIdx + 1).trim();
  code = code.replace(/\s+/g, "");
  return code.length > 0 ? code : null;
}

export default function AssistantScan() {
  const params = useLocalSearchParams<{ siteId?: string }>();
  const dateISO = useMemo(() => todayISO(), []);

  const { theme } = useTheme();
  const isDark = theme === "dark";

  const { user, setActingForeman } = useAuth();

  // assistant is defined by having availableForemen
  const isAssistant = useMemo(
    () => (user?.availableForemen ?? []).length > 0,
    [user?.availableForemen],
  );
  const actingForeman = user?.actingForeman ?? null;

  const [permission, requestPermission] = useCameraPermissions();
  const { getLocationWithAddress } = useLocation();
  const [loading, setLoading] = useState(true);
  const [busySubmit, setBusySubmit] = useState(false);

  const [sites, setSites] = useState<Site[]>([]);
  const [site, setSite] = useState<Site | null>(null);
  const [siteModalOpen, setSiteModalOpen] = useState(false);

  const [day, setDay] = useState<AttendanceDayDto | null>(null);
  const serverScans = day?.scans ?? [];

  // Local batch
  const [batch, setBatchState] = useState<string[]>([]);
  const batchSet = useMemo(
    () => new Set(batch.map((x) => x.toUpperCase())),
    [batch],
  );

  const serverSet = useMemo(() => {
    const s = new Set<string>();
    for (const scan of serverScans) {
      s.add(String(scan.employee.code ?? "").toUpperCase());
    }
    return s;
  }, [serverScans]);

  const [status, setStatus] = useState<string>("Loading…");

  // throttle scan
  const lastScanAtRef = useRef<number>(0);
  function canAcceptScanNow() {
    const now = Date.now();
    if (now - lastScanAtRef.current < 650) return false;
    lastScanAtRef.current = now;
    return true;
  }

  const loadSitesAndSelect = useCallback(async () => {
    // assistants MUST select a foreman first
    if (isAssistant && !actingForeman) {
      setLoading(false);
      setStatus("Select a foreman first.");
      return;
    }

    setLoading(true);
    try {
      const sres = await apiSitesCached();
      const list = (sres.sites ?? []).filter((x) => x.active !== false);
      setSites(list);

      const paramSiteId =
        typeof params.siteId === "string" ? params.siteId : null;
      const saved = await getSelectedSiteId();

      const initial =
        (paramSiteId &&
          list.some((x) => x.id === paramSiteId) &&
          paramSiteId) ||
        (saved && list.some((x) => x.id === saved) && saved) ||
        list[0]?.id ||
        null;

      if (initial) {
        const selected = list.find((x) => x.id === initial) ?? null;
        setSite(selected);
        await setSelectedSiteId(initial);

        const savedBatch = await getBatch(initial, dateISO);
        setBatchState(savedBatch);
      } else {
        setSite(null);
        setBatchState([]);
      }
    } catch (e: any) {
      setStatus(e?.message ?? "Failed to load sites.");
    } finally {
      setLoading(false);
    }
  }, [params.siteId, dateISO, isAssistant, actingForeman]);

  const refreshToday = useCallback(async () => {
    if (!site) {
      setDay(null);
      setStatus("Select a site to start scanning.");
      return;
    }

    try {
      const dres = await apiAttendanceTodayCached(site.id);
      setDay(dres.day);
      setStatus("Scan employee cards (batch mode)…");
    } catch (e: any) {
      setStatus(e?.message ?? "Failed to load today.");
      setDay(null);
    }
  }, [site]);

  const handleSelectForeman = useCallback(
    async (foreman: ForemanOption) => {
      try {
        await setActingForeman(foreman);
        // Sites will reload via useEffect when actingForeman changes
      } catch (e: any) {
        Alert.alert("Error", e?.message ?? "Failed to select foreman");
      }
    },
    [setActingForeman],
  );

  const handleChangeForeman = useCallback(async () => {
    await setActingForeman(null);
    setSites([]);
    setSite(null);
    setDay(null);
    setBatchState([]);
    setStatus("Select a foreman first.");
  }, [setActingForeman]);

  useEffect(() => {
    loadSitesAndSelect();
  }, [loadSitesAndSelect]);

  useEffect(() => {
    refreshToday();
  }, [refreshToday]);

  useEffect(() => {
    if (!site) return;
    setBatch(site.id, dateISO, batch).catch(() => {});
  }, [batch, site, dateISO]);

  async function handlePayload(payload: string) {
    if (!site) return;

    const code = extractEmployeeCode(payload);
    if (!code) {
      setStatus("⚠️ Not an employee card QR");
      return;
    }

    const key = code.toUpperCase();

    if (serverSet.has(key)) {
      setStatus(`ℹ️ Already saved today: ${code}`);
      return;
    }
    if (batchSet.has(key)) {
      setStatus(`ℹ️ Already in batch: ${code}`);
      return;
    }

    setBatchState((prev) => [...prev, code]);
    setStatus(`➕ Added to batch: ${code}`);

    // record "pending" immediately so History feels alive
    await recordPendingScan({
      dateISO,
      siteId: site.id,
      siteName: site.name,
      code,
      actingForemanId: actingForeman?.foremanId ?? null,
      actingForemanName: actingForeman?.name ?? null,
    });
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

    const sentCodes = [...batch];

    try {
      // Get device location — required for submission
      const location = await getLocationWithAddress();
      if (!location) {
        setStatus("⚠️ Could not get location. Please enable location services.");
        Alert.alert(
          "Location Required",
          "Could not get your location.\n\nOn Huawei: go to Settings → Location, enable it and set mode to 'High accuracy'. Also go to Settings → Battery → App launch and disable battery optimization for this app.",
        );
        setBusySubmit(false);
        return;
      }

      setStatus("Submitting batch…");

      const res = await apiScanBulk(site.id, dateISO, sentCodes, {
        latitude: location.latitude,
        longitude: location.longitude,
        address: location.address,
      });

      // record submitted history with per-item result (assumes results align by index)
      await recordSubmittedBatch({
        dateISO,
        siteId: site.id,
        siteName: site.name,
        codes: sentCodes,
        results: Array.isArray(res?.results) ? res.results : [],
        actingForemanId: actingForeman?.foremanId ?? null,
        actingForemanName: actingForeman?.name ?? null,
      });

      await refreshToday();

      setBatchState([]);
      await clearBatch(site.id, dateISO);

      const created = (res.results ?? []).filter(
        (r: { status: string }) => r.status === "CREATED",
      ).length;
      const dupes = (res.results ?? []).filter(
        (r: { status: string }) => r.status === "ALREADY_SCANNED",
      ).length;
      const unknown = (res.results ?? []).filter(
        (r: { status: string }) => r.status === "UNKNOWN",
      ).length;
      const inactive = (res.results ?? []).filter(
        (r: { status: string }) => r.status === "INACTIVE",
      ).length;

      const parts: string[] = [];
      parts.push(`Saved: ${created}`);
      if (dupes) parts.push(`Already scanned: ${dupes}`);
      if (unknown) parts.push(`Unknown: ${unknown}`);
      if (inactive) parts.push(`Inactive: ${inactive}`);

      Alert.alert("Batch submitted", parts.join("\n"));
      setStatus(`✅ Submitted. Saved ${created}.`);
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
          <GlassCard style={{ padding: 16, gap: 10 }}>
            <Text style={[styles.h1, { color: isDark ? "#fff" : "#111" }]}>
              Camera permission needed
            </Text>
            <Text style={[styles.sub, { color: isDark ? "#94a3b8" : "#666" }]}>
              We use the camera to scan employee QR cards.
            </Text>
            <Pressable style={styles.btnPrimary} onPress={requestPermission}>
              <Text style={styles.btnPrimaryText}>Allow camera</Text>
            </Pressable>
          </GlassCard>
        </View>
      </AuthStyleBackground>
    );
  }

  if (loading) {
    return (
      <AuthStyleBackground>
        <View style={styles.scrollContainer}>
          <GlassCard style={{ padding: 16, alignItems: "center", gap: 10 }}>
            <ActivityIndicator color={isDark ? "#fff" : "#666"} />
            <Text
              style={{
                color: isDark ? "#94a3b8" : "#666",
                fontWeight: "900",
              }}
            >
              Loading…
            </Text>
          </GlassCard>
        </View>
      </AuthStyleBackground>
    );
  }

  // assistant foreman selection step
  if (isAssistant && !actingForeman) {
    return (
      <AuthStyleBackground>
        <View style={styles.scrollContainer}>
          <GlassCard style={{ padding: 16, gap: 12 }}>
            <Text style={[styles.h1, { color: isDark ? "#fff" : "#111" }]}>
              Select Foreman
            </Text>
            <Text style={[styles.sub, { color: isDark ? "#94a3b8" : "#666" }]}>
              Choose which foreman you are acting for to see their sites and
              scan your team.
            </Text>

            <FlatList
              data={user?.availableForemen ?? []}
              keyExtractor={(item) => item.foremanId}
              scrollEnabled={false}
              contentContainerStyle={{ gap: 10, marginTop: 8 }}
              renderItem={({ item }) => (
                <Pressable
                  style={[
                    styles.foremanOption,
                    {
                      backgroundColor: isDark
                        ? "rgba(255,255,255,0.08)"
                        : "rgba(255,255,255,0.7)",
                      borderColor: isDark
                        ? "rgba(255,255,255,0.12)"
                        : "rgba(0,0,0,0.08)",
                    },
                  ]}
                  onPress={() => handleSelectForeman(item)}
                >
                  <Text
                    style={[
                      styles.foremanOptionText,
                      { color: isDark ? "#fff" : "#111" },
                    ]}
                  >
                    {item.name}
                  </Text>
                  <Text
                    style={[
                      styles.foremanOptionArrow,
                      { color: isDark ? "#38bdf8" : NAVY },
                    ]}
                  >
                    →
                  </Text>
                </Pressable>
              )}
              ListEmptyComponent={
                <View style={{ padding: 14 }}>
                  <Text
                    style={{
                      color: isDark ? "#94a3b8" : "#666",
                      fontWeight: "800",
                    }}
                  >
                    No foremen available. Please contact your supervisor.
                  </Text>
                </View>
              }
            />
          </GlassCard>
        </View>
      </AuthStyleBackground>
    );
  }

  const isDayPending = day?.status === "PENDING";
  const canShowCamera = site && !busySubmit && isDayPending;

  return (
    <AuthStyleBackground>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Scanner */}
        <GlassCard style={{ padding: 14, gap: 10 }}>
          <View
            style={[
              styles.cameraBox,
              {
                borderColor: isDark
                  ? "rgba(255,255,255,0.1)"
                  : "rgba(0,0,0,0.1)",
              },
              (!site || busySubmit || day?.status !== "PENDING") && {
                backgroundColor: isDark
                  ? "rgba(0,0,0,0.3)"
                  : "rgba(255,255,255,0.65)",
              },
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
                <Text
                  style={[
                    styles.cameraDisabledTitle,
                    { color: isDark ? "#fff" : "#111" },
                  ]}
                >
                  {busySubmit
                    ? "Submitting batch…"
                    : day?.status && day.status !== "PENDING"
                      ? `Cannot scan - day is ${day.status.toLowerCase()}`
                      : "Select a site to start scanning"}
                </Text>
                <Text
                  style={[
                    styles.cameraDisabledSub,
                    { color: isDark ? "#94a3b8" : "#666" },
                  ]}
                >
                  {busySubmit
                    ? "Please wait for the current submit to finish."
                    : day?.status && day.status !== "PENDING"
                      ? "Once submitted or approved, scanning is disabled for this day."
                      : "Choose a site above, then point the camera at an employee QR card."}
                </Text>
              </View>
            )}
          </View>

          <Text style={[styles.status, { color: isDark ? "#fff" : "#111" }]}>
            {status}
          </Text>

          <View style={styles.actions}>
            <Text style={[styles.count, { color: isDark ? "#fff" : "#111" }]}>
              Batch: {batch.length} • Saved today: {serverScans.length}
            </Text>
            <Pressable
              style={[
                styles.btnSecondary,
                {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.1)"
                    : "rgba(255,255,255,0.7)",
                  borderColor: isDark
                    ? "rgba(255,255,255,0.15)"
                    : "rgba(0,0,0,0.08)",
                },
              ]}
              onPress={refreshToday}
            >
              <Text
                style={[
                  styles.btnSecondaryText,
                  { color: isDark ? "#fff" : "#111" },
                ]}
              >
                Refresh
              </Text>
            </Pressable>
          </View>
        </GlassCard>

        {/* Header */}
        <GlassCard style={{ padding: 14, gap: 6 }}>
          <Text style={[styles.h1, { color: isDark ? "#fff" : "#111" }]}>
            Assistant Scan
          </Text>

          {actingForeman ? (
            <View style={styles.actingForemanContainer}>
              <View
                style={[
                  styles.actingForemanPill,
                  {
                    backgroundColor: isDark
                      ? "rgba(56,189,248,0.15)"
                      : "rgba(38,45,104,0.12)",
                    borderColor: isDark
                      ? "rgba(56,189,248,0.25)"
                      : "rgba(38,45,104,0.18)",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.actingForemanText,
                    { color: isDark ? "#38bdf8" : NAVY },
                  ]}
                >
                  Acting for:{" "}
                  <Text style={{ fontWeight: "900" }}>
                    {actingForeman.name}
                  </Text>
                </Text>
              </View>

              <Pressable
                style={[
                  styles.changeForemanBtn,
                  {
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.1)"
                      : "rgba(255,255,255,0.7)",
                    borderColor: isDark
                      ? "rgba(255,255,255,0.15)"
                      : "rgba(0,0,0,0.08)",
                  },
                ]}
                onPress={handleChangeForeman}
              >
                <Text
                  style={[
                    styles.changeForemanBtnTxt,
                    { color: isDark ? "#fff" : "#111" },
                  ]}
                >
                  Change
                </Text>
              </Pressable>
            </View>
          ) : null}

          <Text style={[styles.sub, { color: isDark ? "#94a3b8" : "#666" }]}>
            {site
              ? `Site: ${site.name} • Date: ${dateISO}`
              : `Date: ${dateISO} • Select a site to start scanning.`}
          </Text>

          <Pressable
            style={[
              styles.sitePicker,
              {
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.08)"
                  : "rgba(255,255,255,0.65)",
                borderColor: isDark
                  ? "rgba(255,255,255,0.12)"
                  : "rgba(0,0,0,0.08)",
              },
            ]}
            onPress={() => setSiteModalOpen(true)}
          >
            <View>
              <Text
                style={[
                  styles.sitePickerLabel,
                  { color: isDark ? "#94a3b8" : "#666" },
                ]}
              >
                Site
              </Text>
              <Text
                style={[
                  styles.sitePickerValue,
                  { color: isDark ? "#fff" : "#111" },
                ]}
              >
                {site ? site.name : "Tap to choose a site"}
              </Text>
            </View>
            <Text style={[styles.chev, { color: isDark ? "#fff" : "#111" }]}>
              ▾
            </Text>
          </Pressable>

          <View style={styles.batchControls}>
            <Pressable
              style={[
                styles.batchBtnOutline,
                {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.08)"
                    : "rgba(255,255,255,0.70)",
                  borderColor: isDark
                    ? "rgba(255,255,255,0.12)"
                    : "rgba(0,0,0,0.10)",
                  opacity: batch.length ? 1 : 0.4,
                },
              ]}
              disabled={!batch.length}
              onPress={undoLastScan}
            >
              <Text
                style={[
                  styles.batchBtnOutlineText,
                  { color: isDark ? "#fff" : "#111" },
                ]}
              >
                Undo last
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.batchBtnOutline,
                {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.08)"
                    : "rgba(255,255,255,0.70)",
                  borderColor: isDark
                    ? "rgba(255,255,255,0.12)"
                    : "rgba(0,0,0,0.10)",
                  opacity: batch.length ? 1 : 0.4,
                },
              ]}
              disabled={!batch.length}
              onPress={clearLocalBatch}
            >
              <Text
                style={[
                  styles.batchBtnOutlineText,
                  { color: isDark ? "#fff" : "#111" },
                ]}
              >
                Clear batch
              </Text>
            </Pressable>
          </View>

          <Pressable
            style={[
              styles.submitButton,
              (!site || !batch.length || busySubmit) && { opacity: 0.6 },
            ]}
            disabled={!site || !batch.length || busySubmit}
            onPress={submitBatch}
          >
            {busySubmit ? (
              <>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.submitButtonText}>SUBMITTING…</Text>
              </>
            ) : (
              <Text style={styles.submitButtonText}>
                SUBMIT ({batch.length})
              </Text>
            )}
          </Pressable>

          <Text style={[styles.hint, { color: isDark ? "#94a3b8" : "#666" }]}>
            Tip: Scan many cards, check batch list, then submit once. Tap a
            batch row to remove it.
          </Text>
        </GlassCard>

        {/* Batch list */}
        <GlassCard style={{ padding: 0 }}>
          <View
            style={[
              styles.listHeader,
              {
                borderBottomColor: isDark
                  ? "rgba(255,255,255,0.08)"
                  : "rgba(0,0,0,0.06)",
              },
            ]}
          >
            <Text
              style={[
                styles.listHeaderTitle,
                { color: isDark ? "#fff" : "#111" },
              ]}
            >
              Batch (not submitted yet)
            </Text>
            <Text
              style={[
                styles.listHeaderHint,
                { color: isDark ? "#94a3b8" : "#666" },
              ]}
            >
              Tap a row to remove
            </Text>
          </View>

          <FlatList
            data={batch}
            keyExtractor={(code, idx) => `${code}-${idx}`}
            scrollEnabled={false}
            contentContainerStyle={{ paddingBottom: 10 }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => removeFromBatch(item)}
                style={[
                  styles.batchRow,
                  {
                    borderBottomColor: isDark
                      ? "rgba(255,255,255,0.08)"
                      : "rgba(0,0,0,0.06)",
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.batchCode,
                      { color: isDark ? "#fff" : "#111" },
                    ]}
                  >
                    {item}
                  </Text>
                  <Text
                    style={[
                      styles.batchMeta,
                      { color: isDark ? "#94a3b8" : "#666" },
                    ]}
                  >
                    Tap to remove
                  </Text>
                </View>
                <View
                  style={[
                    styles.badge,
                    styles.badgeBatch,
                    {
                      backgroundColor: isDark
                        ? "rgba(56,189,248,0.15)"
                        : "rgba(38,45,104,0.12)",
                      borderColor: isDark
                        ? "rgba(56,189,248,0.25)"
                        : "rgba(38,45,104,0.18)",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeTxt,
                      styles.badgeBatchTxt,
                      { color: isDark ? "#38bdf8" : NAVY },
                    ]}
                  >
                    BATCH
                  </Text>
                </View>
              </Pressable>
            )}
            ListEmptyComponent={
              <View style={{ padding: 14 }}>
                <Text
                  style={{
                    color: isDark ? "#94a3b8" : "#666",
                    fontWeight: "800",
                  }}
                >
                  No items in batch yet. Scan employee cards to add them.
                </Text>
              </View>
            }
          />
        </GlassCard>

        {/* Server scans list */}
        <GlassCard style={{ padding: 0 }}>
          <View
            style={[
              styles.listHeader,
              {
                borderBottomColor: isDark
                  ? "rgba(255,255,255,0.08)"
                  : "rgba(0,0,0,0.06)",
              },
            ]}
          >
            <Text
              style={[
                styles.listHeaderTitle,
                { color: isDark ? "#fff" : "#111" },
              ]}
            >
              Saved Today (server)
            </Text>
            <Text
              style={[
                styles.listHeaderHint,
                { color: isDark ? "#94a3b8" : "#666" },
              ]}
            >
              Long-press to remove
            </Text>
          </View>

          <FlatList
            data={serverScans}
            keyExtractor={(i) => i.id}
            scrollEnabled={false}
            contentContainerStyle={{ paddingBottom: 20 }}
            renderItem={({ item }) => (
              <Pressable
                onLongPress={() => onDeleteServerScan(item)}
                style={[
                  styles.scanRow,
                  {
                    borderBottomColor: isDark
                      ? "rgba(255,255,255,0.08)"
                      : "rgba(0,0,0,0.06)",
                  },
                ]}
              >
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text
                    style={[
                      styles.scanName,
                      { color: isDark ? "#fff" : "#111" },
                    ]}
                    numberOfLines={1}
                  >
                    {item.employee.fullName}
                  </Text>
                  <Text
                    style={[
                      styles.scanMeta,
                      { color: isDark ? "#94a3b8" : "#666" },
                    ]}
                  >
                    {item.employee.code} •{" "}
                    {new Date(item.scannedAt).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>

                <View style={styles.badge}>
                  <Text style={styles.badgeTxt}>OK</Text>
                </View>
              </Pressable>
            )}
            ListEmptyComponent={
              <View style={{ padding: 14 }}>
                <Text
                  style={{
                    color: isDark ? "#94a3b8" : "#666",
                    fontWeight: "800",
                  }}
                >
                  {site
                    ? "No saved scans yet. Submit your batch to save."
                    : "Select a site to begin."}
                </Text>
              </View>
            }
          />
        </GlassCard>

        {/* Site picker */}
        <Modal visible={siteModalOpen} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View
              style={[
                styles.modalContent,
                {
                  backgroundColor: isDark ? "#1e293b" : "#fff",
                },
              ]}
            >
              <View
                style={[
                  styles.modalHeader,
                  {
                    borderBottomColor: isDark
                      ? "rgba(255,255,255,0.12)"
                      : "rgba(0,0,0,0.08)",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.modalTitle,
                    { color: isDark ? "#fff" : "#111" },
                  ]}
                >
                  Select a Site
                </Text>
                <Pressable onPress={() => setSiteModalOpen(false)}>
                  <Text
                    style={[
                      styles.modalClose,
                      { color: isDark ? "#94a3b8" : "#666" },
                    ]}
                  >
                    ✕
                  </Text>
                </Pressable>
              </View>

              <FlatList
                data={sites}
                keyExtractor={(s) => s.id}
                renderItem={({ item }) => (
                  <Pressable
                    style={[
                      styles.siteOption,
                      {
                        borderBottomColor: isDark
                          ? "rgba(255,255,255,0.08)"
                          : "rgba(0,0,0,0.06)",
                      },
                      site?.id === item.id && {
                        backgroundColor: isDark
                          ? "rgba(56,189,248,0.15)"
                          : "rgba(38,45,104,0.08)",
                      },
                    ]}
                    onPress={async () => {
                      setSite(item);
                      await setSelectedSiteId(item.id);
                      setSiteModalOpen(false);
                      await refreshToday();
                    }}
                  >
                    <Text
                      style={[
                        styles.siteOptionText,
                        { color: isDark ? "#fff" : "#111" },
                        site?.id === item.id && {
                          color: isDark ? "#38bdf8" : NAVY,
                        },
                      ]}
                    >
                      {item.name}
                    </Text>
                    {site?.id === item.id && (
                      <Text
                        style={[
                          styles.siteCheckmark,
                          { color: isDark ? "#38bdf8" : NAVY },
                        ]}
                      >
                        ✓
                      </Text>
                    )}
                  </Pressable>
                )}
              />

              <Pressable
                style={[
                  styles.modalCloseButton,
                  { backgroundColor: isDark ? "#38bdf8" : NAVY },
                ]}
                onPress={() => setSiteModalOpen(false)}
              >
                <Text style={styles.modalCloseButtonText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </AuthStyleBackground>
  );
}

const NAVY = "#262D68";

const styles = StyleSheet.create({
  scrollContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    gap: 12,
  },

  h1: { fontSize: 18, fontWeight: "900", color: "#111" },
  sub: { color: "#666", fontWeight: "800" },
  hint: { color: "#666", fontWeight: "800", fontSize: 12 },

  sitePicker: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    backgroundColor: "rgba(255,255,255,0.65)",
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sitePickerLabel: { color: "#666", fontSize: 12, fontWeight: "900" },
  sitePickerValue: {
    fontWeight: "900",
    fontSize: 14,
    marginTop: 2,
    color: "#111",
  },
  chev: { fontSize: 18, fontWeight: "900", color: "#111" },

  cameraBox: {
    height: 260,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
  },
  cameraBoxDisabled: { backgroundColor: "rgba(255,255,255,0.65)" },
  cameraDisabledInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    gap: 6,
  },
  cameraDisabledTitle: { fontWeight: "900", fontSize: 16, color: "#111" },
  cameraDisabledSub: { color: "#666", textAlign: "center", fontWeight: "700" },

  status: { fontWeight: "900", color: "#111" },

  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  count: { fontWeight: "900", color: "#111" },

  btnPrimary: {
    backgroundColor: NAVY,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  btnPrimaryText: { color: "#fff", fontWeight: "900" },

  btnSecondary: {
    backgroundColor: "rgba(255,255,255,0.7)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  btnSecondaryText: { color: "#111", fontWeight: "900" },

  batchControls: { flexDirection: "row", gap: 10, alignItems: "center" },
  batchBtnOutline: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.70)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  batchBtnOutlineText: { color: "#111", fontWeight: "900" },

  submitButton: {
    width: "100%",
    backgroundColor: NAVY,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  submitButtonText: {
    color: "#fff",
    fontWeight: "900",
    letterSpacing: 0.5,
    fontSize: 14,
  },

  listHeader: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  listHeaderTitle: { fontWeight: "900", color: "#111", fontSize: 13 },
  listHeaderHint: { fontWeight: "800", color: "#666", fontSize: 12 },

  batchRow: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  batchCode: { fontWeight: "900", fontSize: 14, color: "#111" },
  batchMeta: { color: "#666", marginTop: 2, fontSize: 12, fontWeight: "800" },

  scanRow: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  scanName: { fontWeight: "900", fontSize: 14, color: "#111" },
  scanMeta: { color: "#666", marginTop: 2, fontSize: 12, fontWeight: "800" },

  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(0,180,80,0.10)",
    borderWidth: 1,
    borderColor: "rgba(0,180,80,0.15)",
  },
  badgeTxt: { fontWeight: "900", color: "#1a7f37" },

  badgeBatch: {
    backgroundColor: "rgba(38,45,104,0.12)",
    borderColor: "rgba(38,45,104,0.18)",
  },
  badgeBatchTxt: { color: NAVY },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 14,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    marginBottom: 10,
  },
  modalTitle: { fontSize: 16, fontWeight: "900", color: "#111" },
  modalClose: { fontWeight: "900", fontSize: 20, color: "#111" },
  modalCloseButton: {
    backgroundColor: "rgba(255,255,255,0.7)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 14,
    marginBottom: 14,
  },
  modalCloseButtonText: { fontWeight: "900", color: "#111" },

  siteOption: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    marginBottom: 10,
    backgroundColor: "rgba(255,255,255,0.7)",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  siteOptionSelected: { backgroundColor: NAVY, borderColor: NAVY },
  siteOptionText: { fontWeight: "900", fontSize: 14, color: "#111" },
  siteOptionTextSelected: { color: "#fff" },
  siteCheckmark: { fontWeight: "900", fontSize: 18, color: "#fff" },

  foremanOption: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    backgroundColor: "rgba(255,255,255,0.7)",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  foremanOptionText: { fontWeight: "900", fontSize: 16, color: "#111" },
  foremanOptionArrow: { fontSize: 18, color: NAVY, fontWeight: "900" },

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
    borderRadius: 999,
    backgroundColor: "rgba(38,45,104,0.12)",
    borderWidth: 1,
    borderColor: "rgba(38,45,104,0.18)",
  },
  actingForemanText: { fontSize: 12, fontWeight: "600", color: NAVY },
  changeForemanBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.7)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  changeForemanBtnTxt: { fontSize: 12, fontWeight: "900", color: "#111" },
});
