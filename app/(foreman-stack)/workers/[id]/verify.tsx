import { CameraView, useCameraPermissions } from "expo-camera";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Device from "expo-device";
import { LinearGradient } from "expo-linear-gradient";
import { router, Stack, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { Avatar, CornerBrackets, FaceScreenBackground, Header } from "@/components/team";
import FacePreview from "@/components/team/FacePreview";
import GlassPanel from "@/components/team/GlassPanel";
import { FaceTheme, useFaceTheme } from "@/components/team/faceTheme";
import { apiForemanEmployee, apiScanOutFace, EmployeeDto } from "@/lib/apiClient";
import { describeQualityWarning } from "@/lib/faceQualityMessages";

// Same guarded load as capture-reference.tsx — react-native-vision-camera-face-detector
// is a Nitro Module that throws at import time in Expo Go / web, so it can
// only be pulled in through a guarded require() (see that file's comment for
// the full explanation).
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
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
    console.warn("[verify] face detector module unavailable:", e);
  }
}
const FACE_DETECTOR_OPTIONS = { performanceMode: "accurate" as const };

type Step = "prepare" | "align" | "detected" | "noFace" | "verifying" | "outcome";

type OutcomeKind = "verified" | "pending" | "rejected" | "noFace" | "lowQuality" | "error";

interface Outcome {
  kind: OutcomeKind;
  confidence: number | null;
  message?: string;
  completedAtISO: string;
}

const ALIGN_DURATION = 2200;
const CAPTURE_DELAY = 1400;
const VERIFY_MIN_DISPLAY = 1400;

const CAMERA_STAGE_SIZE = 240;

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function FaceOutlineIcon({ color }: { color: string }) {
  return (
    <Svg width={56} height={56} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={9} r={4} stroke={color} strokeWidth={1.6} />
      <Path
        d="M4.5 20C5.5 16.5 8.4 14.5 12 14.5C15.6 14.5 18.5 16.5 19.5 20"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function ChecklistIcon({ path, color }: { path: string; color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d={path} stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const CHECKLIST_ICON_PATHS = {
  target: "M12 2V5M12 19V22M2 12H5M19 12H22M12 8.5A3.5 3.5 0 1 0 12 15.5A3.5 3.5 0 1 0 12 8.5Z",
  glasses: "M3 10.5C3 9 4 8 5.5 8H8C9 8 9.5 9 9.5 10.5C9.5 12.5 8.5 13.5 6.5 13.5C4.5 13.5 3 12.5 3 10.5ZM14.5 10.5C14.5 9 15.5 8 17 8H18.5C20 8 21 9 21 10.5C21 12.5 19.5 13.5 17.5 13.5C15.5 13.5 14.5 12.5 14.5 10.5ZM9.5 10H14.5",
  sun: "M12 4.5V2M12 22V19.5M4.5 12H2M22 12H19.5M6 6L4.5 4.5M19.5 19.5L18 18M18 6L19.5 4.5M4.5 19.5L6 18M12 8.5A3.5 3.5 0 1 0 12 15.5A3.5 3.5 0 1 0 12 8.5Z",
  frame: "M4 4H8M4 4V8M20 4H16M20 4V8M4 20H8M4 20V16M20 20H16M20 20V16",
  hand: "M8 12.5V6.8C8 6 8.7 5.3 9.5 5.3C10.3 5.3 11 6 11 6.8V11M11 11V5.3C11 4.5 11.7 3.8 12.5 3.8C13.3 3.8 14 4.5 14 5.3V11M14 11V6.3C14 5.5 14.7 4.8 15.5 4.8C16.3 4.8 17 5.5 17 6.3V13M8 12.5C8 11.7 7.3 11 6.5 11C5.7 11 5 11.7 5 12.5V15C5 18 7.5 20.5 10.5 20.5H12.5C15 20.5 17 18.5 17 16V13",
};

const CHECKLIST = [
  { icon: CHECKLIST_ICON_PATHS.target, title: "Face the camera directly", subtitle: "Look straight at the camera" },
  { icon: CHECKLIST_ICON_PATHS.glasses, title: "Remove sunglasses", subtitle: "Clear view of your eyes" },
  { icon: CHECKLIST_ICON_PATHS.sun, title: "Good lighting", subtitle: "Use bright, even lighting" },
  { icon: CHECKLIST_ICON_PATHS.frame, title: "Keep your face in frame", subtitle: "Position your face inside the guide" },
  { icon: CHECKLIST_ICON_PATHS.hand, title: "Hold still", subtitle: "Don't move while scanning" },
];

function CheckCircleIcon({ color, size = 72 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} stroke={color} strokeWidth={1.6} />
      <Path d="M7.5 12.5L10.3 15.3L16.5 8.5" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function AlertCircleIcon({ color, size = 72 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} stroke={color} strokeWidth={1.6} />
      <Path d="M12 7.5V13" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
      <Circle cx={12} cy={16.3} r={1.15} fill={color} />
    </Svg>
  );
}

function XCircleIcon({ color, size = 72 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} stroke={color} strokeWidth={1.6} />
      <Path d="M9 9L15 15M15 9L9 15" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}

function CalendarCheckIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 4.5H19V19.5H5V4.5ZM5 9H19M8 3V6M16 3V6"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M9 14L11 16L15.5 11.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function PrimaryButton({
  label,
  onPress,
  tone = "primary",
  disabled,
}: {
  label: string;
  onPress: () => void;
  tone?: "primary" | "success" | "danger" | "glass";
  disabled?: boolean;
}) {
  const { colors, typography, radius, shadows } = useFaceTheme();

  if (tone === "glass") {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [
          styles.glassButton,
          {
            borderRadius: radius.md,
            backgroundColor: colors.glassFill,
            borderColor: colors.glassBorder,
          },
          pressed && { opacity: 0.85 },
          disabled && { opacity: 0.5 },
        ]}
      >
        <Text style={typography.bodyStrong}>{label}</Text>
      </Pressable>
    );
  }

  const gradientColors =
    tone === "success"
      ? (["#22C55E", "#16A34A"] as const)
      : tone === "danger"
        ? (["#EF4444", "#DC2626"] as const)
        : colors.gradientPrimaryAction;

  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [pressed && { opacity: 0.9 }, disabled && { opacity: 0.5 }]}>
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.primaryButton, { borderRadius: radius.md }, shadows.glowSoft]}
      >
        <Text style={[typography.bodyStrong, { color: colors.textOnPrimary, letterSpacing: 0.6 }]}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

