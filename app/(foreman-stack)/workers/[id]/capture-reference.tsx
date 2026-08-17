import { CameraView, useCameraPermissions } from "expo-camera";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Device from "expo-device";
import { LinearGradient } from "expo-linear-gradient";
import { router, Stack, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { FaceScreenBackground, GlassPanel, Header } from "@/components/team";
import { useFaceTheme } from "@/components/team/faceTheme";
import {
  apiCreateFaceEnrollments,
  apiForemanEmployee,
  EmployeeDto,
  FaceEnrollmentPose,
} from "@/lib/apiClient";
import { describeQualityWarning } from "@/lib/faceQualityMessages";

// react-native-vision-camera-face-detector is a Nitro Module — it calls
// `NitroModules.createHybridObject(...)` at the top of its own module file,
// outside of any function, and that throws immediately the moment the
// module is evaluated wherever there's no native Nitro runtime to back it:
// Expo Go ("NitroModules are not supported in Expo Go!") and web (Nitro
// Modules only bind to iOS/Android — there is no web implementation, dev
// client or not). A plain `import` at the top of this file would run that
// at file-load time and crash the whole route before it even renders.
// Loading it through a guarded `require()` means it's only evaluated on a
// native dev client / build, so the module's side effects never run
// anywhere we can't use it anyway. The try/catch is a second safety net in
// case some other environment turns out not to support it either.
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
    console.warn("[capture-reference] face detector module unavailable:", e);
  }
}

type Step =
  | "intro"
  | "align"
  | "detected"
  | "noFace"
  | "captured"
  | "review"
  | "uploading"
  | "done"
  | "error";

interface PoseSpec {
  pose: FaceEnrollmentPose;
  label: string;
  instruction: string;
}

const POSES: PoseSpec[] = [
  { pose: "FRONT", label: "Front", instruction: "Look straight at the camera" },
  { pose: "LEFT", label: "Left", instruction: "Slowly turn your head to the left" },
  { pose: "RIGHT", label: "Right", instruction: "Slowly turn your head to the right" },
  { pose: "SMILE", label: "Smile", instruction: "Give a natural smile" },
  { pose: "NEUTRAL", label: "Neutral", instruction: "Relax your expression" },
];

// Slower, more deliberate pacing than a snapshot-fast auto-capture — the
// user should be able to see each stage happen, not just have the sequence
// fly past.
const ALIGN_DURATION = 2200;
const CAPTURE_DELAY = 1500;
const CAPTURED_HOLD = 900;

const CAMERA_STAGE_SIZE = 240;

// Module-level so it's a stable reference — passing a fresh object literal
// to useImageFaceDetector on every render would recreate the native
// detector on every render too (its internal memoization keys off object
// identity, not contents).
const FACE_DETECTOR_OPTIONS = { performanceMode: "accurate" as const };

interface CapturedPhoto {
  uri: string;
}

// face-service can accept the upload (200 OK) while still rejecting
// individual photos (no_face_detected / multiple_faces_detected /
// decode_failed / low_quality) — those don't become FaceEnrollment rows at
// all. Mapping the raw code(s) to something a foreman can act on here.
// (describeQualityWarning itself lives in lib/faceQualityMessages.ts, shared
// with verify.tsx's live-verification retake messaging.)
function describeEnrollError(code: string, warnings?: string[]): string {
  switch (code) {
    case "no_face_detected":
      return "No face detected — retake";
    case "multiple_faces_detected":
      return "More than one face — retake";
    case "decode_failed":
      return "Couldn't read photo — retake";
    case "duplicate_face":
      return "Face already enrolled under another worker — contact your admin";
    case "low_quality":
      return warnings?.length
        ? `${warnings.map(describeQualityWarning).join(", ")} — retake`
        : "Photo quality too low — retake";
    default:
      return "Rejected — retake";
  }
}

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

