import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { CameraType, CameraView, useCameraPermissions } from "expo-camera";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Device from "expo-device";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import {
  Avatar,
  CornerBrackets,
  FaceScreenBackground,
  GlassPanel,
  Header,
  ScanLineOverlay,
} from "@/components/team";
import {
  useFaceTheme,
  type FaceColorPalette,
} from "@/components/team/faceTheme";
import { ForemanContextBanner } from "@/components/assistant/ForemanContextBanner";
import {
  apiForemanScanOutPending,
  apiScanOutConfirm,
  apiScanOutIdentify,
  type ScanOutIdentifyResult,
} from "@/lib/apiClient";
import { useAuth } from "@/lib/auth";
import {
  speakFaceVerificationNoMatch,
  speakFaceVerificationSuccess,
} from "@/lib/faceVerificationSpeech";

// Same guarded load as the foreman scanner — this Nitro Module throws at
// import time in Expo Go / web.
const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const canUseFaceDetector = !isExpoGo && Platform.OS !== "web";
let useImageFaceDetector:
  | typeof import("react-native-vision-camera-face-detector").useImageFaceDetector
  | null = null;
if (canUseFaceDetector) {
  try {
    useImageFaceDetector = (
      require("react-native-vision-camera-face-detector") as typeof import("react-native-vision-camera-face-detector")
    ).useImageFaceDetector;
  } catch (e) {
    console.warn("[assistant scan-out-face] face detector module unavailable:", e);
  }
}
const FACE_DETECTOR_OPTIONS = { performanceMode: "accurate" as const };

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isNightHours(): boolean {
  const hour = new Date().getHours();
  return hour < 6 || hour >= 18;
}

const IDLE_POLL_MS = 1300;
const RETRY_POLL_MS = 500;
const DETECTED_MIN_DISPLAY_MS = 450;
const RESULT_DISPLAY_MS = 1600;
const PAUSED_RECHECK_MS = 4000;

type Phase =
  | "ready"
  | "permission"
  | "scanning"
  | "detected"
  | "verifying"
  | "success"
  | "needsConfirm"
  | "noMatch"
  | "paused"
  | "complete";

const PHASE_LABEL: Partial<Record<Phase, string>> = {
  ready: "SCANNER CLOSED",
  scanning: "READY TO SCAN",
  detected: "DETECTING FACE",
  verifying: "VERIFYING…",
  success: "CLOCKED OUT",
  needsConfirm: "CONFIRM MATCH",
  noMatch: "NOT VERIFIED",
  paused: "PAUSED",
  complete: "ALL DONE",
};

const PHASE_CAPTION: Partial<Record<Phase, [string, string]>> = {
  scanning: ["Look at the camera", "Step forward"],
  detected: ["Face detected", "Capturing…"],
  verifying: ["Verifying face", "Please hold still"],
};

function phaseColor(phase: Phase, colors: FaceColorPalette): string {
  switch (phase) {
    case "detected":
    case "needsConfirm":
      return colors.warning;
    case "verifying":
      return colors.primary;
    case "noMatch":
      return colors.danger;
    case "paused":
    case "ready":
      return colors.textTertiary;
    default:
      return colors.success;
  }
}

type TeamRowStatus = "remaining" | "clockedOut" | "review" | "lowMatch";

type TeamRow = {
  id: string;
  fullName: string;
  faceImageUrl?: string | null;
  status: TeamRowStatus;
  confidence?: number | null;
  lastScan?: string | null;
  /** Auto-detected site for this employee's open scan — the foreman's crew
   * can span more than one site, so this is needed both to display where
   * they clocked out from and to submit the right siteId on manual confirm. */
  siteId?: string | null;
  siteName?: string | null;
  matchedEnrollmentId?: string | null;
};

function normalizePendingEmployee(raw: {
  id: string;
  fullName: string;
  faceImageUrl: string | null;
  siteName?: string | null;
}): TeamRow {
  return {
    id: raw.id,
    fullName: raw.fullName,
    faceImageUrl: raw.faceImageUrl,
    status: "remaining",
    confidence: null,
    lastScan: null,
    siteId: null,
    siteName: raw.siteName ?? null,
    matchedEnrollmentId: null,
  };
}

function confidenceTone(
  confidence: number | null | undefined,
): "success" | "warning" | "danger" | "muted" {
  if (confidence == null) return "muted";
  if (confidence >= 0.7) return "success";
  if (confidence >= 0.5) return "warning";
  return "danger";
}

/**
 * Assistant version of the foreman "clocking machine" continuous scanner
 * ((foreman-stack)/scan-out-face.tsx). An assistant already picked which
 * foreman they're acting for on Home (resolveActingForeman, carried via the
 * x-acting-foreman-id header on every request) — this screen just drops the
 * site picker on top of that: scan-out-identify searches every site that
 * foreman is currently assigned to and reports back which one matched.
 */
