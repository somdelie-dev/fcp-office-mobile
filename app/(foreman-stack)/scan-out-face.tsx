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
import { useLocalSearchParams, useRouter } from "expo-router";

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
import {
  apiForemanScanOutPending,
  apiScanOutConfirm,
  apiScanOutIdentify,
  type ScanOutIdentifyResult,
} from "@/lib/apiClient";
import {
  speakFaceVerificationNoMatch,
  speakFaceVerificationSuccess,
} from "@/lib/faceVerificationSpeech";

// Same guarded load as verify.tsx/capture-reference.tsx — this Nitro Module
// throws at import time in Expo Go / web.
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
    console.warn("[scan-out-face] face detector module unavailable:", e);
  }
}
// "accurate" (not "fast") to match capture-reference.tsx — "fast" trades
// detection reliability for speed, which showed up as missed faces in low
// light (capture-reference detected the same face fine at night; this
// screen didn't). The poll cadence (IDLE_POLL_MS) is already the dominant
// per-tick cost, so the extra detector time here isn't noticeable.
const FACE_DETECTOR_OPTIONS = { performanceMode: "accurate" as const };

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Rough day/night window for auto-enabling night mode when the scanner
// starts — outside 06:00-18:00 local time. Deliberately simple (device
// clock, not sunrise/sunset) since this only sets a default the foreman can
// immediately switch off; it doesn't need to be astronomically precise.
function isNightHours(): boolean {
  const hour = new Date().getHours();
  return hour < 6 || hour >= 18;
}

// Polling cadence for the "camera stays on, workers walk up" loop — this
// takes a still frame periodically rather than analyzing a live video
// stream (no frame-processor pipeline in this codebase yet), so these
// numbers trade responsiveness against battery/data use. Untuned against a
// real device/shift — expect to revisit once this has been tried on site.
const IDLE_POLL_MS = 1300;
const RETRY_POLL_MS = 500;
// Minimum time the "Face detected / Capturing..." beat stays up before the
// identify call fires — purely perceptual, so a fast device doesn't skip
// straight past it looking broken.
const DETECTED_MIN_DISPLAY_MS = 450;
const RESULT_DISPLAY_MS = 1600;
const PAUSED_RECHECK_MS = 4000;

type Phase =
  | "permission"
  | "ready"
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
      // "complete", "scanning", "success" — all read as the same green.
      return colors.success;
  }
}

type TeamRowStatus = "remaining" | "clockedOut" | "review" | "lowMatch";

type TeamRow = {
  id: string;
  fullName: string;
  role: string;
  faceImageUrl?: string | null;
  status: TeamRowStatus;
  confidence?: number | null;
  lastScan?: string | null;
  /** Only set for a "review" match — needed to write the FaceVerificationAttempt audit row when it's later submitted. */
  matchedEnrollmentId?: string | null;
};