function FaceCameraStage({
  cameraRef,
  tone,
  onReady,
}: {
  cameraRef: React.RefObject<CameraView | null>;
  tone: "scanning" | "detected" | "noFace";
  onReady?: () => void;
}) {
  const { colors } = useFaceTheme();
  // "scanning" also reads success-green, not primary blue — this whole flow
  // is styled around the green "clock out" identity end to end.
  const ringColor = tone === "noFace" ? colors.danger : colors.success;

  return (
    <View style={styles.stageWrap}>
      <View style={[styles.stageGlow, { shadowColor: ringColor }]} />
      <View style={[styles.stageCircle, { backgroundColor: colors.backgroundDeep, borderColor: colors.glassBorderStrong }]}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="front" onCameraReady={onReady} />
      </View>
      <CornerBrackets size={CAMERA_STAGE_SIZE * 0.72} color={ringColor} />
    </View>
  );
}

function SelectedWorkerCard({
  employee,
  scannedInAtISO,
}: {
  employee: EmployeeDto | null;
  scannedInAtISO?: string;
}) {
  const { colors, typography, spacing } = useFaceTheme();
  if (!employee) return null;

  return (
    <GlassPanel contentPadding={12} style={{ width: "100%", marginBottom: spacing.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <Avatar uri={employee.faceImageUrl} name={employee.fullName} size={40} ringColor={colors.success} />
        <View style={{ flex: 1 }}>
          <Text style={[typography.caption, { textTransform: "uppercase", letterSpacing: 0.6 }]}>
            Selected Worker
          </Text>
          <Text style={typography.bodyStrong} numberOfLines={1}>
            {employee.fullName}
          </Text>
          {!!scannedInAtISO && (
            <Text style={[typography.caption, { marginTop: 1 }]}>
              Scanned in{" "}
              {new Date(scannedInAtISO).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
            </Text>
          )}
        </View>
      </View>
    </GlassPanel>
  );
}

function CapturedPreviewStage({ uri }: { uri: string }) {
  return (
    <View style={styles.stageWrap}>
      <FacePreview photoUri={uri} size={CAMERA_STAGE_SIZE - 40} />
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  const { colors, typography } = useFaceTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={typography.caption}>{label}</Text>
      <Text style={[typography.caption, { color: colors.textPrimary, fontWeight: "700" }]}>{value}</Text>
    </View>
  );
}

function ProgressBar({ label, value, progress }: { label: string; value: string; progress: number }) {
  const { colors, typography, spacing } = useFaceTheme();

  return (
    <View style={{ gap: spacing.xxs }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={typography.caption}>{label}</Text>
        <Text style={[typography.caption, { color: colors.textPrimary }]}>{value}</Text>
      </View>
      <View style={[styles.progressTrack, { backgroundColor: colors.glassFill }]}>
        <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: colors.primary }]} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function VerifyFaceScreen() {
  // See workers/[id]/index.tsx — coerce to a stable string so the effect
  // below doesn't re-fire on every render.
  const params = useLocalSearchParams<{ id: string; scannedInAtISO?: string }>();
  const id = String(params.id ?? "");
  const scannedInAtISO = params.scannedInAtISO;
  const { colors, typography, radius, spacing } = useFaceTheme();

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [step, setStep] = useState<Step>("prepare");
  const [employee, setEmployee] = useState<EmployeeDto | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [analyzingProgress, setAnalyzingProgress] = useState(0);
  const [matchingProgress, setMatchingProgress] = useState(0);
  const [captureProgress, setCaptureProgress] = useState(0);

  // See capture-reference.tsx — same guarded hook, same "presence is fixed
  // for the process lifetime" reasoning for why this is safe behind the
  // conditional.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const faceDetector = useImageFaceDetector ? useImageFaceDetector(FACE_DETECTOR_OPTIONS) : null;

  const detectFace = useCallback(
    async (uri: string): Promise<boolean> => {
      if (!faceDetector) return true;
      try {
        const faces = await faceDetector.detectFaces(uri);
        return faces.length > 0;
      } catch (e) {
        console.warn("[verify] face detection failed, allowing capture:", e);
        return true;
      }
    },
    [faceDetector],
  );

  useEffect(() => {
    if (!id) return;
    apiForemanEmployee(id)
      .then((res) => setEmployee(res.employee))
      .catch(() => setEmployee(null));
  }, [id]);

  // "align" step: give the camera a moment to settle, then move on.
  useEffect(() => {
    if (step !== "align") return;
    const timer = setTimeout(() => setStep("detected"), ALIGN_DURATION);
    return () => clearTimeout(timer);
  }, [step]);

  // "detected" step: capture the still frame after a short hold.
  useEffect(() => {
    if (step !== "detected") return;
    let cancelled = false;

    setCaptureProgress(0);
    const start = Date.now();
    let progressTimer: ReturnType<typeof setTimeout>;
    function tickProgress() {
      const t = Math.min(1, (Date.now() - start) / CAPTURE_DELAY);
      setCaptureProgress(t);
      if (t < 1 && !cancelled) progressTimer = setTimeout(tickProgress, 40);
    }
    tickProgress();

    const timer = setTimeout(async () => {
      try {
        const photo = await cameraRef.current?.takePictureAsync({ quality: 0.5, base64: true, skipProcessing: true });
        if (cancelled || !photo) return;

        // Validate there's an actual face in the shot before submitting it
        // for identity verification — otherwise a wall, a hand, or a blank
        // frame gets compared against the employee's enrolled face exactly
        // like a real attempt would.
        const hasFace = await detectFace(photo.uri);
        if (cancelled) return;
        if (!hasFace) {
          setStep("noFace");
          return;
        }

        setCapturedUri(photo.uri);
        setStep("verifying");
        void runVerification(photo.base64 ?? null);
      } catch (e: any) {
        if (cancelled) return;
        setOutcome({
          kind: "error",
          confidence: null,
          message: e?.message ?? "Could not capture a photo.",
          completedAtISO: new Date().toISOString(),
        });
        setStep("outcome");
      }
    }, CAPTURE_DELAY);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearTimeout(progressTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // "verifying" step: cosmetic progress ramp while the real call is in flight.
  useEffect(() => {
    if (step !== "verifying") return;
    setAnalyzingProgress(0);
    setMatchingProgress(0);
    let raf: ReturnType<typeof setTimeout>;
    const start = Date.now();
    function tick() {
      const t = Math.min(1, (Date.now() - start) / VERIFY_MIN_DISPLAY);
      setAnalyzingProgress(Math.min(1, t / 0.45));
      setMatchingProgress(t);
      if (t < 1) raf = setTimeout(tick, 40);
    }
    tick();
    return () => clearTimeout(raf);
  }, [step]);

  const runVerification = useCallback(
    async (base64: string | null) => {
      if (!id) return;
      const device = `${Device.modelName ?? Platform.OS} · Face Verification`.slice(0, 200);
      const startedAt = Date.now();

      try {
        const res = await apiScanOutFace({
          employeeId: id,
          device,
          image: base64 ?? undefined,
        });

        const elapsed = Date.now() - startedAt;
        if (elapsed < VERIFY_MIN_DISPLAY) {
          await new Promise((resolve) => setTimeout(resolve, VERIFY_MIN_DISPLAY - elapsed));
        }

        setAnalyzingProgress(1);
        setMatchingProgress(1);

        const kind: OutcomeKind =
          res.reason === "no_face_detected" || res.reason === "multiple_faces_detected"
            ? "noFace"
            : res.reason === "low_quality"
              ? "lowQuality"
              : res.verificationStatus === "VERIFIED"
                ? "verified"
                : res.verificationStatus === "REJECTED"
                  ? "rejected"
                  : "pending";

        // Specific retake instruction(s) when the live photo itself was
        // rejected before any match was attempted — same mapping
        // capture-reference.tsx uses for enrollment, so the wording is
        // consistent across both screens.
        const message =
          kind === "lowQuality" && res.warnings?.length
            ? res.warnings.map(describeQualityWarning).join(", ")
            : undefined;

        setOutcome({ kind, confidence: res.confidence, message, completedAtISO: new Date().toISOString() });
      } catch (e: any) {
        setOutcome({
          kind: "error",
          confidence: null,
          message: e?.message ?? "Verification failed. Please try again.",
          completedAtISO: new Date().toISOString(),
        });
      } finally {
        setStep("outcome");
      }
    },
    [id],
  );

  const handleContinue = useCallback(async () => {
    if (permission?.granted) {
      setStep("align");
      return;
    }
    const result = await requestPermission();
    if (result.granted) {
      setPermissionDenied(false);
      setStep("align");
    } else {
      setPermissionDenied(true);
    }
  }, [permission, requestPermission]);

  const handleRetry = useCallback(() => {
    setCapturedUri(null);
    setOutcome(null);
    setStep("align");
  }, []);

  const handleRetryNoFace = useCallback(() => {
    setStep("align");
  }, []);

  const handleDone = useCallback(() => {
    if (id) {
      router.replace({ pathname: "/(foreman-stack)/workers/[id]", params: { id } });
    } else if (router.canGoBack()) {
      router.back();
    }
  }, [id]);

  const stepHeader = useMemo(() => {
    switch (step) {
      case "prepare":
        return { title: "Prepare for Verification", subtitle: "A few tips before we scan" };
      case "align":
        return { title: "Align Your Face", subtitle: "Position your face inside the frame" };
      case "detected":
        return { title: "Face Detected", subtitle: "Hold still while we capture" };
      case "noFace":
        return { title: "No Face Detected", subtitle: "Let's try that again" };
      case "verifying":
        return { title: "Verifying Identity", subtitle: "Please wait…" };
      case "outcome":
        return { title: "Face Verification", subtitle: employee?.fullName ?? "" };
    }
  }, [step, employee]);

  const handleBack = useCallback(() => {
    // Every step's back arrow just exits the flow rather than rewinding
    // through an in-progress capture.
    if (router.canGoBack()) router.back();
  }, []);

  return (
    <FaceScreenBackground>
      <Stack.Screen options={{ headerLeft: () => null }} />
      <Header title={stepHeader.title} subtitle={stepHeader.subtitle} onBackPress={handleBack} />

      <View style={[styles.body, { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg }]}>
        {step === "prepare" && (
          <View style={{ gap: spacing.lg, width: "100%" }}>
            <View style={[styles.faceIconWrap, { backgroundColor: colors.glassFill, borderColor: colors.glassBorder }]}>
              <FaceOutlineIcon color={colors.primary} />
            </View>

            <GlassPanel radius={radius.xl}>
              <View style={{ gap: spacing.md }}>
                {CHECKLIST.map((item) => (
                  <View key={item.title} style={[styles.checklistRow, { gap: spacing.sm }]}>
                    <View style={[styles.checklistIconWrap, { borderRadius: radius.sm, backgroundColor: colors.glassFill, borderColor: colors.glassBorder }]}>
                      <ChecklistIcon path={item.icon} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={typography.bodyStrong}>{item.title}</Text>
                      <Text style={[typography.caption, { marginTop: 2 }]}>{item.subtitle}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </GlassPanel>

            {permissionDenied && (
              <Text style={[typography.caption, { color: colors.warning, textAlign: "center" }]}>
                Camera access is required to verify your face. Please allow it in settings and try again.
              </Text>
            )}

            <PrimaryButton label="CONTINUE" tone="success" onPress={handleContinue} />
          </View>
        )}

        {step === "align" && (
          <View style={styles.stageScreen}>
            <SelectedWorkerCard employee={employee} scannedInAtISO={scannedInAtISO} />
            <FaceCameraStage cameraRef={cameraRef} tone="scanning" />
            <Text style={[typography.bodyStrong, { marginTop: spacing.xl }]}>Position your face inside the frame</Text>
            <Text style={[typography.caption, { marginTop: spacing.xxs, color: colors.success }]}>Looking for face…</Text>
          </View>
        )}

        {step === "detected" && (
          <View style={styles.stageScreen}>
            <SelectedWorkerCard employee={employee} scannedInAtISO={scannedInAtISO} />
            <FaceCameraStage cameraRef={cameraRef} tone="detected" />
            <Text style={[typography.bodyStrong, { marginTop: spacing.xl, color: colors.success }]}>
              Great! Face detected
            </Text>
            <Text style={[typography.caption, { marginTop: spacing.xxs }]}>Hold still while we capture</Text>
            <View style={{ width: "100%", marginTop: spacing.lg }}>
              <ProgressBar label="Capturing" value={`${Math.round(captureProgress * 100)}%`} progress={captureProgress} />
            </View>
          </View>
        )}

        {step === "noFace" && (
          <View style={styles.stageScreen}>
            <SelectedWorkerCard employee={employee} scannedInAtISO={scannedInAtISO} />
            <FaceCameraStage cameraRef={cameraRef} tone="noFace" />
            <Text style={[typography.bodyStrong, { marginTop: spacing.xl, color: colors.danger }]}>No face detected</Text>
            <Text style={[typography.caption, { marginTop: spacing.xxs, textAlign: "center" }]}>
              Make sure your face is clearly visible and well lit
            </Text>
            <View style={{ width: "100%", marginTop: spacing.lg }}>
              <PrimaryButton label="TRY AGAIN" tone="success" onPress={handleRetryNoFace} />
            </View>
          </View>
        )}

        {step === "verifying" && (
          <View style={styles.stageScreen}>
            <SelectedWorkerCard employee={employee} scannedInAtISO={scannedInAtISO} />
            {capturedUri ? <CapturedPreviewStage uri={capturedUri} /> : null}

            <GlassPanel radius={radius.xl} style={{ width: "100%", marginTop: spacing.xl }}>
              <View style={{ gap: spacing.md }}>
                <ProgressBar label="Analyzing face" value={`${Math.round(analyzingProgress * 100)}%`} progress={analyzingProgress} />
                <ProgressBar label="Matching identity" value={`${Math.round(matchingProgress * 100)}%`} progress={matchingProgress} />
              </View>

              <View style={{ alignItems: "center", marginTop: spacing.lg }}>
                <Text style={typography.caption}>Confidence</Text>
                <Text style={[typography.display, { marginTop: 2 }]}>{Math.round(matchingProgress * 100)}%</Text>
                <Text style={[typography.caption, { marginTop: spacing.xxs }]}>Please wait…</Text>
              </View>
            </GlassPanel>
          </View>
        )}

        {step === "outcome" && outcome && (
          <OutcomeStage
            outcome={outcome}
            employeeName={employee?.fullName}
            employeePhotoUrl={employee?.faceImageUrl}
            onDone={handleDone}
            onRetry={handleRetry}
          />
        )}
      </View>
    </FaceScreenBackground>
  );
}

function OutcomeStage({
  outcome,
  employeeName,
  employeePhotoUrl,
  onDone,
  onRetry,
}: {
  outcome: Outcome;
  employeeName?: string;
  employeePhotoUrl?: string | null;
  onDone: () => void;
  onRetry: () => void;
}) {
  const { colors, typography, radius, spacing }: FaceTheme = useFaceTheme();

  const config = {
    verified: {
      Icon: CheckCircleIcon,
      color: colors.success,
      title: "VERIFIED",
      message: outcome.confidence != null ? `${Math.round(outcome.confidence * 100)}% Match` : "Match confirmed",
      note: "Scan out recorded successfully",
    },
    pending: {
      Icon: AlertCircleIcon,
      color: colors.warning,
      title: "PENDING REVIEW",
      message:
        outcome.confidence != null
          ? `${Math.round(outcome.confidence * 100)}% Match`
          : "Couldn't confidently match your face",
      note: "Scan out recorded — a supervisor will review this",
    },
    noFace: {
      Icon: AlertCircleIcon,
      color: colors.warning,
      title: "NO FACE DETECTED",
      message: "We couldn't find a face in that photo",
      note: "Scan out recorded — please retake next time",
    },
    lowQuality: {
      Icon: AlertCircleIcon,
      color: colors.warning,
      title: "PHOTO QUALITY ISSUE",
      message: outcome.message ?? "That photo wasn't clear enough to check",
      note: "Scan out recorded — please retake next time",
    },
    rejected: {
      Icon: XCircleIcon,
      color: colors.danger,
      title: "NOT VERIFIED",
      message:
        outcome.confidence != null ? `${Math.round(outcome.confidence * 100)}% Match` : "Face didn't match your profile",
      note: "Scan out recorded and flagged for review",
    },
    error: {
      Icon: XCircleIcon,
      color: colors.danger,
      title: "VERIFICATION FAILED",
      message: outcome.message ?? "Something went wrong.",
      note: null,
    },
  }[outcome.kind];

  const Icon = config.Icon;
  const completedAt = new Date(outcome.completedAtISO);

  return (
    <View style={styles.stageScreen}>
      {employeeName && outcome.kind !== "error" && (
        <Avatar uri={employeePhotoUrl} name={employeeName} size={56} ringColor={config.color} />
      )}

      <View style={[styles.outcomeIconGlow, { marginTop: spacing.md, shadowColor: config.color }]}>
        <Icon color={config.color} />
      </View>

      <Text style={[typography.title, { marginTop: spacing.lg, color: config.color }]}>{config.title}</Text>
      {employeeName && outcome.kind !== "error" && (
        <Text style={[typography.headline, { marginTop: spacing.xxs }]}>{employeeName}</Text>
      )}
      <Text style={[typography.body, { marginTop: spacing.xxs, textAlign: "center" }]}>{config.message}</Text>

      {config.note && (
        <GlassPanel radius={radius.md} style={{ width: "100%", marginTop: spacing.lg }} contentPadding={16}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <CalendarCheckIcon color={config.color} />
            <Text style={[typography.bodyStrong, { flex: 1 }]}>Attendance Recorded</Text>
          </View>

          <View style={{ marginTop: spacing.md, gap: spacing.xs }}>
            <DetailRow label="Action" value="Clock Out" />
            <DetailRow
              label="Time"
              value={completedAt.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}
            />
            <DetailRow label="Date" value={completedAt.toLocaleDateString("en-ZA")} />
            <DetailRow label="Method" value="Face Scan" />
            {outcome.confidence != null && (
              <DetailRow label="Match Score" value={`${Math.round(outcome.confidence * 100)}%`} />
            )}
          </View>
        </GlassPanel>
      )}

      <View style={{ width: "100%", marginTop: spacing.xl, gap: spacing.sm }}>
        {outcome.kind === "error" ? (
          <>
            <PrimaryButton label="TRY AGAIN" onPress={onRetry} />
            <PrimaryButton label="CANCEL" tone="glass" onPress={onDone} />
          </>
        ) : (
          <PrimaryButton
            label="DONE"
            tone={outcome.kind === "verified" ? "success" : outcome.kind === "rejected" ? "danger" : "primary"}
            onPress={onDone}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    alignItems: "center",
  },
  faceIconWrap: {
    alignSelf: "center",
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  checklistRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  checklistIconWrap: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  primaryButton: {
    width: "100%",
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  glassButton: {
    width: "100%",
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  stageScreen: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  stageWrap: {
    width: CAMERA_STAGE_SIZE,
    height: CAMERA_STAGE_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  stageGlow: {
    position: "absolute",
    width: CAMERA_STAGE_SIZE,
    height: CAMERA_STAGE_SIZE,
    borderRadius: CAMERA_STAGE_SIZE / 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 26,
    elevation: 12,
  },
  stageCircle: {
    width: CAMERA_STAGE_SIZE - 16,
    height: CAMERA_STAGE_SIZE - 16,
    borderRadius: (CAMERA_STAGE_SIZE - 16) / 2,
    overflow: "hidden",
    borderWidth: 2,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  outcomeIconGlow: {
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 10,
  },
});
