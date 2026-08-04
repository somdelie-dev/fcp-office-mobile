import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { CameraView, useCameraPermissions } from "expo-camera";
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
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { setAudioModeAsync, useAudioPlayer } from "expo-audio";
import * as LocalAuthentication from "expo-local-authentication";

import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import { GlassCard } from "@/components/GlassCard";
import LoadingOverlay from "@/components/LoadingOverlay";
import { useTheme } from "@/lib/themeContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useLocation } from "@/lib/useLocation";
import { getFortnightForDate } from "@/lib/fortnight";
import {
  apiSupervisorSites,
  apiSupervisorSiteDetail,
  apiSupervisorSiteToday,
  apiSupervisorSiteScansToday,
  apiSupervisorScanBulk,
  type SupervisorSiteDetailDto,
  type SupervisorSiteListItemDto,
} from "@/lib/apiClient";

function joburgISODate(d = new Date()) {
  // en-CA, timeZone Africa/Johannesburg => YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function prettyWorkDate(dateISO: string) {
  const date = new Date(`${dateISO}T00:00:00`);
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function normalizeEmployeeCode(raw: string) {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function extractEmployeeCode(payload: string): string | null {
  const raw = String(payload ?? "").trim();
  if (!raw) return null;

  let code = raw.toUpperCase();

  const colonIdx = code.indexOf(":");
  if (colonIdx !== -1) code = code.slice(colonIdx + 1).trim();

  code = code.replace(/\s+/g, "");
  return code.length ? code : null;
}

type SiteOption = SupervisorSiteListItemDto;

type ForemanOption = { foremanId: string; name: string };

export default function SupervisorScanScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const colors = useMemo(() => {
    const dark = {
      textPrimary: "#e5e7eb",
      textSecondary: "#94a3b8",
      border: "rgba(148,163,184,0.15)",
      cardBg: "rgba(15,23,42,0.85)",
      accent: "#38bdf8",
      ok: "#22c55e",
      error: "#ef4444",
      accentBg: "rgba(56,189,248,0.12)",
    };
    const light = {
      textPrimary: "#0f172a",
      textSecondary: "#64748b",
      border: "rgba(0,0,0,0.08)",
      cardBg: "rgba(255,255,255,0.85)",
      accent: "#262D68",
      ok: "#16a34a",
      error: "#dc2626",
      accentBg: "rgba(38,45,104,0.08)",
    };
    return theme === "dark" ? dark : light;
  }, [theme]);

  const { getLocationWithAddress } = useLocation();
  const [permission, requestPermission] = useCameraPermissions();

  const okPlayer = useAudioPlayer(require("@/assets/sounds/beep.mp3"));
  const errPlayer = useAudioPlayer(require("@/assets/sounds/error.mp3"));

  const playOk = useCallback(() => {
    try {
      okPlayer?.seekTo(0);
      okPlayer?.play();
    } catch {}
  }, [okPlayer]);

  const playErr = useCallback(() => {
    try {
      errPlayer?.seekTo(0);
      errPlayer?.play();
    } catch {}
  }, [errPlayer]);

  const [loading, setLoading] = useState(true);
  const [busySubmit, setBusySubmit] = useState(false);
  const [foremenLoading, setForemenLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [siteModalOpen, setSiteModalOpen] = useState(true);
  const [foremanModalOpen, setForemanModalOpen] = useState(false);

  const [sites, setSites] = useState<SiteOption[]>([]);
  const [selectedSite, setSelectedSite] = useState<SiteOption | null>(null);

  const [foremen, setForemen] = useState<ForemanOption[]>([]);
  const [selectedForemanId, setSelectedForemanId] = useState<string | null>(
    null,
  );
  const [requiresSupervisorAuth, setRequiresSupervisorAuth] = useState(false);

  const [searchForemen, setSearchForemen] = useState("");

  const [searchSites, setSearchSites] = useState("");

  const todayISO = useMemo(() => joburgISODate(), []);
  const currentFortnight = useMemo(
    () => getFortnightForDate(todayISO),
    [todayISO],
  );
  const workDateOptions = useMemo(() => {
    const result: string[] = [];
    const start = new Date(`${currentFortnight.startISO}T00:00:00`);
    const end = new Date(`${todayISO}T00:00:00`);
    for (
      let date = new Date(start);
      date <= end;
      date.setDate(date.getDate() + 1)
    ) {
      result.push(joburgISODate(date));
    }
    return result.reverse();
  }, [currentFortnight.startISO, todayISO]);
  const [selectedDates, setSelectedDates] = useState<string[]>([todayISO]);
  const selectedDatesKey = useMemo(
    () => [...selectedDates].sort().join(","),
    [selectedDates],
  );
  const focusDate = useMemo(() => {
    if (!selectedDates.length) return todayISO;
    return [...selectedDates].sort().at(-1)!;
  }, [selectedDates, todayISO]);

  const toggleDate = useCallback((workDate: string) => {
    setSelectedDates((prev) => {
      if (prev.includes(workDate)) {
        if (prev.length === 1) return prev;
        return prev.filter((d) => d !== workDate);
      }
      return [...prev, workDate];
    });
  }, []);

  const [batch, setBatch] = useState<string[]>([]);
  const batchSet = useMemo(
    () => new Set(batch.map((x) => x.toUpperCase())),
    [batch],
  );

  const [dayInfoByDate, setDayInfoByDate] = useState<
    Record<string, { isLocked: boolean; scans: any[] }>
  >({});
  const serverScans = dayInfoByDate[focusDate]?.scans ?? [];
  const allSelectedDatesLocked =
    selectedDates.length > 0 &&
    selectedDates.every((d) => dayInfoByDate[d]?.isLocked);
  const [siteDayLoading, setSiteDayLoading] = useState(false);

  const [manualInput, setManualInput] = useState("");

  const lastScanAtRef = useRef<number>(0);
  const siteDayRequestRef = useRef(0);

  const canAcceptScanNow = useCallback(() => {
    const now = Date.now();
    if (now - lastScanAtRef.current < 650) return false;
    lastScanAtRef.current = now;
    return true;
  }, []);

  const loadSites = useCallback(async () => {
    setError(null);
    try {
      const res = await apiSupervisorSites({ show: "active" });
      setSites(res.sites ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load sites.");
      setSites([]);
    }
  }, []);

  const loadForemenForSite = useCallback(async (siteId: string) => {
    setForemenLoading(true);
    setError(null);
    setRequiresSupervisorAuth(false);
    try {
      const detail = (await apiSupervisorSiteDetail(
        siteId,
      )) as SupervisorSiteDetailDto;
      setRequiresSupervisorAuth(
        Boolean(detail.site?.manualAttendanceRequiresSupervisorFingerprint),
      );
      const assigned = detail.assignedForemen ?? [];

      const mapped: ForemanOption[] = assigned
        .filter((f) => !!f.foremanId)
        .map((f) => ({ foremanId: f.foremanId, name: f.name }));

      setForemen(mapped);

      if (mapped.length) {
        setSelectedForemanId((prev) =>
          prev && mapped.some((m) => m.foremanId === prev)
            ? prev
            : mapped[0].foremanId,
        );
      } else {
        setSelectedForemanId(null);
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to load foremen.");
      setForemen([]);
      setSelectedForemanId(null);
    } finally {
      setForemenLoading(false);
    }
  }, []);

  const loadSiteDay = useCallback(
    async (siteId: string, workDates: string[]) => {
      const requestId = siteDayRequestRef.current + 1;
      siteDayRequestRef.current = requestId;
      setSiteDayLoading(true);
      setError(null);
      setDayInfoByDate({});
      try {
        const entries = await Promise.all(
          workDates.map(async (workDateISO) => {
            const [todayRes, scansRes] = await Promise.all([
              apiSupervisorSiteToday(siteId, workDateISO),
              apiSupervisorSiteScansToday(siteId, workDateISO),
            ]);
            return [
              workDateISO,
              {
                isLocked: !!todayRes.data?.isLocked,
                scans: scansRes?.scans ?? [],
              },
            ] as const;
          }),
        );

        if (siteDayRequestRef.current !== requestId) return;
        setDayInfoByDate(Object.fromEntries(entries));
      } catch (e: any) {
        if (siteDayRequestRef.current !== requestId) return;
        setError(e?.message ?? "Failed to load scans for the selected day(s).");
        setDayInfoByDate({});
      } finally {
        if (siteDayRequestRef.current === requestId) {
          setSiteDayLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      await setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
      try {
        await loadSites();
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [loadSites]);

  useFocusEffect(
    useCallback(() => {
      setSiteModalOpen(true);
      setSearchSites("");
    }, []),
  );

  useEffect(() => {
    if (!selectedSite?.id || !selectedDates.length) return;
    loadSiteDay(selectedSite.id, selectedDates);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSite?.id, selectedDatesKey, loadSiteDay]);

  useEffect(() => {
    setBatch([]);
  }, [selectedForemanId, selectedDatesKey]);

  const parseJobNumberFromCode = useCallback((raw?: string) => {
    const s = String(raw ?? "").trim();
    if (!s) return Number.NaN;
    const m = s.match(/(\d+)/);
    if (!m) return Number.NaN;
    return Number(m[1]);
  }, []);

  const filteredForemen = useMemo(() => {
    const q = searchForemen.trim().toLowerCase();
    if (!q) return foremen;
    return foremen.filter((f) => f.name.toLowerCase().includes(q));
  }, [foremen, searchForemen]);

  const filteredSortedSites = useMemo(() => {
    const q = searchSites.trim().toLowerCase();

    const base = !q
      ? sites
      : sites.filter((s) => {
          const name = (s.name ?? "").toLowerCase();
          const code = (s.code ?? "").toLowerCase();
          const location = (s.location ?? "").toLowerCase();
          return name.includes(q) || code.includes(q) || location.includes(q);
        });

    const sorted = [...base].sort((a, b) => {
      const na = parseJobNumberFromCode(a.code ?? undefined);
      const nb = parseJobNumberFromCode(b.code ?? undefined);

      const aNaN = Number.isNaN(na);
      const bNaN = Number.isNaN(nb);

      if (aNaN && bNaN) {
        return String(a.name ?? "").localeCompare(String(b.name ?? ""));
      }
      if (aNaN) return 1;
      if (bNaN) return -1;

      // high -> low (e.g. 6560 -> 6000)
      if (nb !== na) return nb - na;

      return String(a.name ?? "").localeCompare(String(b.name ?? ""));
    });

    return sorted;
  }, [parseJobNumberFromCode, searchSites, sites]);

  const addToBatch = useCallback(
    (codeRaw: string) => {
      if (!selectedSite?.id || !selectedForemanId) {
        playErr();
        setError("Select a site and foreman first.");
        return;
      }

      const code = normalizeEmployeeCode(codeRaw);
      if (!code) {
        playErr();
        setError("Not a valid employee QR payload.");
        return;
      }

      const key = code.toUpperCase();
      if (batchSet.has(key)) {
        playErr();
        setError(`Already in batch: ${key}`);
        return;
      }

      const alreadyOnServer = serverScans.some(
        (s) => String(s.employeeCode ?? "").toUpperCase() === key,
      );
      if (alreadyOnServer) {
        playErr();
        setError(`Already scanned on ${prettyWorkDate(focusDate)}: ${key}`);
        return;
      }

      playOk();
      setBatch((prev) => [...prev, key]);
      setError(null);
    },
    [
      batchSet,
      playErr,
      playOk,
      selectedForemanId,
      selectedSite?.id,
      serverScans,
      focusDate,
    ],
  );

  const handleScannedPayload = useCallback(
    (payload: string) => {
      if (!canAcceptScanNow()) return;

      const code = extractEmployeeCode(payload);
      if (!code) {
        playErr();
        setError("⚠️ Not a valid employee QR payload.");
        return;
      }
      addToBatch(code);
    },
    [addToBatch, canAcceptScanNow, playErr],
  );

  const submitBatch = useCallback(async () => {
    if (!selectedSite?.id || !selectedForemanId) {
      setError("Select a site and foreman first.");
      return;
    }
    if (!batch.length) return;
    if (!selectedDates.length) {
      setError("Select at least one work date.");
      return;
    }

    const datesToSubmit = selectedDates.filter(
      (d) => !dayInfoByDate[d]?.isLocked,
    );
    const lockedDates = selectedDates.filter((d) => dayInfoByDate[d]?.isLocked);

    if (!datesToSubmit.length) {
      Alert.alert(
        "Scanning locked",
        "All selected days are locked. You cannot add more scans.",
      );
      return;
    }

    let supervisorAuthConfirmed = false;
    if (requiresSupervisorAuth) {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = hasHardware
        ? await LocalAuthentication.isEnrolledAsync()
        : false;
      if (!hasHardware || !isEnrolled) {
        Alert.alert(
          "Fingerprint required",
          "This site requires supervisor fingerprint verification before manual attendance can be recorded, but this device has no fingerprint/Face ID enrolled. Use a device with biometrics set up.",
        );
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Verify to record manual attendance",
        disableDeviceFallback: false,
      });
      if (!result.success) {
        Alert.alert(
          "Verification failed",
          "Supervisor fingerprint verification was not completed. Manual attendance was not recorded.",
        );
        return;
      }
      supervisorAuthConfirmed = true;
    }

    setBusySubmit(true);
    setError(null);
    try {
      const location = await getLocationWithAddress();

      let created = 0;
      let dupes = 0;
      let unknown = 0;
      let inactive = 0;

      for (const workDateISO of datesToSubmit) {
        const res = await apiSupervisorScanBulk({
          siteId: selectedSite.id,
          foremanId: selectedForemanId,
          workDateISO,
          employeeCodes: batch,
          location,
          supervisorAuthConfirmed,
          supervisorAuthDevice: supervisorAuthConfirmed
            ? `${Platform.OS} ${Platform.Version}`
            : undefined,
        });

        const results = res?.results ?? [];
        created += results.filter((r: any) => r.status === "CREATED").length;
        dupes += results.filter(
          (r: any) => r.status === "ALREADY_SCANNED",
        ).length;
        unknown += results.filter((r: any) => r.status === "UNKNOWN").length;
        inactive += results.filter((r: any) => r.status === "INACTIVE").length;
      }

      await loadSiteDay(selectedSite.id, selectedDates);

      setBatch([]);

      const lockedNote = lockedDates.length
        ? `\n\nSkipped (locked): ${lockedDates.map(prettyWorkDate).join(", ")}`
        : "";

      Alert.alert(
        "Batch submitted",
        `Days: ${datesToSubmit.map(prettyWorkDate).join(", ")}\nSaved: ${created}\nAlready scanned: ${dupes}\nUnknown: ${unknown}\nInactive: ${inactive}${lockedNote}`,
      );
      setError(null);
    } catch (e: any) {
      setError(`Submit failed: ${e?.message ?? "Unknown error"}`);
      Alert.alert("Submit failed", e?.message ?? "Unknown error");
    } finally {
      setBusySubmit(false);
    }
  }, [
    batch,
    selectedDates,
    dayInfoByDate,
    getLocationWithAddress,
    loadSiteDay,
    selectedForemanId,
    selectedSite?.id,
    requiresSupervisorAuth,
  ]);

  const canScan =
    !!selectedSite?.id &&
    !!selectedForemanId &&
    !allSelectedDatesLocked &&
    !siteDayLoading &&
    !busySubmit;

  if (loading) {
    return (
      <AuthStyleBackground>
        <LoadingOverlay
          icon="⏳"
          title="Loading…"
          message="Please wait while we fetch your sites"
        />
      </AuthStyleBackground>
    );
  }

  return (
    <AuthStyleBackground>
      <ScrollView
        contentContainerStyle={styles.wrap}
        showsVerticalScrollIndicator={false}
      >
        {error ? (
          <View
            style={[
              styles.errorBox,
              {
                borderColor: colors.border,
                backgroundColor:
                  theme === "dark"
                    ? "rgba(239,68,68,0.12)"
                    : "rgba(239,68,68,0.08)",
              },
            ]}
          >
            <Ionicons name="alert-circle" size={18} color={colors.error} />
            <Text style={[styles.errorText, { color: colors.textPrimary }]}>
              {error}
            </Text>
          </View>
        ) : null}

        <GlassCard style={{ padding: 14, gap: 10 }}>
          <View style={styles.headerRow}>
            <Pressable onPress={() => router.back()} style={styles.backPill}>
              <Text style={styles.backText}>← Back</Text>
            </Pressable>
            <Text style={[styles.h1, { color: colors.textPrimary }]}>Scan</Text>
          </View>

          {requiresSupervisorAuth ? (
            <Text style={{ color: colors.error, fontWeight: "800", fontSize: 12 }}>
              🔒 This site requires your fingerprint before submitting manual attendance.
            </Text>
          ) : null}

          <View style={styles.dateHeader}>
            <Text style={[styles.selectorLabel, { color: colors.textSecondary }]}>
              Work date{selectedDates.length > 1 ? "s" : ""}
            </Text>
            <Text style={[styles.selectedDateText, { color: colors.textPrimary }]}>
              {selectedDates.length > 1
                ? `${selectedDates.length} days selected`
                : prettyWorkDate(focusDate)}
            </Text>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.dateOptions}
          >
            {workDateOptions.map((workDate) => {
              const selected = selectedDates.includes(workDate);
              return (
                <Pressable
                  key={workDate}
                  disabled={busySubmit}
                  onPress={() => toggleDate(workDate)}
                  style={[
                    styles.dateOption,
                    {
                      borderColor: selected ? colors.accent : colors.border,
                      backgroundColor: selected
                        ? colors.accentBg
                        : theme === "dark"
                          ? "rgba(255,255,255,0.04)"
                          : "rgba(0,0,0,0.03)",
                      opacity: busySubmit ? 0.6 : 1,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    },
                  ]}
                >
                  {selected ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={14}
                      color={colors.accent}
                    />
                  ) : null}
                  <Text
                    style={[
                      styles.dateOptionText,
                      { color: selected ? colors.accent : colors.textSecondary },
                    ]}
                  >
                    {prettyWorkDate(workDate)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.selectorRow}>
            <TouchableOpacity
              disabled={busySubmit}
              onPress={() => setSiteModalOpen(true)}
              style={[
                styles.selectorBtn,
                {
                  borderColor: colors.border,
                  backgroundColor:
                    theme === "dark"
                      ? "rgba(255,255,255,0.06)"
                      : "rgba(255,255,255,0.9)",
                  opacity: busySubmit ? 0.6 : 1,
                },
              ]}
            >
              <Text
                style={[styles.selectorLabel, { color: colors.textSecondary }]}
              >
                Site
              </Text>
              <Text
                style={[styles.selectorValue, { color: colors.textPrimary }]}
                numberOfLines={1}
              >
                {selectedSite ? selectedSite.name : "Choose site"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              disabled={!selectedSite || busySubmit}
              onPress={() => {
                if (!selectedSite) return;
                setForemanModalOpen(true);
              }}
              style={[
                styles.selectorBtn,
                {
                  borderColor: colors.border,
                  backgroundColor:
                    theme === "dark"
                      ? "rgba(255,255,255,0.06)"
                      : "rgba(255,255,255,0.9)",
                  opacity: selectedSite && !busySubmit ? 1 : 0.5,
                },
              ]}
            >
              <Text
                style={[styles.selectorLabel, { color: colors.textSecondary }]}
              >
                Foreman
              </Text>
              <Text
                style={[styles.selectorValue, { color: colors.textPrimary }]}
                numberOfLines={1}
              >
                {selectedForemanId
                  ? (foremen.find((f) => f.foremanId === selectedForemanId)
                      ?.name ?? "Foreman")
                  : "Choose foreman"}
              </Text>
            </TouchableOpacity>
          </View>

          <View
            style={[
              styles.cameraBox,
              {
                borderColor: colors.border,
                backgroundColor:
                  theme === "dark"
                    ? "rgba(255,255,255,0.04)"
                    : "rgba(0,0,0,0.03)",
                opacity: canScan ? 1 : 0.65,
              },
            ]}
          >
            {!permission?.granted ? (
              <View style={styles.cameraDisabledInner}>
                <Text
                  style={[
                    styles.cameraDisabledTitle,
                    { color: colors.textPrimary },
                  ]}
                >
                  Camera permission needed
                </Text>
                <Pressable
                  style={[
                    styles.btnPrimary,
                    { backgroundColor: colors.accent },
                  ]}
                  onPress={requestPermission}
                >
                  <Text style={styles.btnPrimaryText}>Allow camera</Text>
                </Pressable>
              </View>
            ) : canScan ? (
              <CameraView
                style={{ flex: 1 }}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={(res) => {
                  const payload = (res as any)?.data ?? "";
                  if (!payload) return;
                  handleScannedPayload(String(payload));
                }}
              />
            ) : (
              <View style={styles.cameraDisabledInner}>
                <Text
                  style={[
                    styles.cameraDisabledTitle,
                    { color: colors.textPrimary },
                  ]}
                >
                  {busySubmit
                    ? "Submitting scans..."
                    : allSelectedDatesLocked
                      ? "Scanning locked"
                      : "Select site + foreman"}
                </Text>
                <Text
                  style={[
                    styles.cameraDisabledSub,
                    { color: colors.textSecondary },
                  ]}
                >
                  {busySubmit
                    ? "Please wait while the selected scans are saved."
                    : allSelectedDatesLocked
                    ? selectedDates.length > 1
                      ? "All selected days are locked. You cannot add more scans."
                      : "This site day is locked. You cannot add more scans."
                    : "Tap Site to choose, then choose the foreman for that site."}
                </Text>
              </View>
            )}
          </View>

          <Text style={{ color: colors.textPrimary, fontWeight: "900" }}>
            Batch: {batch.length} | Saved for day: {serverScans.length}
          </Text>

          <View style={styles.bottomRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textSecondary, fontWeight: "800" }}>
                {selectedDates.length > 1
                  ? `Submits to ${selectedDates.length} selected days`
                  : "Saved for selected day"}
              </Text>
            </View>
            <Pressable
              onPress={submitBatch}
              disabled={!batch.length || !canScan || busySubmit}
              style={[
                styles.btnPrimary,
                {
                  backgroundColor:
                    canScan && batch.length && !busySubmit
                      ? colors.accent
                      : theme === "dark"
                        ? "rgba(56,189,248,0.2)"
                        : "rgba(38,45,104,0.2)",
                  opacity: !batch.length || !canScan || busySubmit ? 0.7 : 1,
                },
              ]}
            >
              {busySubmit ? (
                <>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={styles.btnPrimaryText}>SUBMITTING...</Text>
                </>
              ) : (
                <Text style={styles.btnPrimaryText}>SUBMIT ({batch.length})</Text>
              )}
            </Pressable>
          </View>
        </GlassCard>

        <GlassCard style={{ marginTop: 12, padding: 0 }}>
          <View
            style={[styles.listHeader, { borderBottomColor: colors.border }]}
          >
            <Text
              style={[styles.listHeaderTitle, { color: colors.textPrimary }]}
            >
              Batch (not submitted)
            </Text>
            <Text
              style={[styles.listHeaderHint, { color: colors.textSecondary }]}
            >
              Tap to remove
            </Text>
          </View>

          {batch.length ? (
            <View>
              {batch.map((item, idx) => (
                <Pressable
                  key={`${item}-${idx}`}
                  onPress={() =>
                    setBatch((prev) => prev.filter((x) => x !== item))
                  }
                  style={[
                    styles.batchRow,
                    { borderBottomColor: colors.border },
                  ]}
                >
                  <Text
                    style={[styles.batchCode, { color: colors.textPrimary }]}
                  >
                    {item}
                  </Text>
                  <View
                    style={[
                      styles.badge,
                      {
                        backgroundColor:
                          theme === "dark"
                            ? "rgba(56,189,248,0.15)"
                            : "rgba(38,45,104,0.12)",
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.badgeTxt, { color: colors.accent }]}>
                      BATCH
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={{ padding: 14 }}>
              <Text style={{ color: colors.textSecondary, fontWeight: "800" }}>
                No items yet. Scan QR cards.
              </Text>
            </View>
          )}
        </GlassCard>

        <GlassCard style={{ marginTop: 12, padding: 0 }}>
          <View
            style={[styles.listHeader, { borderBottomColor: colors.border }]}
          >
            <Text
              style={[styles.listHeaderTitle, { color: colors.textPrimary }]}
            >
              Saved for {prettyWorkDate(focusDate)}
            </Text>
            <Text
              style={[styles.listHeaderHint, { color: colors.textSecondary }]}
            >
              Scanned by all foremen
            </Text>
          </View>

          {serverScans.length ? (
            <View>
              {serverScans.map((item) => (
                <View
                  key={String(item.id)}
                  style={[
                    styles.serverRow,
                    { borderBottomColor: colors.border },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.serverName, { color: colors.textPrimary }]}
                      numberOfLines={1}
                    >
                      {item.employeeName ?? "Guy"}
                    </Text>
                    <Text
                      style={[
                        styles.serverMeta,
                        { color: colors.textSecondary },
                      ]}
                      numberOfLines={1}
                    >
                      {item.employeeCode}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.badge,
                      {
                        backgroundColor:
                          theme === "dark"
                            ? "rgba(34,197,94,0.12)"
                            : "rgba(22,163,74,0.10)",
                        borderColor: "rgba(34,197,94,0.2)",
                      },
                    ]}
                  >
                    <Text style={[styles.badgeTxt, { color: colors.ok }]}>
                      OK
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={{ padding: 14 }}>
              <Text style={{ color: colors.textSecondary, fontWeight: "800" }}>
                No saved scans yet.
              </Text>
            </View>
          )}
        </GlassCard>

        <GlassCard style={{ marginTop: 12, padding: 14, gap: 10 }}>
          <Text style={[styles.h2, { color: colors.textPrimary }]}>
            Manual entry (optional)
          </Text>
          <View style={styles.manualRow}>
            <TextInput
              value={manualInput}
              onChangeText={setManualInput}
              placeholder="EMP_..."
              placeholderTextColor={colors.textSecondary}
              style={[
                styles.manualInput,
                {
                  borderColor: colors.border,
                  color: colors.textPrimary,
                  backgroundColor:
                    theme === "dark"
                      ? "rgba(255,255,255,0.06)"
                      : "rgba(0,0,0,0.03)",
                },
              ]}
              autoCapitalize="characters"
            />
            <Pressable
              onPress={() => {
                if (!manualInput.trim()) return;
                addToBatch(manualInput);
                setManualInput("");
              }}
              style={[
                styles.manualAddBtn,
                {
                  backgroundColor: colors.accent,
                  opacity: selectedSite && selectedForemanId ? 1 : 0.6,
                },
              ]}
              disabled={!selectedSite || !selectedForemanId}
            >
              <Ionicons name="add-circle" size={18} color="#fff" />
              <Text style={styles.manualAddTxt}>Add</Text>
            </Pressable>
          </View>
        </GlassCard>
      </ScrollView>

      {/* Site picker */}

      <Modal
        visible={siteModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => {}}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: theme === "dark" ? "#0f172a" : "#fff" },
            ]}
          >
            <View
              style={[styles.modalHeader, { borderBottomColor: colors.border }]}
            >
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                Select Site
              </Text>
              <Pressable
                style={styles.closeBtn}
                onPress={() => setSiteModalOpen(false)}
              >
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            <View style={{ padding: 12 }}>
              <TextInput
                value={searchSites}
                onChangeText={setSearchSites}
                placeholder="Search site (name / code)…"
                placeholderTextColor={colors.textSecondary}
                style={[
                  styles.searchInput,
                  {
                    borderColor: colors.border,
                    backgroundColor:
                      theme === "dark"
                        ? "rgba(255,255,255,0.06)"
                        : "rgba(0,0,0,0.03)",
                    color: colors.textPrimary,
                  },
                ]}
                autoCapitalize="none"
              />
            </View>

            <FlatList
              data={filteredSortedSites}
              keyExtractor={(s) => s.id}
              style={{ maxHeight: 500, paddingHorizontal: 12 }}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable
                  onPress={async () => {
                    setSelectedSite(item);
                    setSiteModalOpen(false);
                    await loadForemenForSite(item.id);
                    setForemanModalOpen(true);
                  }}
                  style={[
                    styles.siteOption,
                    {
                      borderColor: colors.border,
                      backgroundColor:
                        theme === "dark"
                          ? "rgba(255,255,255,0.06)"
                          : "rgba(0,0,0,0.03)",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.siteOptionCode,
                      { color: colors.textPrimary },
                    ]}
                    numberOfLines={1}
                  >
                    {item.code ?? "—"}
                  </Text>

                  <Text
                    style={[
                      styles.siteOptionName,
                      { color: colors.textPrimary },
                    ]}
                    numberOfLines={1}
                  >
                    {item.name.slice(0, 33) ?? "—"}
                  </Text>
                </Pressable>
              )}
              ListEmptyComponent={
                <View style={{ padding: 16 }}>
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontWeight: "800",
                    }}
                  >
                    No sites match your search.
                  </Text>
                </View>
              }
            />

            <Pressable
              onPress={loadSites}
              style={[
                styles.retryBtn,
                {
                  borderColor: colors.border,
                  backgroundColor:
                    theme === "dark"
                      ? "rgba(255,255,255,0.06)"
                      : "rgba(0,0,0,0.03)",
                },
              ]}
            >
              <Ionicons name="refresh" size={18} color={colors.accent} />
              <Text style={[styles.retryTxt, { color: colors.textPrimary }]}>
                Refresh
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Foreman picker */}
      <Modal
        visible={foremanModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => {}}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: theme === "dark" ? "#0f172a" : "#fff",
                height: "100%",
                minHeight: "100%",
              },
            ]}
          >
            <View
              style={[styles.modalHeader, { borderBottomColor: colors.border }]}
            >
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                Select Foreman
              </Text>
              <Pressable
                style={styles.closeBtn}
                onPress={() => setForemanModalOpen(false)}
              >
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            <View style={{ padding: 12 }}>
              <TextInput
                value={searchForemen}
                onChangeText={setSearchForemen}
                placeholder="Search foreman…"
                placeholderTextColor={colors.textSecondary}
                style={[
                  styles.searchInput,
                  {
                    borderColor: colors.border,
                    backgroundColor:
                      theme === "dark"
                        ? "rgba(255,255,255,0.06)"
                        : "rgba(0,0,0,0.03)",
                    color: colors.textPrimary,
                  },
                ]}
              />
            </View>

            <View style={{ flex: 1, paddingHorizontal: 12 }}>
              {foremenLoading ? (
                <LoadingOverlay
                  icon="⏳"
                  title="Loading foremen…"
                  message="Please wait"
                />
              ) : (
                <FlatList
                  data={filteredForemen}
                  keyExtractor={(f) => f.foremanId}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => {
                    const selected = item.foremanId === selectedForemanId;
                    return (
                      <Pressable
                        onPress={() => {
                          setSelectedForemanId(item.foremanId);
                          setForemanModalOpen(false);
                          setError(null);
                        }}
                        style={[
                          styles.foremanOption,
                          {
                            borderColor: selected
                              ? colors.accent
                              : colors.border,
                            backgroundColor: selected
                              ? theme === "dark"
                                ? "rgba(56,189,248,0.15)"
                                : "rgba(38,45,104,0.12)"
                              : theme === "dark"
                                ? "rgba(255,255,255,0.06)"
                                : "rgba(0,0,0,0.03)",
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.foremanOptionName,
                            { color: colors.textPrimary },
                          ]}
                        >
                          {item.name}
                        </Text>
                      </Pressable>
                    );
                  }}
                  ListEmptyComponent={
                    <View style={{ padding: 16 }}>
                      <Text
                        style={{
                          color: colors.textSecondary,
                          fontWeight: "800",
                        }}
                      >
                        No foremen assigned to this site.
                      </Text>
                    </View>
                  }
                />
              )}
            </View>

            <View style={{ padding: 12, paddingBottom: insets.bottom + 12 }}>
              <TouchableOpacity
                disabled={!selectedForemanId}
                onPress={() => setForemanModalOpen(false)}
                style={[
                  styles.primaryContinueBtn,
                  {
                    backgroundColor: selectedForemanId
                      ? colors.accent
                      : "rgba(148,163,184,0.25)",
                    opacity: selectedForemanId ? 1 : 0.7,
                  },
                ]}
              >
                <Text style={styles.primaryContinueTxt}>Continue</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </AuthStyleBackground>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, paddingBottom: 30, gap: 12 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  h1: { fontSize: 18, fontWeight: "900" },
  h2: { fontSize: 14, fontWeight: "900" },
  backPill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.08)",
  },
  backText: { fontWeight: "900", color: "#111" },

  dateHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  selectedDateText: { fontSize: 13, fontWeight: "900" },
  dateOptions: { flexDirection: "row", gap: 8, paddingBottom: 2 },
  dateOption: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  dateOptionText: { fontSize: 12, fontWeight: "800" },

  selectorRow: { flexDirection: "row", gap: 10 },
  selectorBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  selectorLabel: { fontWeight: "800", fontSize: 12 },
  selectorValue: { fontWeight: "900", fontSize: 13 },

  cameraBox: {
    height: 260,
    borderWidth: 1,
    borderRadius: 18,
    overflow: "hidden",
  },
  cameraDisabledInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    gap: 8,
  },
  cameraDisabledTitle: { fontWeight: "900", fontSize: 16 },
  cameraDisabledSub: { fontWeight: "800", fontSize: 12, textAlign: "center" },

  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 2,
  },

  btnPrimary: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  btnPrimaryText: { color: "#fff", fontWeight: "900", fontSize: 13 },

  errorBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  errorText: { fontWeight: "900", flex: 1 },

  listHeader: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  listHeaderTitle: { fontWeight: "900", fontSize: 13 },
  listHeaderHint: { fontWeight: "800", fontSize: 12 },

  batchRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  batchCode: { fontWeight: "900" },
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeTxt: { fontWeight: "900", fontSize: 11, letterSpacing: 0.3 },

  serverRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  serverName: { fontWeight: "900" },
  serverMeta: { fontWeight: "800", marginTop: 2, fontSize: 12 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
    alignItems: "stretch",
  },
  modalCard: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 10,
    overflow: "hidden",
    height: "100%",
    minHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    marginTop: 42,
  },
  modalTitle: { fontWeight: "900", fontSize: 16 },
  closeBtn: { padding: 6 },

  siteOption: {
    borderWidth: 1,
    // borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  siteOptionCode: { fontWeight: "900", fontSize: 13 },
  siteOptionName: { fontWeight: "900", fontSize: 14 },
  siteOptionMeta: { fontWeight: "800", fontSize: 12, marginTop: 4 },
  sitePickerList: { maxHeight: 420 },

  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    margin: 12,
  },
  retryTxt: { fontWeight: "900" },

  foremanOption: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  foremanOptionName: { fontWeight: "900", fontSize: 14 },

  searchInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  primaryContinueBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryContinueTxt: { color: "#fff", fontWeight: "900", fontSize: 14 },

  manualRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  manualInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontWeight: "900",
  },
  manualAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
  },
  manualAddTxt: { color: "#fff", fontWeight: "900", fontSize: 13 },
});