function normalizeTeamMember(raw: any): TeamRow | null {
  const employee = raw?.employee ?? raw;
  const id = employee?.id ?? raw?.employeeId;
  if (!id) return null;
  return {
    id: String(id),
    fullName: String(employee?.fullName ?? employee?.name ?? "Worker"),
    role: String(
      employee?.role ??
        employee?.jobTitle ??
        employee?.position ??
        "Team member",
    ),
    faceImageUrl: employee?.faceImageUrl ?? employee?.photoUrl ?? null,
    status: "remaining",
    confidence: null,
    lastScan: null,
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
 * Continuous "clocking machine" scanner: the foreman starts this once and
 * holds the phone while workers walk up one by one — no per-worker
 * selection. Replaces the old "pick a worker, then verify" flow for bulk
 * end-of-day scan-out; the per-worker manual Verify screen
 * (workers/[id]/verify.tsx) is unchanged and still exists for a one-off
 * identity check.
 */
export default function ScanOutFaceScanner() {
  const router = useRouter();
  const { colors, typography, spacing } = useFaceTheme();
  const { siteId, siteName } = useLocalSearchParams<{
    siteId?: string;
    siteName?: string;
  }>();
  // Fills most of the screen width — "as big as the Scanner Closed card" —
  // capped so it doesn't balloon on tablets.
  const { width: windowWidth } = useWindowDimensions();
  const cameraSize = Math.min(windowWidth - spacing.lg * 2, 460);

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
  // Opt-out model: every REVIEW/LOW MATCH row is submit-eligible by default,
  // this just tracks which ones the foreman has unchecked — so a newly
  // flagged row is automatically included without needing to be added here.
  const [deselectedIds, setDeselectedIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  // Manual pause keeps the camera live and on-screen (unlike "ready", which
  // closes it) — the foreman just wants to hold the phone up and wait for
  // the next worker without the loop actively firing captures.
  const [manuallyPaused, setManuallyPaused] = useState(false);
  // Front camera has no hardware flash on virtually any phone, so "night
  // mode" here means using the screen itself as fill light: a bright panel
  // behind the stage lights the worker's face from a dark room instead of
  // relying on a torch that doesn't exist on this camera. Defaults on
  // outside daylight hours (see isNightHours) since that's when the
  // scanner starts in the dark most often — the foreman can still switch
  // it off with the NIGHT toggle if it's not wanted.
  const [nightMode, setNightMode] = useState(isNightHours);
  // Front-facing by default — the foreman holds the phone facing the
  // worker walking up — but some sites may prefer the foreman looking at
  // the screen while pointing the back camera outward instead.
  const [facing, setFacing] = useState<CameraType>("front");
  // Derived, not separate state — teamMembers (kept live by markTeamMatch)
  // is the single source of truth, so this can never drift out of sync with
  // it the way a parallel setClockedOutToday(...) call could.
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
  // Employee ids still owed a scan-out. A Set (not just a count) so a repeat
  // match on someone already handled — e.g. the mock data cycling back
  // around — never double-decrements. Auto-stops the scanner once empty.
  const remainingIdsRef = useRef<Set<string>>(new Set());
  const rosterLoadedRef = useRef(false);

  const device = `${Device.modelName ?? Platform.OS} · Clock Out Scanner`.slice(
    0,
    200,
  );

  const refreshCounts = useCallback(async () => {
    if (!siteId) return;

    try {
      const res = await apiForemanScanOutPending(siteId, todayISO());
      setTotalToday(res.totalScannedInToday);
      setTeamMembers((prev) => {
        const next = new Map(prev.map((member) => [member.id, member]));
        for (const raw of res.employees as any[]) {
          const member = normalizeTeamMember(raw);
          if (!member) continue;
          const existing = next.get(member.id);
          if (!existing || existing.status === "remaining")
            next.set(member.id, member);
        }
        // The server only knows "scanned out or not" — it has no notion of
        // "flagged for review this session". Without this, a needsConfirm
        // match would keep reappearing here every refresh (never actually
        // recorded server-side) and the auto-stop check below would never
        // see remainingIdsRef reach zero on a real site with any low-
        // confidence matches. status === "review" is the local-only signal
        // that this one's been handed off, not actively pending anymore.
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
  }, [siteId]);

  const markTeamMatch = useCallback(
    (
      employee: any,
      confidence: number | null,
      status: TeamRowStatus,
      matchedEnrollmentId?: string | null,
    ) => {
      const id = String(employee?.id ?? "");
      if (!id) return;
      setTeamMembers((prev) => {
        const next = new Map(prev.map((member) => [member.id, member]));
        const existing = next.get(id);
        next.set(id, {
          id,
          fullName: String(
            employee?.fullName ?? existing?.fullName ?? "Worker",
          ),
          role: String(
            employee?.role ??
              employee?.jobTitle ??
              employee?.position ??
              existing?.role ??
              "Team member",
          ),
          faceImageUrl:
            employee?.faceImageUrl ?? existing?.faceImageUrl ?? null,
          status,
          confidence,
          lastScan: new Date().toISOString(),
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
  // mutually-recursive group and deliberately all plain functions, not
  // useCallback — any of them memoized with a stale dep array would freeze
  // its calls into whichever earlier render created it, silently dropping
  // back to old siteId/device/phase state inside a setTimeout chain that
  // can span many renders. Cheap to redefine each render; correctness here
  // matters more than avoiding a few extra function allocations.
  function scheduleNextTick(delayMs: number) {
    if (stoppedRef.current) return;
    if (pollTimer.current) clearTimeout(pollTimer.current);
    pollTimer.current = setTimeout(() => {
      runPollTick();
    }, delayMs);
  }

  const detectFace = useCallback(
    async (uri: string): Promise<boolean> => {
      if (!faceDetector) return true; // no local detector — let the server decide
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

    // Everyone who was scanned in today has now been scanned out — stop
    // instead of polling forever with no one left to match against.
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
    if (stoppedRef.current || phaseRef.current !== "scanning" || !siteId)
      return;
    if (!cameraRef.current || !cameraReadyRef.current) {
      // Camera hasn't fired onCameraReady yet (e.g. right after mount/permission
      // grant) — quick, quiet retry rather than surfacing an error.
      scheduleNextTick(RETRY_POLL_MS);
      return;
    }

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.5,
        base64: true,
        skipProcessing: true,
        // This fires silently in the background every poll tick (every
        // ~1.3s while idle) rather than as a deliberate one-off capture —
        // the default shutter click would mean a constant clicking noise
        // through an entire clock-out session.
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
        siteId,
        dateISO: todayISO(),
        device,
        image: photo.base64,
        checkLiveness: false,
      });
      if (stoppedRef.current) return;

      // Hold the "detected" beat for a minimum stretch, then flip to
      // "verifying" for whatever's left before showing the outcome — purely
      // perceptual pacing, the actual work already happened above.
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
          // Wrong moment (mid walk-up, two people briefly in frame) — no
          // need to interrupt the foreman for this, just keep scanning.
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
        // low_quality / no_match — a face was found but nothing matched
        // confidently enough. Worth a beat on screen, not a silent retry.
        speakFaceVerificationNoMatch();
        showResult("noMatch", res, true);
        return;
      }

      if (res.recorded) {
        if ("employee" in res) {
          markTeamMatch(res.employee, res.confidence, "clockedOut");
          remainingIdsRef.current.delete(res.employee.id);
          // Only after the server has actually recorded the clock-out —
          // fire-and-forget, never awaited, so a slow/failed TTS engine
          // can't delay the scanner returning to "ready for next person".
          speakFaceVerificationSuccess({
            employeeName: res.employee.fullName,
            action: "out",
          });
        }
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );
        showResult("success", res, true);
        refreshCounts();
        return;
      }

      // Lower-confidence match: keep the scanner moving. We do not change
      // server-side verification thresholds or force a clock-out; the row is
      // surfaced in yellow for review while the next worker can approach.
      if ("employee" in res) {
        markTeamMatch(
          res.employee,
          res.confidence,
          "review",
          res.matchedEnrollmentId,
        );
        remainingIdsRef.current.delete(res.employee.id);
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      showResult("needsConfirm", res, true);
    } catch (e: any) {
      // Camera can briefly report "not ready" again after the app
      // foregrounds/backgrounds even once cameraReadyRef was true — same
      // quiet, quick retry as the readiness check above, not a real error.
      if (
        typeof e?.message === "string" &&
        e.message.toLowerCase().includes("not ready")
      ) {
        scheduleNextTick(RETRY_POLL_MS);
        return;
      }
      console.error("[scan-out-face] poll tick failed:", e);
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
    if (!siteId || selectedReviewRows.length === 0 || submitting) return;
    setSubmitting(true);

    try {
      let succeeded = 0;
      let failed = 0;
      for (const row of selectedReviewRows) {
        try {
          const confirmRes = await apiScanOutConfirm({
            siteId,
            dateISO: todayISO(),
            employeeId: row.id,
            device,
            confidence: row.confidence ?? 0,
            matchedEnrollmentId: row.matchedEnrollmentId ?? undefined,
          });
          if (confirmRes.ok) {
            markTeamMatch(
              {
                id: row.id,
                fullName: row.fullName,
                role: row.role,
                faceImageUrl: row.faceImageUrl,
              },
              row.confidence ?? null,
              "clockedOut",
              row.matchedEnrollmentId,
            );
            succeeded += 1;
          } else {
            failed += 1;
          }
        } catch (e) {
          console.error("[scan-out-face] submit review failed:", e);
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
  }, [
    siteId,
    selectedReviewRows,
    submitting,
    device,
    markTeamMatch,
    refreshCounts,
  ]);

  if (!siteId) {
    return (
      <FaceScreenBackground>
        <Header title="Clock Out" subtitle="No site selected" />
        <View style={[styles.body, { paddingHorizontal: spacing.lg }]}>
          <GlassPanel>
            <Text style={typography.body}>
              Go back and select a site before scanning out.
            </Text>
          </GlassPanel>
        </View>
      </FaceScreenBackground>
    );
  }

  if (phase === "permission") {
    return (
      <FaceScreenBackground>
        <Header title="Clock Out" subtitle={siteName || "Face scanner"} />
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
            {/* Fill-light only helps facing the worker — on the back
                camera the screen faces the foreman instead, so the real
                torch below is used there instead. */}
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
                  // Resume — re-enter the scanning loop without touching the
                  // camera, which never stopped rendering.
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
          Start the scanner when your team is ready to clock out. Team members
          simply walk up and look at the camera.
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
        {/* <Text style={[typography.caption, { textAlign: "center" }]}>
          No Personel selection required
        </Text> */}
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
          {totalToday === 1 ? "" : "s"} scanned in today have been clocked out.
          Nothing left for the scanner to do.
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
                    {row.role}
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
      {/* <Text style={typography.caption}>{label}</Text> */}
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

  // success / needsConfirm both carry an `employee` — narrow the union once.
  if (!("employee" in result)) return null;
  const { employee } = result;
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
  // Camera section sits outside the ScrollView so it never scrolls away —
  // "sticky" without any scroll-position math.
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
  // Front camera has no torch, so this is the fill light: a large, bright,
  // warm-white panel behind the stage — its edges peek out past the darker
  // stageBox as a soft halo, throwing usable light onto whoever's holding
  // their face up to the screen in a dark room.
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
  // Sits below the ScrollView as a fixed sibling, not inside it — the
  // buttons stay visible no matter how far the team list scrolls.
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
  // width/height are set inline from the dynamic cameraSize, not here.
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
  endButton: {
    borderWidth: 1,
    borderRadius: 5,
    paddingVertical: 14,
    alignItems: "center",
  },
  actionButton: {
    borderRadius: 5,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  actionButtonFlex: { flex: 1 },
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