function CheckCircleIcon({ color, size = 72 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} stroke={color} strokeWidth={1.6} />
      <Path d="M7.5 12.5L10.3 15.3L16.5 8.5" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
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

function CheckIcon({ color }: { color: string }) {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
      <Path d="M4 12.5L9.5 18L20 6" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function SmallXIcon({ color }: { color: string }) {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
      <Path d="M6 6L18 18M18 6L6 18" stroke={color} strokeWidth={3} strokeLinecap="round" />
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
          { borderRadius: radius.md, backgroundColor: colors.glassFill, borderColor: colors.glassBorder },
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

function CornerBrackets({ size, color }: { size: number; color: string }) {
  const len = size * 0.16;
  const inset = size * 0.06;
  return (
    <View style={[StyleSheet.absoluteFillObject, { alignItems: "center", justifyContent: "center" }]} pointerEvents="none">
      <View style={{ width: size + inset * 2, height: size + inset * 2 }}>
        <View style={[bracketStyles.corner, { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderColor: color, width: len, height: len, borderTopLeftRadius: 10 }]} />
        <View style={[bracketStyles.corner, { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderColor: color, width: len, height: len, borderTopRightRadius: 10 }]} />
        <View style={[bracketStyles.corner, { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderColor: color, width: len, height: len, borderBottomLeftRadius: 10 }]} />
        <View style={[bracketStyles.corner, { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderColor: color, width: len, height: len, borderBottomRightRadius: 10 }]} />
      </View>
    </View>
  );
}

const bracketStyles = StyleSheet.create({
  corner: { position: "absolute" },
});

function FaceCameraStage({
  cameraRef,
  tone,
  overlayUri,
  onReady,
}: {
  cameraRef: React.RefObject<CameraView | null>;
  tone: "scanning" | "detected" | "noFace";
  /** When set, covers the live feed with the just-captured still (no camera remount). */
  overlayUri?: string;
  onReady?: () => void;
}) {
  const { colors } = useFaceTheme();
  const ringColor = tone === "detected" ? colors.success : tone === "noFace" ? colors.danger : colors.primary;

  return (
    <View style={styles.stageWrap}>
      <View style={[styles.stageGlow, { shadowColor: ringColor }]} />
      <View style={[styles.stageCircle, { backgroundColor: colors.backgroundDeep, borderColor: colors.glassBorderStrong }]}>
        {/* Mounted once for the whole capture session — swapping this in and out of the
            tree per-pose caused expo-camera's session teardown/setup to race and hang. */}
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFillObject} facing="front" onCameraReady={onReady} />
        {overlayUri && <Image source={{ uri: overlayUri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />}
      </View>
      <CornerBrackets size={CAMERA_STAGE_SIZE * 0.72} color={ringColor} />
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

function PoseDots({ total, current, done }: { total: number; current: number; done: boolean[] }) {
  const { colors, spacing } = useFaceTheme();
  return (
    <View style={{ flexDirection: "row", gap: spacing.xs, justifyContent: "center" }}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.poseDot,
            {
              backgroundColor: done[i] ? colors.success : i === current ? colors.primary : colors.glassBorder,
            },
          ]}
        />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function CaptureReferencePhotosScreen() {
  // See index.tsx — coerce to a stable string so effects keyed on `id` don't
  // re-fire on every render.
  const params = useLocalSearchParams<{ id: string }>();
  const id = String(params.id ?? "");
  const { colors, typography, radius, spacing } = useFaceTheme();

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [step, setStep] = useState<Step>("intro");
  const [employee, setEmployee] = useState<EmployeeDto | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [poseIndex, setPoseIndex] = useState(0);
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [captureProgress, setCaptureProgress] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Keyed by pose index — set when face-service rejected that specific
  // photo (see describeEnrollError). Drives the retake prompt on review.
  const [photoIssues, setPhotoIssues] = useState<Record<number, string>>({});
  // Once every pose has been through the review screen once, any later
  // single-pose retake should drop straight back into review instead of
  // resuming the initial front→left→right→smile→neutral sequence.
  const [reachedReview, setReachedReview] = useState(false);

  // null in Expo Go (see the guarded require above) or if the dev client
  // hasn't been rebuilt with the native module yet. `useImageFaceDetector`'s
  // presence is fixed for the lifetime of the process (decided once, at
  // import time, from the execution environment) so calling it behind this
  // check never changes which hooks fire between renders of this screen.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const faceDetector = useImageFaceDetector ? useImageFaceDetector(FACE_DETECTOR_OPTIONS) : null;

  const detectFace = useCallback(
    async (uri: string): Promise<boolean> => {
      if (!faceDetector) return true;
      try {
        const faces = await faceDetector.detectFaces(uri);
        return faces.length > 0;
      } catch (e) {
        // Detector errored on this image — don't block capture on it, just
        // skip validation for this shot.
        console.warn("[capture-reference] face detection failed, allowing capture:", e);
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

  const currentPose = POSES[poseIndex];

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
        if (cancelled) return;
        if (!cameraRef.current) throw new Error("Camera is not ready yet.");
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.8, skipProcessing: true });
        if (cancelled || !photo) throw new Error("Could not capture a photo.");

        // Validate there's an actual face in the shot before accepting it —
        // otherwise a blank wall or a stray hand would count as a "reference
        // photo" just as happily as a real face.
        const hasFace = await detectFace(photo.uri);
        if (cancelled) return;
        if (!hasFace) {
          setStep("noFace");
          return;
        }

        setPhotos((prev) => {
          const next = [...prev];
          next[poseIndex] = { uri: photo.uri };
          return next;
        });
        setStep("captured");
      } catch (e: any) {
        if (cancelled) return;
        setErrorMessage(e?.message ?? "Could not capture a photo.");
        setStep("error");
      }
    }, CAPTURE_DELAY);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearTimeout(progressTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, poseIndex, detectFace]);

  // "captured" step: brief confirmation, then advance to the next pose, or
  // to the review screen once every pose has a photo (also where any
  // single-pose retake from review lands, regardless of its index).
  useEffect(() => {
    if (step !== "captured") return;
    const timer = setTimeout(() => {
      if (poseIndex < POSES.length - 1 && !reachedReview) {
        setPoseIndex((i) => i + 1);
        setStep("align");
      } else {
        setReachedReview(true);
        setStep("review");
      }
    }, CAPTURED_HOLD);
    return () => clearTimeout(timer);
  }, [step, poseIndex, reachedReview]);

  const runUpload = useCallback(
    async (allPhotos: CapturedPhoto[]) => {
      if (!id) return;
      setUploadProgress(0);
      const raf = setInterval(() => {
        setUploadProgress((p) => Math.min(0.9, p + 0.08));
      }, 120);

      try {
        const device = `${Device.modelName ?? Platform.OS} · Reference Capture`.slice(0, 200);
        const payload = allPhotos.map((photo, i) => ({
          uri: photo.uri,
          name: `${POSES[i].pose.toLowerCase()}-${Date.now()}.jpg`,
          type: "image/jpeg",
          pose: POSES[i].pose,
        }));
        const { results } = await apiCreateFaceEnrollments(id, payload, { device });
        setUploadProgress(1);

        // The request itself succeeding (200 OK) doesn't mean every photo
        // became a FaceEnrollment row — face-service rejects individual
        // images (no face / multiple faces / undecodable) without failing
        // the whole call. Surface those instead of silently reporting
        // success for photos that were never saved.
        const issues: Record<number, string> = {};
        results.forEach((r, i) => {
          if ("error" in r) issues[i] = describeEnrollError(r.error, r.warnings);
        });

        if (Object.keys(issues).length > 0) {
          setPhotoIssues(issues);
          setStep("review");
        } else {
          setPhotoIssues({});
          setStep("done");
        }
      } catch (e: any) {
        setErrorMessage(e?.message ?? "Upload failed. Please try again.");
        setStep("error");
      } finally {
        clearInterval(raf);
      }
    },
    [id],
  );

  // "uploading" step: kick off the enrollment upload once all poses are captured.
  useEffect(() => {
    if (step !== "uploading") return;
    void runUpload(photos);
  }, [step, photos, runUpload]);

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

  const handleRetryUpload = useCallback(() => {
    setStep("uploading");
  }, []);

  const handleStartOver = useCallback(() => {
    setPhotos([]);
    setPoseIndex(0);
    setErrorMessage(null);
    setPhotoIssues({});
    setReachedReview(false);
    setStep("align");
  }, []);

  // Retake a single pose from the review screen — lands back on review
  // afterwards rather than resuming the front→…→neutral sequence. Clears
  // any prior rejection for this pose since a fresh photo is about to
  // replace it.
  const handleRetakePose = useCallback((index: number) => {
    setPhotoIssues((prev) => {
      if (!(index in prev)) return prev;
      const next = { ...prev };
      delete next[index];
      return next;
    });
    setPoseIndex(index);
    setStep("align");
  }, []);

  const handleSaveReview = useCallback(() => {
    setStep("uploading");
  }, []);

  const handleRetryNoFace = useCallback(() => {
    setStep("align");
  }, []);

  const handleDone = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else if (id) {
      router.replace({ pathname: "/(foreman-stack)/workers/[id]", params: { id } });
    }
  }, [id]);

  const stepHeader = useMemo(() => {
    switch (step) {
      case "intro":
        return { title: "Capture Reference Photos", subtitle: "5 quick photos improve accuracy" };
      case "align":
        return { title: `${currentPose.label} Photo`, subtitle: currentPose.instruction };
      case "detected":
        return { title: "Face Detected", subtitle: "Hold still while we capture" };
      case "noFace":
        return { title: "No Face Detected", subtitle: "Let's try that again" };
      case "captured":
        return { title: `${currentPose.label} Captured`, subtitle: "Nice one!" };
      case "review": {
        const issueCount = Object.keys(photoIssues).length;
        return {
          title: issueCount > 0 ? "Some Photos Need Retaking" : "Review Your Photos",
          subtitle:
            issueCount > 0
              ? `${issueCount} photo${issueCount === 1 ? "" : "s"} couldn't be used — retake them below`
              : "Retake any that don't look right",
        };
      }
      case "uploading":
        return { title: "Saving Photos", subtitle: "Please wait…" };
      case "done":
        return { title: "All Set", subtitle: employee?.fullName ?? "" };
      case "error":
        return { title: "Something Went Wrong", subtitle: errorMessage ?? "" };
    }
  }, [step, currentPose, employee, errorMessage, photoIssues]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
  }, []);

  // A pose reads as "done" once we actually have a photo for it — simpler
  // and more robust than deriving it from poseIndex/step, which stops
  // lining up once single-pose retakes from review can jump around.
  const doneFlags = useMemo(() => POSES.map((_, i) => photos[i] != null), [photos]);

  return (
    <FaceScreenBackground>
      <Stack.Screen options={{ headerLeft: () => null }} />
      <Header title={stepHeader?.title} subtitle={stepHeader?.subtitle} onBackPress={handleBack} />

      <View style={[styles.body, { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg }]}>
        {step === "intro" && (
          <View style={{ gap: spacing.lg, width: "100%" }}>
            <View style={[styles.faceIconWrap, { backgroundColor: colors.glassFill, borderColor: colors.glassBorder }]}>
              <FaceOutlineIcon color={colors.primary} />
            </View>

            <GlassPanel radius={radius.xl}>
              <View style={{ gap: spacing.md }}>
                {POSES.map((p, i) => (
                  <View key={p.pose} style={[styles.checklistRow, { gap: spacing.sm }]}>
                    <View
                      style={[
                        styles.poseIndexWrap,
                        { borderRadius: radius.sm, backgroundColor: colors.glassFill, borderColor: colors.glassBorder },
                      ]}
                    >
                      <Text style={[typography.bodyStrong, { color: colors.primary }]}>{i + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={typography.bodyStrong}>{p.label}</Text>
                      <Text style={[typography.caption, { marginTop: 2 }]}>{p.instruction}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </GlassPanel>

            {permissionDenied && (
              <Text style={[typography.caption, { color: colors.warning, textAlign: "center" }]}>
                Camera access is required to capture reference photos. Please allow it in settings and try again.
              </Text>
            )}

            <PrimaryButton label="CONTINUE" onPress={handleContinue} />
          </View>
        )}

        {(step === "align" || step === "detected" || step === "noFace" || step === "captured") && (
          <View style={styles.stageScreen}>
            <PoseDots total={POSES.length} current={poseIndex} done={doneFlags} />
            <View style={{ marginTop: spacing.lg }}>
              <FaceCameraStage
                cameraRef={cameraRef}
                tone={step === "align" ? "scanning" : step === "noFace" ? "noFace" : "detected"}
                overlayUri={step === "captured" ? photos[poseIndex]?.uri : undefined}
              />
            </View>

            {step === "align" && (
              <>
                <Text style={[typography.bodyStrong, { marginTop: spacing.xl }]}>{currentPose.instruction}</Text>
                <Text style={[typography.caption, { marginTop: spacing.xxs, color: colors.primary }]}>
                  Photo {poseIndex + 1} of {POSES.length}
                </Text>
              </>
            )}

            {step === "detected" && (
              <>
                <Text style={[typography.bodyStrong, { marginTop: spacing.xl, color: colors.success }]}>Great! Face detected</Text>
                <Text style={[typography.caption, { marginTop: spacing.xxs }]}>Hold still while we capture</Text>
                <View style={{ width: "100%", marginTop: spacing.lg }}>
                  <ProgressBar label="Capturing" value={`${Math.round(captureProgress * 100)}%`} progress={captureProgress} />
                </View>
              </>
            )}

            {step === "noFace" && (
              <>
                <View style={[styles.checkBadge, { marginTop: spacing.lg, backgroundColor: colors.danger }]}>
                  <SmallXIcon color={colors.textOnPrimary} />
                </View>
                <Text style={[typography.bodyStrong, { marginTop: spacing.sm, color: colors.danger }]}>No face detected</Text>
                <Text style={[typography.caption, { marginTop: spacing.xxs, textAlign: "center" }]}>
                  Make sure your face is clearly visible and well lit
                </Text>
                <View style={{ width: "100%", marginTop: spacing.lg }}>
                  <PrimaryButton label="TRY AGAIN" onPress={handleRetryNoFace} />
                </View>
              </>
            )}

            {step === "captured" && (
              <>
                <View style={[styles.checkBadge, { marginTop: spacing.lg, backgroundColor: colors.success }]}>
                  <CheckIcon color={colors.textOnPrimary} />
                </View>
                <Text style={[typography.bodyStrong, { marginTop: spacing.sm, color: colors.success }]}>{currentPose.label} captured</Text>
              </>
            )}
          </View>
        )}

        {step === "review" && (
          <View style={{ width: "100%", gap: spacing.lg }}>
            <View style={[styles.reviewGrid, { gap: spacing.sm }]}>
              {POSES.map((p, i) => {
                const issue = photoIssues[i];
                return (
                  <Pressable
                    key={p.pose}
                    onPress={() => handleRetakePose(i)}
                    style={({ pressed }) => [styles.reviewTile, pressed && { opacity: 0.85 }]}
                  >
                    <View
                      style={[
                        styles.reviewThumb,
                        {
                          borderRadius: radius.md,
                          borderColor: issue ? colors.danger : colors.glassBorder,
                          borderWidth: issue ? 2 : 1,
                          backgroundColor: colors.backgroundDeep,
                        },
                      ]}
                    >
                      {photos[i] && (
                        <Image source={{ uri: photos[i].uri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
                      )}
                      {issue && (
                        <View
                          style={[
                            StyleSheet.absoluteFillObject,
                            { backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" },
                          ]}
                        >
                          <SmallXIcon color={colors.textOnPrimary} />
                        </View>
                      )}
                    </View>
                    <Text style={[typography.caption, { marginTop: spacing.xxs }]}>{p.label}</Text>
                    <Text
                      style={[typography.caption, { color: issue ? colors.danger : colors.primary }]}
                      numberOfLines={1}
                    >
                      {issue ?? "Retake"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <PrimaryButton
              label="SAVE REFERENCE PHOTOS"
              onPress={handleSaveReview}
              disabled={Object.keys(photoIssues).length > 0}
            />
            <PrimaryButton label="RETAKE ALL" tone="glass" onPress={handleStartOver} />
          </View>
        )}

        {step === "uploading" && (
          <View style={styles.stageScreen}>
            <GlassPanel radius={radius.xl} style={{ width: "100%" }}>
              <View style={{ gap: spacing.md }}>
                <ProgressBar label="Uploading reference photos" value={`${Math.round(uploadProgress * 100)}%`} progress={uploadProgress} />
              </View>
              <View style={{ alignItems: "center", marginTop: spacing.lg }}>
                <Text style={typography.caption}>Saving {POSES.length} photos…</Text>
              </View>
            </GlassPanel>
          </View>
        )}

        {step === "done" && (
          <View style={styles.stageScreen}>
            <View style={[styles.outcomeIconGlow, { shadowColor: colors.success }]}>
              <CheckCircleIcon color={colors.success} />
            </View>
            <Text style={[typography.title, { marginTop: spacing.lg, color: colors.success }]}>PHOTOS SUBMITTED</Text>
            {employee?.fullName && <Text style={[typography.headline, { marginTop: spacing.xxs }]}>{employee.fullName}</Text>}
            <Text style={[typography.body, { marginTop: spacing.xxs, textAlign: "center" }]}>
              All {POSES.length} reference photos were uploaded
            </Text>

            <GlassPanel radius={radius.md} style={{ width: "100%", marginTop: spacing.lg }} contentPadding={16}>
              <Text style={[typography.caption, { textAlign: "center" }]}>
                A supervisor will review and approve these photos before they're used for verification.
              </Text>
            </GlassPanel>

            <View style={{ width: "100%", marginTop: spacing.xl }}>
              <PrimaryButton label="DONE" tone="success" onPress={handleDone} />
            </View>
          </View>
        )}

        {step === "error" && (
          <View style={styles.stageScreen}>
            <View style={[styles.outcomeIconGlow, { shadowColor: colors.danger }]}>
              <XCircleIcon color={colors.danger} />
            </View>
            <Text style={[typography.title, { marginTop: spacing.lg, color: colors.danger }]}>UPLOAD FAILED</Text>
            <Text style={[typography.body, { marginTop: spacing.xxs, textAlign: "center" }]}>
              {errorMessage ?? "Something went wrong."}
            </Text>

            <View style={{ width: "100%", marginTop: spacing.xl, gap: spacing.sm }}>
              <PrimaryButton label="TRY AGAIN" onPress={photos.length === POSES.length ? handleRetryUpload : handleStartOver} />
              <PrimaryButton label="CANCEL" tone="glass" onPress={handleDone} />
            </View>
          </View>
        )}
      </View>
    </FaceScreenBackground>
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
  reviewGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
  },
  reviewTile: {
    width: "30%",
    alignItems: "center",
  },
  reviewThumb: {
    width: "100%",
    aspectRatio: 1,
    overflow: "hidden",
    borderWidth: 1,
  },
  checklistRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  poseIndexWrap: {
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
  poseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  checkBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  outcomeIconGlow: {
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 10,
  },
});