export default function AssistantScanOutFaceScanner() {
  const router = useRouter();
  const { colors, typography, spacing } = useFaceTheme();
  const { width: windowWidth } = useWindowDimensions();
  const cameraSize = Math.min(windowWidth - spacing.lg * 2, 460);

  const { user, setActingForeman } = useAuth();
  const isAssistant = (user?.availableForemen ?? []).length > 0;
  const actingForeman = user?.actingForeman ?? null;

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [phase, setPhase] = useState<Phase>("ready");
  const phaseRef = useRef<Phase>("ready");
  const setPhaseTracked = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const [pausedMessage, setPausedMessage] = useState<string | null>(null);
  const [result, setResult] = useState<ScanOutIdentifyResult | null>(null);
  const [totalToday, setTotalToday] = useState(0);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [resumeProgress, setResumeProgress] = useState(0);
  const [teamMembers, setTeamMembers] = useState<TeamRow[]>([]);
  const [deselectedIds, setDeselectedIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [manuallyPaused, setManuallyPaused] = useState(false);
  const [nightMode, setNightMode] = useState(isNightHours);
  const [facing, setFacing] = useState<CameraType>("front");
  const clockedOutToday = teamMembers.filter(
    (m) => m.status === "clockedOut",
  ).length;

  const faceDetector = useImageFaceDetector
    ? useImageFaceDetector(FACE_DETECTOR_OPTIONS)
    : null;

  const stoppedRef = useRef(false);
  const startedRef = useRef(false);
  const cameraReadyRef = useRef(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remainingIdsRef = useRef<Set<string>>(new Set());
  const rosterLoadedRef = useRef(false);

  const device = `${Device.modelName ?? Platform.OS} · Assistant Clock Out Scanner`.slice(
    0,
    200,
  );

  const refreshCounts = useCallback(async () => {
    try {
      const res = await apiForemanScanOutPending(null, todayISO());
      setTotalToday(res.totalScannedInToday);
      setTeamMembers((prev) => {
        const next = new Map(prev.map((member) => [member.id, member]));
        for (const raw of res.employees) {
          const member = normalizePendingEmployee(raw);
          const existing = next.get(member.id);
          if (!existing || existing.status === "remaining")
            next.set(member.id, member);
        }
        remainingIdsRef.current = new Set(
          res.employees
            .map((e) => e.id)
            .filter((id) => next.get(id)?.status !== "review"),
        );
        return Array.from(next.values());
      });
      rosterLoadedRef.current = true;
    } catch {
      // Display-only counter — never worth interrupting the scanner for.
    }
  }, []);

  const markTeamMatch = useCallback(
    (
      employee: { id: string; fullName: string },
      confidence: number | null,
      status: TeamRowStatus,
      site: { id: string; name: string } | null,
      matchedEnrollmentId?: string | null,
    ) => {
      const id = String(employee?.id ?? "");
      if (!id) return;
      setTeamMembers((prev) => {
        const next = new Map(prev.map((member) => [member.id, member]));
        const existing = next.get(id);
        next.set(id, {
          id,
          fullName: String(employee?.fullName ?? existing?.fullName ?? "Worker"),
          faceImageUrl: existing?.faceImageUrl ?? null,
          status,
          confidence,
          lastScan: new Date().toISOString(),
          siteId: site?.id ?? existing?.siteId ?? null,
          siteName: site?.name ?? existing?.siteName ?? null,
          matchedEnrollmentId:
            matchedEnrollmentId ?? existing?.matchedEnrollmentId ?? null,
        });
        return Array.from(next.values());
      });
    },
    [],
  );

  useEffect(() => {
    refreshCounts();
  }, [refreshCounts]);

  const startScanner = useCallback(async () => {
    stoppedRef.current = false;
    startedRef.current = false;

    if (permission?.granted) {
      setPhaseTracked("scanning");
      return;
    }

    const granted = await requestPermission();
    if (granted.granted) {
      setPhaseTracked("scanning");
    } else {
      setPhaseTracked("permission");
    }
  }, [permission, requestPermission, setPhaseTracked]);

  // resumeScanning / showResult / runPollTick / scheduleNextTick are a
  // mutually-recursive group — see the matching comment in the foreman
  // scanner for why these stay plain functions, not useCallback.
  function scheduleNextTick(delayMs: number) {
    if (stoppedRef.current) return;
    if (pollTimer.current) clearTimeout(pollTimer.current);
    pollTimer.current = setTimeout(() => {
      runPollTick();
    }, delayMs);
  }

  const detectFace = useCallback(
    async (uri: string): Promise<boolean> => {
      if (!faceDetector) return true;
      try {
        const faces = await faceDetector.detectFaces(uri);
        return faces.length > 0;
      } catch {
        return true;
      }
    },
    [faceDetector],
  );

  function resumeScanning(delayMs: number) {
    if (stoppedRef.current) return;

    if (rosterLoadedRef.current && remainingIdsRef.current.size === 0) {
      stoppedRef.current = true;
      if (pollTimer.current) clearTimeout(pollTimer.current);
      if (resultTimer.current) clearTimeout(resultTimer.current);
      if (progressTimer.current) clearTimeout(progressTimer.current);
      setResult(null);
      setPhaseTracked("complete");
      return;
    }

    if (progressTimer.current) clearTimeout(progressTimer.current);
    setResumeProgress(0);
    setResult(null);
    setPhaseTracked("scanning");
    scheduleNextTick(delayMs);
  }

  function showResult(
    next: Phase,
    res: ScanOutIdentifyResult | null,
    autoResume: boolean,
  ) {
    setResult(res);
    setPhaseTracked(next);
    if (autoResume) {
      const start = Date.now();
      const tick = () => {
        const t = Math.min(1, (Date.now() - start) / RESULT_DISPLAY_MS);
        setResumeProgress(t);
        if (t < 1) progressTimer.current = setTimeout(tick, 50);
      };
      tick();
      resultTimer.current = setTimeout(
        () => resumeScanning(RETRY_POLL_MS),
        RESULT_DISPLAY_MS,
      );
    }
  }

  async function runPollTick() {
    if (stoppedRef.current || phaseRef.current !== "scanning") return;
    if (!cameraRef.current || !cameraReadyRef.current) {
      scheduleNextTick(RETRY_POLL_MS);
      return;
    }

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.5,
        base64: true,
        skipProcessing: true,
        shutterSound: false,
      });
      if (stoppedRef.current || phaseRef.current !== "scanning") return;
      if (!photo?.base64) {
        scheduleNextTick(IDLE_POLL_MS);
        return;
      }

      const hasFace = await detectFace(photo.uri);
      if (stoppedRef.current || phaseRef.current !== "scanning") return;
      if (!hasFace) {
        scheduleNextTick(IDLE_POLL_MS);
        return;
      }

      setPhaseTracked("detected");
      const detectedAt = Date.now();

      const res = await apiScanOutIdentify({
        dateISO: todayISO(),
        device,
        image: photo.base64,
        checkLiveness: false,
      });
      if (stoppedRef.current) return;

      const elapsed = Date.now() - detectedAt;
      if (elapsed < DETECTED_MIN_DISPLAY_MS) {
        await new Promise((resolve) =>
          setTimeout(resolve, DETECTED_MIN_DISPLAY_MS - elapsed),
        );
      }
      if (stoppedRef.current) return;
      setPhaseTracked("verifying");
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (stoppedRef.current) return;

      if (!res.ok) {
        if (
          res.error === "no_face_detected" ||
          res.error === "multiple_faces_detected"
        ) {
          resumeScanning(RETRY_POLL_MS);
          return;
        }
        if (res.error === "no_candidates") {
          setPausedMessage(
            "Everyone here has been scanned out, or no one has scanned in yet today.",
          );
          setPhaseTracked("paused");
          scheduleNextTick(PAUSED_RECHECK_MS);
          return;
        }
        if (res.error === "service_unavailable") {
          setPausedMessage(
            "Face verification is temporarily unavailable — retrying…",
          );
          setPhaseTracked("paused");
          scheduleNextTick(PAUSED_RECHECK_MS);
          return;
        }
        speakFaceVerificationNoMatch();
        showResult("noMatch", res, true);
        return;
      }

      if (res.recorded) {
        markTeamMatch(res.employee, res.confidence, "clockedOut", res.site);
        remainingIdsRef.current.delete(res.employee.id);
        speakFaceVerificationSuccess({
          employeeName: res.employee.fullName,
          action: "out",
        });
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );
        showResult("success", res, true);
        refreshCounts();
        return;
      }

      markTeamMatch(
        res.employee,
        res.confidence,
        "review",
        res.site,
        res.matchedEnrollmentId,
      );
      remainingIdsRef.current.delete(res.employee.id);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      showResult("needsConfirm", res, true);
    } catch (e: any) {
      if (
        typeof e?.message === "string" &&
        e.message.toLowerCase().includes("not ready")
      ) {
        scheduleNextTick(RETRY_POLL_MS);
        return;
      }
      console.error("[assistant scan-out-face] poll tick failed:", e);
      setPausedMessage("Something went wrong — retrying…");
      setPhaseTracked("paused");
      scheduleNextTick(PAUSED_RECHECK_MS);
    }
  }

  useEffect(() => {
    if (phase === "scanning" && !startedRef.current) {
      startedRef.current = true;
      runPollTick();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(
    () => () => {
      stoppedRef.current = true;
      if (pollTimer.current) clearTimeout(pollTimer.current);
      if (resultTimer.current) clearTimeout(resultTimer.current);
      if (progressTimer.current) clearTimeout(progressTimer.current);
    },
    [],
  );

  const handleEndClockOut = useCallback(() => {
    stoppedRef.current = true;
    if (pollTimer.current) clearTimeout(pollTimer.current);
    if (resultTimer.current) clearTimeout(resultTimer.current);
    if (progressTimer.current) clearTimeout(progressTimer.current);
    router.back();
  }, [router]);

  const toggleReviewSelection = useCallback((id: string) => {
    setDeselectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const reviewRows = teamMembers.filter(
    (m) => m.status === "review" || m.status === "lowMatch",
  );
  const selectedReviewRows = reviewRows.filter((m) => !deselectedIds.has(m.id));

  const handleSubmitReviews = useCallback(async () => {
    if (selectedReviewRows.length === 0 || submitting) return;
    setSubmitting(true);

    try {
      let succeeded = 0;
      let failed = 0;
      for (const row of selectedReviewRows) {
        if (!row.siteId) {
          failed += 1;
          continue;
        }
        try {
          const confirmRes = await apiScanOutConfirm({
            siteId: row.siteId,
            dateISO: todayISO(),
            employeeId: row.id,
            device,
            confidence: row.confidence ?? 0,
            matchedEnrollmentId: row.matchedEnrollmentId ?? undefined,
          });
          if (confirmRes.ok) {
            markTeamMatch(
              { id: row.id, fullName: row.fullName },
              row.confidence ?? null,
              "clockedOut",
              row.siteId ? { id: row.siteId, name: row.siteName ?? "" } : null,
              row.matchedEnrollmentId,
            );
            succeeded += 1;
          } else {
            failed += 1;
          }
        } catch (e) {
          console.error("[assistant scan-out-face] submit review failed:", e);
          failed += 1;
        }
      }
      refreshCounts();
      setDeselectedIds(new Set());
      Alert.alert(
        failed > 0 ? "Some scan-outs failed" : "Submitted",
        failed > 0
          ? `${succeeded} recorded, ${failed} failed — try again for those.`
          : `${succeeded} scan-out${succeeded === 1 ? "" : "s"} recorded.`,
      );
    } finally {
      setSubmitting(false);
    }
  }, [selectedReviewRows, submitting, device, markTeamMatch, refreshCounts]);

  if (isAssistant && !actingForeman) {
    return (
      <FaceScreenBackground>
        <Header title="Face Scan-Out" subtitle="No foreman selected" />
        <View
          style={[
            styles.body,
            styles.centerFill,
            { paddingHorizontal: spacing.lg },
          ]}
        >
          <GlassPanel contentPadding={22}>
            <View style={{ alignItems: "center", gap: spacing.sm }}>
              <Text style={[typography.headline, { textAlign: "center" }]}>
                Select a foreman first
              </Text>
              <Text style={[typography.caption, { textAlign: "center" }]}>
                Go back to Home and choose which foreman you're acting for
                before scanning them out.
              </Text>
              <Pressable
                onPress={() => router.push("/(assistant)/home")}
                style={[
                  styles.actionButton,
                  {
                    backgroundColor: colors.success,
                    width: "100%",
                    marginTop: spacing.sm,
                  },
                ]}
              >
                <Text
                  style={[
                    typography.bodyStrong,
                    { color: colors.textOnPrimary },
                  ]}
                >
                  GO TO HOME
                </Text>
              </Pressable>
            </View>
          </GlassPanel>
        </View>
      </FaceScreenBackground>
    );
  }

  if (phase === "permission") {
    return (
      <FaceScreenBackground>
        <Header title="Face Scan-Out" subtitle={actingForeman?.name ?? "Face scanner"} />
        <View
          style={[
            styles.body,
            styles.centerFill,
            { paddingHorizontal: spacing.lg },
          ]}
        >
          <GlassPanel contentPadding={22}>
            <View style={{ alignItems: "center", gap: spacing.sm }}>
              <View
                style={[
                  styles.lockCircle,
                  {
                    borderColor: colors.warning,
                    backgroundColor: colors.warningDim,
                  },
                ]}
              >
                <Ionicons
                  name="camera-outline"
                  size={32}
                  color={colors.warning}
                />
              </View>
              <Text style={[typography.headline, { textAlign: "center" }]}>
                Camera access required
              </Text>
              <Text style={[typography.caption, { textAlign: "center" }]}>
                Allow camera access to start the clock-out scanner.
              </Text>
              <Pressable
                onPress={startScanner}
                style={[
                  styles.actionButton,
                  {
                    backgroundColor: colors.success,
                    width: "100%",
                    marginTop: spacing.sm,
                  },
                ]}
              >
                <Text
                  style={[
                    typography.bodyStrong,
                    { color: colors.textOnPrimary },
                  ]}
                >
                  ALLOW & START SCANNER
                </Text>
              </Pressable>
            </View>
          </GlassPanel>
        </View>
      </FaceScreenBackground>
    );
  }

  const accent = phaseColor(phase, colors);
  const caption = PHASE_CAPTION[phase];
  const visibleRows = [...teamMembers].sort((a, b) => {
    const order: Record<TeamRowStatus, number> = {
      clockedOut: 0,
      review: 1,
      lowMatch: 2,
      remaining: 3,
    };
    return (
      order[a.status] - order[b.status] || a.fullName.localeCompare(b.fullName)
    );
  });

  return (
    <FaceScreenBackground>
      <View style={[styles.pinned, { paddingHorizontal: spacing.lg }]}>
        {isAssistant && actingForeman && (
          <View style={{ marginBottom: spacing.sm }}>
            <ForemanContextBanner
              foreman={actingForeman}
              onChange={async () => {
                await setActingForeman(null);
                router.replace("/(assistant)/home");
              }}
            />
          </View>
        )}

        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: accent }]} />
          <Text style={[typography.label, { color: accent }]}>
            {PHASE_LABEL[phase]}
          </Text>
        </View>

        {phase === "ready" ? (
          <ScannerClosedCard onStart={startScanner} />
        ) : phase === "complete" ? (
          <AllDoneCard
            clockedOutToday={clockedOutToday}
            totalToday={totalToday}
          />
        ) : (
          <View style={styles.stageWrap}>
            {nightMode && facing === "front" && (
              <View
                pointerEvents="none"
                style={[
                  styles.nightFillLight,
                  { width: cameraSize * 1.55, height: cameraSize * 1.55 },
                ]}
              />
            )}
            <View
              style={[
                styles.stageGlow,
                { width: cameraSize, height: cameraSize, shadowColor: accent },
              ]}
            />
            <View
              style={[
                styles.stageBox,
                {
                  width: cameraSize,
                  height: cameraSize,
                  backgroundColor: colors.backgroundDeep,
                  borderColor: colors.glassBorderStrong,
                },
              ]}
            >
              <CameraView
                ref={cameraRef}
                style={StyleSheet.absoluteFillObject}
                facing={facing}
                enableTorch={nightMode && facing === "back"}
                onCameraReady={() => {
                  cameraReadyRef.current = true;
                }}
              />
              <ScanLineOverlay
                active={
                  phase === "scanning" ||
                  phase === "detected" ||
                  phase === "verifying"
                }
                color={accent}
                size={cameraSize}
              />
              <View style={styles.liveBadge}>
                <View
                  style={[styles.liveDot, { backgroundColor: colors.danger }]}
                />
                <Text style={styles.liveBadgeText}>LIVE</Text>
              </View>
              <Pressable
                onPress={() => setNightMode((v) => !v)}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.nightToggle,
                  nightMode && styles.nightToggleActive,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Ionicons
                  name={nightMode ? "sunny" : "moon-outline"}
                  size={14}
                  color={nightMode ? "#1A1A1A" : "#fff"}
                />
                <Text
                  style={[
                    styles.nightToggleText,
                    nightMode && { color: "#1A1A1A" },
                  ]}
                >
                  NIGHT
                </Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  setFacing((f) => (f === "front" ? "back" : "front"))
                }
                hitSlop={8}
                style={({ pressed }) => [
                  styles.flipButton,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Ionicons name="camera-reverse-outline" size={18} color="#fff" />
              </Pressable>
            </View>
            <CornerBrackets size={cameraSize * 0.9} color={accent} />
          </View>
        )}

        {phase !== "ready" && caption && (
          <View style={{ alignItems: "center", marginTop: spacing.sm }}>
            <Text style={typography.bodyStrong}>{caption[0]}</Text>
            <Text style={[typography.caption, { marginTop: 2 }]}>
              {caption[1]}
            </Text>
          </View>
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.bodyScroll,
          { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {phase === "paused" && !!pausedMessage && (
          <GlassPanel contentPadding={14} radius={5}>
            <Text style={[typography.body, { textAlign: "center" }]}>
              {pausedMessage}
            </Text>
          </GlassPanel>
        )}

        {(phase === "success" ||
          phase === "needsConfirm" ||
          phase === "noMatch") &&
          result && (
            <ResultCard
              phase={phase}
              result={result}
              resumeProgress={resumeProgress}
              onTryAgain={() => resumeScanning(RETRY_POLL_MS)}
            />
          )}

        <View style={[styles.summaryRow, { marginTop: spacing.md }]}>
          <StatBox
            label="Team"
            value={Math.max(totalToday, teamMembers.length)}
            unit="Scanned in"
          />
          <StatBox
            label="Clocked Out"
            value={clockedOutToday}
            unit="Clocked Out"
          />
          <StatBox
            label="Remaining"
            value={Math.max(
              0,
              teamMembers.filter((m) => m.status === "remaining").length,
            )}
            unit="Remaining"
          />
        </View>

        <TeamStatusTable
          rows={visibleRows}
          deselectedIds={deselectedIds}
          onToggleSelect={toggleReviewSelection}
        />
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            paddingHorizontal: spacing.lg,
            backgroundColor: colors.background,
          },
        ]}
      >
        {reviewRows.length > 0 && (
          <Pressable
            onPress={handleSubmitReviews}
            disabled={selectedReviewRows.length === 0 || submitting}
            style={[
              styles.submitButton,
              {
                backgroundColor: colors.success,
                marginBottom: spacing.sm,
                opacity:
                  selectedReviewRows.length === 0 || submitting ? 0.5 : 1,
              },
            ]}
          >
            {submitting ? (
              <ActivityIndicator color={colors.textOnPrimary} />
            ) : (
              <>
                <Ionicons
                  name="cloud-upload-outline"
                  size={18}
                  color={colors.textOnPrimary}
                />
                <Text
                  style={[
                    typography.bodyStrong,
                    { color: colors.textOnPrimary },
                  ]}
                >
                  SUBMIT{" "}
                  {selectedReviewRows.length > 0
                    ? `(${selectedReviewRows.length})`
                    : ""}
                </Text>
              </>
            )}
          </Pressable>
        )}

        <View style={styles.controlRow}>
          {phase !== "ready" && phase !== "complete" && (
            <Pressable
              onPress={() => {
                if (manuallyPaused) {
                  setManuallyPaused(false);
                  stoppedRef.current = false;
                  startedRef.current = false;
                  setResult(null);
                  setPausedMessage(null);
                  setPhaseTracked("scanning");
                } else {
                  stoppedRef.current = true;
                  if (pollTimer.current) clearTimeout(pollTimer.current);
                  if (resultTimer.current) clearTimeout(resultTimer.current);
                  if (progressTimer.current)
                    clearTimeout(progressTimer.current);
                  setManuallyPaused(true);
                  setResult(null);
                  setPausedMessage(
                    "Paused — tap Resume when the next worker is ready.",
                  );
                  setPhaseTracked("paused");
                }
              }}
              style={[
                styles.secondaryButton,
                manuallyPaused
                  ? { backgroundColor: colors.successDim }
                  : { backgroundColor: colors.glassFill },
              ]}
            >
              <Ionicons
                name={manuallyPaused ? "play" : "pause-outline"}
                size={18}
                color={manuallyPaused ? colors.success : colors.textPrimary}
              />
              <Text
                style={[
                  typography.bodyStrong,
                  manuallyPaused && { color: colors.success },
                ]}
              >
                {manuallyPaused ? "RESUME" : "PAUSE"}
              </Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => setEndConfirmOpen(true)}
            style={[
              styles.secondaryButton,
              { backgroundColor: colors.dangerDim, flex: 1 },
            ]}
          >
            <Ionicons name="power-outline" size={18} color={colors.danger} />
            <Text style={[typography.bodyStrong, { color: colors.danger }]}>
              END SESSION
            </Text>
          </Pressable>
        </View>
      </View>

      <EndSessionModal
        visible={endConfirmOpen}
        clockedOutToday={clockedOutToday}
        onCancel={() => setEndConfirmOpen(false)}
        onEnd={handleEndClockOut}
      />
    </FaceScreenBackground>
  );
}

function ScannerClosedCard({ onStart }: { onStart: () => void }) {
  const { colors, typography, spacing } = useFaceTheme();
  return (
    <GlassPanel contentPadding={22} radius={14}>
      <View style={{ alignItems: "center", gap: spacing.sm }}>
        <View
          style={[
            styles.lockCircle,
            { backgroundColor: colors.glassFill, borderColor: colors.success },
          ]}
        >
          <Ionicons name="scan-outline" size={38} color={colors.success} />
        </View>
        <Text style={[typography.headline, { textAlign: "center" }]}>
          Scanner is closed
        </Text>
        <Text
          style={[typography.caption, { textAlign: "center", maxWidth: 290 }]}
        >
          Start the scanner when the team is ready to clock out. Workers
          simply walk up and look at the camera — their site is detected
          automatically.
        </Text>
        <Pressable
          onPress={onStart}
          style={[
            styles.startScannerButton,
            { backgroundColor: colors.success },
          ]}
        >
          <Ionicons name="play" size={20} color={colors.textOnPrimary} />
          <Text
            style={[
              typography.bodyStrong,
              { color: colors.textOnPrimary, letterSpacing: 0.5 },
            ]}
          >
            START SCANNER
          </Text>
        </Pressable>
      </View>
    </GlassPanel>
  );
}

function AllDoneCard({
  clockedOutToday,
  totalToday,
}: {
  clockedOutToday: number;
  totalToday: number;
}) {
  const { colors, typography, spacing } = useFaceTheme();
  return (
    <GlassPanel contentPadding={22} radius={24}>
      <View style={{ alignItems: "center", gap: spacing.sm }}>
        <View
          style={[
            styles.lockCircle,
            { backgroundColor: colors.successDim, borderColor: colors.success },
          ]}
        >
          <Ionicons name="checkmark-done" size={36} color={colors.success} />
        </View>
        <Text style={[typography.headline, { textAlign: "center" }]}>
          All guys clocked out
        </Text>
        <Text
          style={[typography.caption, { textAlign: "center", maxWidth: 290 }]}
        >
          {clockedOutToday} of {totalToday} worker
          {totalToday === 1 ? "" : "s"} scanned in today have been clocked
          out. Nothing left for the scanner to do.
        </Text>
      </View>
    </GlassPanel>
  );
}

function TeamStatusTable({
  rows,
  deselectedIds,
  onToggleSelect,
}: {
  rows: TeamRow[];
  deselectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
}) {
  const { colors, typography, spacing } = useFaceTheme();
  return (
    <GlassPanel
      contentPadding={12}
      radius={5}
      style={{ width: "100%", marginTop: spacing.md }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: spacing.sm,
        }}
      >
        <View>
          <Text style={typography.bodyStrong}>TEAM LIST</Text>
          <Text style={typography.caption}>Live clock-out status</Text>
        </View>
        <View style={[styles.livePill, { backgroundColor: colors.glassFill }]}>
          <View style={[styles.liveDot, { backgroundColor: colors.success }]} />
          <Text style={[typography.caption, { color: colors.success }]}>
            LIVE
          </Text>
        </View>
      </View>

      <View
        style={[styles.tableHeader, { borderBottomColor: colors.glassBorder }]}
      >
        <Text
          style={[
            styles.tableHeaderText,
            { color: colors.textTertiary, flex: 1 },
          ]}
        >
          TEAM MEMBER
        </Text>
        <Text
          style={[
            styles.tableHeaderText,
            { color: colors.textTertiary, width: 82, textAlign: "right" },
          ]}
        >
          MATCH
        </Text>
      </View>

      {rows.length === 0 ? (
        <View style={{ paddingVertical: 20, alignItems: "center" }}>
          <Text style={typography.caption}>
            No team members in the current clock-out queue.
          </Text>
        </View>
      ) : (
        rows.map((row) => {
          const tone = confidenceTone(row.confidence);
          const toneColor =
            tone === "success"
              ? colors.success
              : tone === "warning"
                ? colors.warning
                : tone === "danger"
                  ? colors.danger
                  : colors.textTertiary;
          const bg =
            tone === "success"
              ? colors.successDim
              : tone === "warning"
                ? colors.warningDim
                : tone === "danger"
                  ? colors.dangerDim
                  : colors.glassFill;
          const statusLabel =
            row.status === "clockedOut"
              ? "CLOCKED OUT"
              : row.status === "review"
                ? "REVIEW"
                : row.status === "lowMatch"
                  ? "LOW MATCH"
                  : "REMAINING";
          const selectable =
            row.status === "review" || row.status === "lowMatch";
          const selected = selectable && !deselectedIds.has(row.id);

          const rowContent = (
            <View
              style={[
                styles.teamRow,
                { backgroundColor: bg, borderBottomColor: colors.glassBorder },
              ]}
            >
              {selectable && (
                <Ionicons
                  name={selected ? "checkbox" : "square-outline"}
                  size={22}
                  color={selected ? colors.primary : colors.textTertiary}
                  style={{ marginRight: spacing.xs }}
                />
              )}
              <Avatar
                uri={row.faceImageUrl ?? null}
                name={row.fullName}
                size={36}
                ringColor={toneColor}
              />
              <View style={{ flex: 1, marginLeft: spacing.sm, minWidth: 0 }}>
                <Text style={typography.bodyStrong} numberOfLines={1}>
                  {row.fullName}
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    marginTop: 2,
                  }}
                >
                  <Text style={typography.caption} numberOfLines={1}>
                    {row.siteName ?? "Team member"}
                  </Text>
                  <View
                    style={[
                      styles.statusPill,
                      { backgroundColor: toneColor + "22" },
                    ]}
                  >
                    <Text style={[styles.statusPillText, { color: toneColor }]}>
                      {statusLabel}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={{ width: 82, alignItems: "flex-end" }}>
                {row.confidence != null ? (
                  <Text style={[typography.bodyStrong, { color: toneColor }]}>
                    {Math.round(row.confidence * 100)}%
                  </Text>
                ) : (
                  <Text style={typography.caption}>—</Text>
                )}
                {!!row.lastScan && (
                  <Text style={typography.caption}>
                    {new Date(row.lastScan).toLocaleTimeString("en-ZA", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                )}
              </View>
            </View>
          );

          return selectable ? (
            <Pressable key={row.id} onPress={() => onToggleSelect(row.id)}>
              {rowContent}
            </Pressable>
          ) : (
            <View key={row.id}>{rowContent}</View>
          );
        })
      )}

      <View style={styles.legendRow}>
        <LegendDot color={colors.success} label="70%+" />
        <LegendDot color={colors.warning} label="50–69%" />
        <LegendDot color={colors.danger} label="<50%" />
        <LegendDot color={colors.textTertiary} label="Pending" />
      </View>
    </GlassPanel>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  const { typography } = useFaceTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={typography.caption}>{label}</Text>
    </View>
  );
}

function StatBox({
  label,
  value,
  unit,
}: {
  label: string;
  value: number;
  unit: string;
}) {
  const { colors, typography, spacing } = useFaceTheme();
  return (
    <View
      style={[
        styles.statBox,
        {
          backgroundColor: colors.glassFill,
          borderRadius: 5,
          padding: spacing.xs,
        },
      ]}
    >
      <Text style={[typography.title, { marginVertical: 1 }]}>{value}</Text>
      <Text style={typography.caption}>{unit}</Text>
    </View>
  );
}

function ResultCard({
  phase,
  result,
  resumeProgress,
  onTryAgain,
}: {
  phase: Phase;
  result: ScanOutIdentifyResult;
  resumeProgress: number;
  onTryAgain: () => void;
}) {
  const { colors, typography, spacing } = useFaceTheme();

  if (phase === "noMatch") {
    return (
      <GlassPanel contentPadding={18}>
        <View style={{ alignItems: "center", gap: spacing.sm }}>
          <View
            style={[
              styles.iconCircle,
              {
                backgroundColor: colors.dangerDim,
                borderColor: colors.dangerBorder,
              },
            ]}
          >
            <Ionicons name="sad-outline" size={30} color={colors.danger} />
          </View>
          <Text style={[typography.headline, { color: colors.danger }]}>
            Couldn't verify this face
          </Text>
          <Text style={[typography.caption, { textAlign: "center" }]}>
            Make sure the worker is facing the camera and try again.
          </Text>
          <Pressable
            onPress={onTryAgain}
            style={[
              styles.actionButton,
              {
                backgroundColor: colors.success,
                marginTop: spacing.xs,
                width: "100%",
              },
            ]}
          >
            <Text
              style={[typography.bodyStrong, { color: colors.textOnPrimary }]}
            >
              TRY AGAIN
            </Text>
          </Pressable>
        </View>
      </GlassPanel>
    );
  }

  if (!("employee" in result)) return null;
  const { employee, site } = result;
  const time = new Date().toLocaleTimeString("en-ZA", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const date = new Date().toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const confidencePct =
    "confidence" in result ? Math.round(result.confidence * 100) : null;
  const tone = phase === "success" ? colors.success : colors.warning;

  return (
    <GlassPanel contentPadding={18}>
      <View style={{ alignItems: "center", gap: spacing.xxs }}>
        <View
          style={[
            styles.iconCircle,
            {
              backgroundColor:
                phase === "success" ? colors.successDim : colors.warningDim,
              borderColor: tone,
            },
          ]}
        >
          <Ionicons
            name={phase === "success" ? "checkmark" : "help"}
            size={32}
            color={tone}
          />
        </View>

        <Avatar
          uri={null}
          name={employee.fullName}
          size={48}
          ringColor={tone}
        />
        <Text style={typography.headline}>{employee.fullName}</Text>
        <Text style={[typography.body, { color: tone }]}>
          {phase === "success" ? "Clocked Out" : "Possible match — confirm?"}
        </Text>
        {!!site?.name && (
          <View
            style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
          >
            <Ionicons name="business-outline" size={12} color={colors.textTertiary} />
            <Text style={typography.caption}>Auto-detected: {site.name}</Text>
          </View>
        )}
        <Text style={[typography.title, { marginTop: 2 }]}>{time}</Text>
        <Text style={typography.caption}>{date}</Text>
        {confidencePct != null && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              marginTop: 2,
            }}
          >
            <Ionicons name="pulse" size={12} color={colors.textTertiary} />
            <Text style={typography.caption}>Match: {confidencePct}%</Text>
          </View>
        )}

        <View style={{ width: "100%", marginTop: spacing.sm, gap: 6 }}>
          <Text
            style={[
              typography.caption,
              {
                textAlign: "center",
                color:
                  phase === "needsConfirm"
                    ? colors.warning
                    : colors.textSecondary,
              },
            ]}
          >
            {phase === "needsConfirm"
              ? "Lower-confidence match — scanner continuing"
              : "Ready for next worker…"}
          </Text>
          <View
            style={[
              styles.progressTrack,
              { backgroundColor: colors.glassFillStrong },
            ]}
          >
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.round(resumeProgress * 100)}%`,
                  backgroundColor:
                    phase === "needsConfirm" ? colors.warning : colors.success,
                },
              ]}
            />
          </View>
        </View>
      </View>
    </GlassPanel>
  );
}

function EndSessionModal({
  visible,
  clockedOutToday,
  onCancel,
  onEnd,
}: {
  visible: boolean;
  clockedOutToday: number;
  onCancel: () => void;
  onEnd: () => void;
}) {
  const { colors, typography, spacing } = useFaceTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.modalOverlay}>
        <View style={{ width: "100%", maxWidth: 360 }}>
          <GlassPanel contentPadding={20}>
            <View style={{ gap: spacing.sm }}>
              <Text style={[typography.headline, { textAlign: "center" }]}>
                End Clock Out Session?
              </Text>
              <Text style={[typography.caption, { textAlign: "center" }]}>
                You have clocked out {clockedOutToday} worker
                {clockedOutToday === 1 ? "" : "s"} today.
              </Text>

              <Pressable
                onPress={onEnd}
                style={[
                  styles.actionButton,
                  { backgroundColor: colors.danger, marginTop: spacing.sm },
                ]}
              >
                <Text
                  style={[
                    typography.bodyStrong,
                    { color: colors.textOnPrimary },
                  ]}
                >
                  END SESSION
                </Text>
              </Pressable>
              <Pressable
                onPress={onCancel}
                style={[
                  styles.actionButton,
                  { backgroundColor: colors.glassFillStrong },
                ]}
              >
                <Text style={typography.bodyStrong}>CANCEL</Text>
              </Pressable>
            </View>
          </GlassPanel>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, paddingTop: 4, paddingBottom: 16 },
  pinned: { paddingTop: 4, paddingBottom: 8 },
  bodyScroll: { flexGrow: 1, paddingTop: 4 },
  centerFill: { alignItems: "center", justifyContent: "center" },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    gap: 8,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  lockCircle: {
    width: 78,
    height: 78,
    borderRadius: 39,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  startScannerButton: {
    width: "100%",
    borderRadius: 5,
    paddingVertical: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 6,
  },
  liveBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.62)",
  },
  liveBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  nightFillLight: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: "#FFF6E5",
  },
  nightToggle: {
    position: "absolute",
    bottom: 10,
    left: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.62)",
  },
  nightToggleActive: {
    backgroundColor: "#FFF6E5",
  },
  nightToggleText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  flipButton: {
    position: "absolute",
    bottom: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.62)",
  },
  summaryRow: { flexDirection: "row", gap: 8 },
  teamRow: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
  },
  tableHeader: {
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingBottom: 7,
    borderBottomWidth: 1,
  },
  tableHeaderText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },
  statusPill: { borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 },
  statusPillText: { fontSize: 8, fontWeight: "800", letterSpacing: 0.4 },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    paddingTop: 10,
    marginTop: 4,
  },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  controlRow: { flexDirection: "row", gap: 8 },
  footer: {
    paddingTop: 12,
    paddingBottom: 10,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 5,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  submitButton: {
    minHeight: 48,
    borderRadius: 5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  stageWrap: { alignItems: "center", justifyContent: "center" },
  stageGlow: {
    position: "absolute",
    borderRadius: 5,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 10,
  },
  stageBox: {
    borderRadius: 5,
    overflow: "hidden",
    borderWidth: 1,
  },
  statBox: { flex: 1, alignItems: "center" },
  actionButton: {
    borderRadius: 5,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  progressTrack: { height: 4, borderRadius: 2, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 2 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
});
