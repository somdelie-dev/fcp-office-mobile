import { CameraType, CameraView, useCameraPermissions } from "expo-camera";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Device from "expo-device";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, Stack, useLocalSearchParams } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import {
  FaceScreenBackground,
  GlassPanel,
  Header,
  ScanLineOverlay,
} from "@/components/team";
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
    console.warn("[capture-reference] face detector module unavailable:", e);
  }
}

type Step =
  | "intro"
  | "ready"
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
  /** Example photo bundled with the app — shown on the "ready" step so the worker/foreman can see what the pose should look like before starting. */
  refImage: number;
}

const POSES: PoseSpec[] = [
  {
    pose: "FRONT",
    label: "Front",
    instruction: "Look straight at the camera",
    refImage: require("../../../../assets/images/face-ref/01_FRONT.png"),
  },
  {
    pose: "LEFT",
    label: "Left",
    instruction: "Slowly turn your head to the left",
    refImage: require("../../../../assets/images/face-ref/02_LEFT.png"),
  },
  {
    pose: "RIGHT",
    label: "Right",
    instruction: "Slowly turn your head to the right",
    refImage: require("../../../../assets/images/face-ref/03_RIGHT.png"),
  },
  {
    pose: "SMILE",
    label: "Smile",
    instruction: "Give a natural smile",
    refImage: require("../../../../assets/images/face-ref/04_SMILE.png"),
  },
  {
    pose: "NEUTRAL",
    label: "Neutral",
    instruction: "Relax your expression",
    refImage: require("../../../../assets/images/face-ref/05_NEUTRAL.png"),
  },
];

// Slower, more deliberate pacing than a snapshot-fast auto-capture — the
// user should be able to see each stage happen, not just have the sequence
// fly past.
const ALIGN_DURATION = 2200;
const CAPTURE_DELAY = 1500;
const CAPTURED_HOLD = 900;

// Also used as ScanLineOverlay's `size` (its sweep range is relative to
// height, not width) — kept as a constant rather than read back off
// styles.photoStageWrap so it doesn't depend on StyleSheet.create's return
// shape.
const PHOTO_STAGE_HEIGHT = 340;

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

function CheckCircleIcon({
  color,
  size = 72,
}: {
  color: string;
  size?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} stroke={color} strokeWidth={1.6} />
      <Path
        d="M7.5 12.5L10.3 15.3L16.5 8.5"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function XCircleIcon({ color, size = 72 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} stroke={color} strokeWidth={1.6} />
      <Path
        d="M9 9L15 15M15 9L9 15"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function CheckIcon({ color }: { color: string }) {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 12.5L9.5 18L20 6"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function SmallXIcon({ color }: { color: string }) {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 6L18 18M18 6L6 18"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
      />
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
  const { colors, typography, shadows } = useFaceTheme();

  if (tone === "glass") {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [
          styles.glassButton,
          {
            borderRadius: 5,
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
    tone === "danger"
      ? (["#EF4444", "#DC2626"] as const)
      : (["#22C55E", "#16A34A"] as const);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        pressed && { opacity: 0.9 },
        disabled && { opacity: 0.5 },
      ]}
    >
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.primaryButton, { borderRadius: 5 }, shadows.glowSoft]}
      >
        <Text
          style={[
            typography.bodyStrong,
            { color: colors.textOnPrimary, letterSpacing: 0.6 },
          ]}
        >
          {label}
        </Text>
      </LinearGradient>
    </Pressable>
  );
}

/**
 * Bounded, centered photo stage with a glow + corner-accent frame — reads
 * as a dedicated scanner device rather than a plain edge-to-edge camera
 * preview. Mounted once for the whole capture session; swapping it in and
 * out of the tree per-pose caused expo-camera's session teardown/setup to
 * race and hang.
 */
function PoseCameraStage({
  cameraRef,
  width,
  tone,
  scanning,
  capturing,
  captureProgress,
  facing,
  onToggleFacing,
  allowFlip,
  overlayUri,
  referenceImage,
  onReady,
}: {
  cameraRef: React.RefObject<CameraView | null>;
  /** Stage width, computed from screen width so it stays centered with even margins instead of running edge to edge. */
  width: number;
  tone: "scanning" | "detected" | "noFace";
  /** Drives the scan-line sweep — true only after START is tapped and the camera is actively looking (align/detected), false on the pre-start "ready" pose screen and once a shot's been taken or rejected. */
  scanning: boolean;
  /** True only during the "detected" step's countdown — shows the capture HUD over the bottom of the camera. */
  capturing: boolean;
  captureProgress: number;
  facing: CameraType;
  onToggleFacing: () => void;
  /** Hide the flip button once the pose is mid-capture/reviewed — flipping while a shot is being taken would be confusing, not useful. */
  allowFlip: boolean;
  /** When set, covers the live feed with the just-captured still (no camera remount). */
  overlayUri?: string;
  /** Example photo for the current pose — shown as a small corner inset so the worker/foreman can compare the live feed against it without eating into the camera's own space. */
  referenceImage?: number;
  onReady?: () => void;
}) {
  const { colors } = useFaceTheme();
  const ringColor =
    tone === "detected"
      ? colors.warning
      : tone === "noFace"
        ? colors.danger
        : colors.success;

  return (
    <View style={styles.stageCenter}>
      <View
        style={[
          styles.photoStageGlow,
          {
            width,
            height: PHOTO_STAGE_HEIGHT,
            shadowColor: ringColor,
          },
        ]}
      />
      <View
        style={[
          styles.photoStage,
          {
            width,
            height: PHOTO_STAGE_HEIGHT,
            borderColor: ringColor,
            backgroundColor: colors.backgroundDeep,
          },
        ]}
      >
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
          onCameraReady={onReady}
        />
        <ScanLineOverlay
          active={scanning}
          color={ringColor}
          size={PHOTO_STAGE_HEIGHT}
        />
        {overlayUri && (
          <Image
            source={{ uri: overlayUri }}
            // style={StyleSheet.absoluteFill}
            // resizeMode="contain"
          />
        )}
        {referenceImage != null && !overlayUri && (
          <View
            style={[
              styles.referenceInset,
              { borderColor: colors.glassBorderStrong },
            ]}
          >
            <Image
              source={referenceImage}
              // style={StyleSheet.absoluteFill}
              // resizeMode="contain"
            />
            {/* <View style={styles.referenceLabelPill}>
              <Text style={styles.referenceLabelText}>EXAMPLE</Text>
            </View> */}
          </View>
        )}
        <View style={styles.liveBadge}>
          <View style={[styles.liveDot, { backgroundColor: colors.danger }]} />
          <Text style={styles.liveBadgeText}>LIVE</Text>
        </View>
        {allowFlip && (
          <Pressable
            onPress={onToggleFacing}
            hitSlop={8}
            style={({ pressed }) => [
              styles.flipButton,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons name="camera-reverse-outline" size={20} color="#fff" />
          </Pressable>
        )}
        {capturing && (
          <View style={styles.captureHud} pointerEvents="none">
            <LinearGradient
              colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.82)"]}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.captureHudContent}>
              <View style={styles.captureHudRow}>
                <View
                  style={[
                    styles.captureHudDot,
                    { backgroundColor: ringColor },
                  ]}
                />
                <Text style={styles.captureHudLabel}>CAPTURING</Text>
                <Text
                  style={[styles.captureHudPercent, { color: ringColor }]}
                >
                  {Math.round(captureProgress * 100)}%
                </Text>
              </View>
              <View style={styles.captureHudTrack}>
                <View
                  style={[
                    styles.captureHudFill,
                    {
                      width: `${Math.round(captureProgress * 100)}%`,
                      backgroundColor: ringColor,
                      shadowColor: ringColor,
                    },
                  ]}
                />
              </View>
            </View>
          </View>
        )}
      </View>
      <ScannerCornerAccents color={ringColor} />
    </View>
  );
}

/**
 * Lightweight L-shaped corner marks over the stage's own rounded rectangle
 * (as opposed to CornerBrackets, which assumes a square box for the
 * clock-out scanner) — the last touch that reads as a scanner frame rather
 * than a bare camera preview.
 */
function ScannerCornerAccents({ color }: { color: string }) {
  const len = 26;
  const stroke = 3;
  const inset = 10;

  const corners = [
    {
      top: inset,
      left: inset,
      borderTopWidth: stroke,
      borderLeftWidth: stroke,
    },
    {
      top: inset,
      right: inset,
      borderTopWidth: stroke,
      borderRightWidth: stroke,
    },
    {
      bottom: inset,
      left: inset,
      borderBottomWidth: stroke,
      borderLeftWidth: stroke,
    },
    {
      bottom: inset,
      right: inset,
      borderBottomWidth: stroke,
      borderRightWidth: stroke,
    },
  ] as const;

  // Fills the stageCenter wrapper exactly — its only non-absolute child
  // (photoStage) is what gives that wrapper its size, same trick as
  // scan-out-face's stageGlow/CornerBrackets.
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {corners.map((corner, i) => (
        <View
          key={i}
          style={[
            styles.cornerAccent,
            { width: len, height: len, borderColor: color },
            corner,
          ]}
        />
      ))}
    </View>
  );
}

function ProgressBar({
  label,
  value,
  progress,
}: {
  label: string;
  value: string;
  progress: number;
}) {
  const { colors, typography, spacing } = useFaceTheme();

  return (
    <View style={{ gap: spacing.xxs }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={typography.caption}>{label}</Text>
        <Text style={[typography.caption, { color: colors.textPrimary }]}>
          {value}
        </Text>
      </View>
      <View
        style={[styles.progressTrack, { backgroundColor: colors.glassFill }]}
      >
        <View
          style={[
            styles.progressFill,
            {
              width: `${Math.round(progress * 100)}%`,
              backgroundColor: colors.primary,
            },
          ]}
        />
      </View>
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
  const { colors, typography, spacing } = useFaceTheme();
  // Bounded and centered rather than full-bleed — caps out so the stage
  // reads as a device, not a stretched preview, on tablets.
  const { width: windowWidth } = useWindowDimensions();
  const stageWidth = Math.min(windowWidth - spacing.lg * 2, 340);

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  // Front-facing by default — a worker/foreman capturing their own reference
  // photos usually holds the phone facing themselves — but the flip button
  // lets someone else hold the phone and shoot with the back camera instead.
  const [facing, setFacing] = useState<CameraType>("front");
  const toggleFacing = useCallback(() => {
    setFacing((f) => (f === "front" ? "back" : "front"));
  }, []);

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
  const faceDetector = useImageFaceDetector
    ? useImageFaceDetector(FACE_DETECTOR_OPTIONS)
    : null;

  const detectFace = useCallback(
    async (uri: string): Promise<boolean> => {
      if (!faceDetector) return true;
      try {
        const faces = await faceDetector.detectFaces(uri);
        return faces.length > 0;
      } catch (e) {
        // Detector errored on this image — don't block capture on it, just
        // skip validation for this shot.
        console.warn(
          "[capture-reference] face detection failed, allowing capture:",
          e,
        );
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
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.8,
          skipProcessing: true,
        });
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
        setStep("ready");
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
        const device =
          `${Device.modelName ?? Platform.OS} · Reference Capture`.slice(
            0,
            200,
          );
        const payload = allPhotos.map((photo, i) => ({
          uri: photo.uri,
          name: `${POSES[i].pose.toLowerCase()}-${Date.now()}.jpg`,
          type: "image/jpeg",
          pose: POSES[i].pose,
        }));
        const { results } = await apiCreateFaceEnrollments(id, payload, {
          device,
        });
        setUploadProgress(1);

        // The request itself succeeding (200 OK) doesn't mean every photo
        // became a FaceEnrollment row — face-service rejects individual
        // images (no face / multiple faces / undecodable) without failing
        // the whole call. Surface those instead of silently reporting
        // success for photos that were never saved.
        const issues: Record<number, string> = {};
        results.forEach((r, i) => {
          if ("error" in r)
            issues[i] = describeEnrollError(r.error, r.warnings);
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
      setStep("ready");
      return;
    }
    const result = await requestPermission();
    if (result.granted) {
      setPermissionDenied(false);
      setStep("ready");
    } else {
      setPermissionDenied(true);
    }
  }, [permission, requestPermission]);

  // "ready" step's START button — the explicit per-pose gate. Nothing auto-fires
  // (no timer, no capture) until this is tapped, same as scan-out-face's
  // "Start Scanner" gate.
  const handleStartCapture = useCallback(() => {
    setStep("align");
  }, []);

  const handleRetryUpload = useCallback(() => {
    setStep("uploading");
  }, []);

  const handleStartOver = useCallback(() => {
    setPhotos([]);
    setPoseIndex(0);
    setErrorMessage(null);
    setPhotoIssues({});
    setReachedReview(false);
    setStep("ready");
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
      router.replace({
        pathname: "/(foreman-stack)/workers/[id]",
        params: { id },
      });
    }
  }, [id]);

  const stepHeader = useMemo(() => {
    switch (step) {
      case "intro":
        return {
          title: "Capture Reference Photos",
          subtitle: "5 quick photos improve accuracy",
        };
      case "ready":
        return {
          title: `${currentPose.label} Photo`,
          subtitle: `Photo ${poseIndex + 1} of ${POSES.length}`,
        };
      case "align":
        return {
          title: `${currentPose.label} Photo`,
          subtitle: currentPose.instruction,
        };
      case "detected":
        return {
          title: "Face Detected",
          subtitle: "Hold still while we capture",
        };
      case "noFace":
        return { title: "No Face Detected", subtitle: "Let's try that again" };
      case "captured":
        return {
          title: `${currentPose.label} Captured`,
          subtitle: "Nice one!",
        };
      case "review": {
        const issueCount = Object.keys(photoIssues).length;
        return {
          title:
            issueCount > 0 ? "Some Photos Need Retaking" : "Review Your Photos",
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
  }, [step, currentPose, poseIndex, employee, errorMessage, photoIssues]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
  }, []);

  return (
    <FaceScreenBackground>
      <Stack.Screen options={{ headerLeft: () => null }} />
      {/* <Header
        title={stepHeader?.title}
        subtitle={stepHeader?.subtitle}
        onBackPress={handleBack}
      /> */}

      <View
        style={[
          styles.body,
          {
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.sm,
            paddingBottom: spacing.lg,
          },
        ]}
      >
        {step === "intro" && (
          <View style={{ gap: spacing.lg, width: "100%" }}>
            <View
              style={[
                styles.faceIconWrap,
                {
                  backgroundColor: colors.glassFill,
                  borderColor: colors.glassBorder,
                },
              ]}
            >
              <FaceOutlineIcon color={colors.primary} />
            </View>

            <GlassPanel radius={5}>
              <View style={{ gap: spacing.md }}>
                {POSES.map((p, i) => (
                  <View
                    key={p.pose}
                    style={[styles.checklistRow, { gap: spacing.sm }]}
                  >
                    <View
                      style={[
                        styles.poseIndexWrap,
                        {
                          borderRadius: 5,
                          backgroundColor: colors.glassFill,
                          borderColor: colors.glassBorder,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          typography.bodyStrong,
                          { color: colors.primary },
                        ]}
                      >
                        {i + 1}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={typography.bodyStrong}>{p.label}</Text>
                      <Text style={[typography.caption, { marginTop: 2 }]}>
                        {p.instruction}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </GlassPanel>

            {permissionDenied && (
              <Text
                style={[
                  typography.caption,
                  { color: colors.warning, textAlign: "center" },
                ]}
              >
                Camera access is required to capture reference photos. Please
                allow it in settings and try again.
              </Text>
            )}

            <PrimaryButton label="CONTINUE" onPress={handleContinue} />
          </View>
        )}

        {(step === "ready" ||
          step === "align" ||
          step === "detected" ||
          step === "noFace" ||
          step === "captured") && (
          <View style={styles.poseScreen}>
            <View style={styles.poseHeader}>
              <View
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: spacing.sm,
                }}
              >
                <Image
                  source={currentPose.refImage}
                  style={{ width: 120, height: 160 }}
                  resizeMode="contain"
                />

                <View
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: spacing.sm,
                  }}
                >
                  <View
                    style={[
                      styles.numberBadge,
                      { backgroundColor: colors.success },
                    ]}
                  >
                    <Text
                      style={[
                        typography.title,
                        { color: colors.textOnPrimary, fontSize: 20 },
                      ]}
                    >
                      {poseIndex + 1}
                    </Text>
                  </View>

                  <Text style={[styles.poseTitle, { color: colors.success }]}>
                    {currentPose.label.toUpperCase()}
                  </Text>
                  <Text style={[typography.body, styles.poseInstructionText]}>
                    {currentPose.instruction}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.photoStageWrap}>
              {/* Camera is mounted once for the whole capture session (see
                  PoseCameraStage) and stays mounted through "ready" too —
                  swapping it in/out per step caused expo-camera's session
                  teardown/setup to race and hang. */}
              <PoseCameraStage
                cameraRef={cameraRef}
                width={stageWidth}
                tone={
                  step === "align" || step === "ready"
                    ? "scanning"
                    : step === "noFace"
                      ? "noFace"
                      : "detected"
                }
                // Only once the worker/foreman has tapped START (align/detected) —
                // "ready" is just the static pre-start pose screen, not scanning yet.
                scanning={step === "align" || step === "detected"}
                facing={facing}
                onToggleFacing={toggleFacing}
                allowFlip={step === "ready" || step === "align"}
                capturing={step === "detected"}
                captureProgress={captureProgress}
              />
            </View>

            <View style={[styles.poseFooter, { paddingTop: spacing.md }]}>
              {step === "ready" && (
                <PrimaryButton
                  label="START"
                  tone="success"
                  onPress={handleStartCapture}
                />
              )}

              {/* "detected" (capturing) has no footer content — its progress
                  now shows as a HUD overlaid on the camera itself, see
                  PoseCameraStage's captureHud. */}

              {step === "noFace" && (
                <View style={{ alignItems: "center", gap: spacing.xs }}>
                  <Text
                    style={[typography.bodyStrong, { color: colors.danger }]}
                  >
                    No face detected
                  </Text>
                  <Text style={[typography.caption, { textAlign: "center" }]}>
                    Make sure your face is clearly visible and well lit
                  </Text>
                  <View style={{ width: "100%", marginTop: spacing.xs }}>
                    <PrimaryButton
                      label="TRY AGAIN"
                      onPress={handleRetryNoFace}
                    />
                  </View>
                </View>
              )}

              {step === "captured" && (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: spacing.xs,
                  }}
                >
                  <View
                    style={[
                      styles.checkBadgeSmall,
                      { backgroundColor: colors.success },
                    ]}
                  >
                    <CheckIcon color={colors.textOnPrimary} />
                  </View>
                  <Text
                    style={[typography.bodyStrong, { color: colors.success }]}
                  >
                    {currentPose.label} captured
                  </Text>
                </View>
              )}
            </View>
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
                    style={({ pressed }) => [
                      styles.reviewTile,
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <View
                      style={[
                        styles.reviewThumb,
                        {
                          borderRadius: 5,
                          borderColor: issue
                            ? colors.danger
                            : colors.glassBorder,
                          borderWidth: issue ? 2 : 1,
                          backgroundColor: colors.backgroundDeep,
                        },
                      ]}
                    >
                      {photos[i] && (
                        <Image
                          source={{ uri: photos[i].uri }}
                          style={StyleSheet.absoluteFill}
                          resizeMode="cover"
                        />
                      )}
                      {issue && (
                        <View
                          style={[
                            StyleSheet.absoluteFill,
                            {
                              backgroundColor: "rgba(0,0,0,0.4)",
                              alignItems: "center",
                              justifyContent: "center",
                            },
                          ]}
                        >
                          <SmallXIcon color={colors.textOnPrimary} />
                        </View>
                      )}
                    </View>
                    <Text
                      style={[typography.caption, { marginTop: spacing.xxs }]}
                    >
                      {p.label}
                    </Text>
                    <Text
                      style={[
                        typography.caption,
                        { color: issue ? colors.danger : colors.primary },
                      ]}
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
            <PrimaryButton
              label="RETAKE ALL"
              tone="glass"
              onPress={handleStartOver}
            />
          </View>
        )}

        {step === "uploading" && (
          <View style={styles.stageScreen}>
            <GlassPanel radius={5} style={{ width: "100%" }}>
              <View style={{ gap: spacing.md }}>
                <ProgressBar
                  label="Uploading reference photos"
                  value={`${Math.round(uploadProgress * 100)}%`}
                  progress={uploadProgress}
                />
              </View>
              <View style={{ alignItems: "center", marginTop: spacing.lg }}>
                <Text style={typography.caption}>
                  Saving {POSES.length} photos…
                </Text>
              </View>
            </GlassPanel>
          </View>
        )}

        {step === "done" && (
          <View style={styles.stageScreen}>
            <View
              style={[styles.outcomeIconGlow, { shadowColor: colors.success }]}
            >
              <CheckCircleIcon color={colors.success} />
            </View>
            <Text
              style={[
                typography.title,
                { marginTop: spacing.lg, color: colors.success },
              ]}
            >
              PHOTOS SUBMITTED
            </Text>
            {employee?.fullName && (
              <Text style={[typography.headline, { marginTop: spacing.xxs }]}>
                {employee.fullName}
              </Text>
            )}
            <Text
              style={[
                typography.body,
                { marginTop: spacing.xxs, textAlign: "center" },
              ]}
            >
              All {POSES.length} reference photos were uploaded
            </Text>

            <GlassPanel
              radius={5}
              style={{ width: "100%", marginTop: spacing.lg }}
              contentPadding={16}
            >
              <Text style={[typography.caption, { textAlign: "center" }]}>
                A supervisor will review and approve these photos before they're
                used for verification.
              </Text>
            </GlassPanel>

            <View style={{ width: "100%", marginTop: spacing.xl }}>
              <PrimaryButton label="DONE" tone="success" onPress={handleDone} />
            </View>
          </View>
        )}

        {step === "error" && (
          <View style={styles.stageScreen}>
            <View
              style={[styles.outcomeIconGlow, { shadowColor: colors.danger }]}
            >
              <XCircleIcon color={colors.danger} />
            </View>
            <Text
              style={[
                typography.title,
                { marginTop: spacing.lg, color: colors.danger },
              ]}
            >
              UPLOAD FAILED
            </Text>
            <Text
              style={[
                typography.body,
                { marginTop: spacing.xxs, textAlign: "center" },
              ]}
            >
              {errorMessage ?? "Something went wrong."}
            </Text>

            <View
              style={{ width: "100%", marginTop: spacing.xl, gap: spacing.sm }}
            >
              <PrimaryButton
                label="TRY AGAIN"
                onPress={
                  photos.length === POSES.length
                    ? handleRetryUpload
                    : handleStartOver
                }
              />
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
  // Pose capture screen (align/detected/noFace/captured) — number badge +
  // title + instruction up top, one large full-bleed photo below, matching
  // the reference design rather than the small circular camera "puck" used
  // elsewhere in this module.
  poseScreen: {
    flex: 1,
    width: "100%",
  },
  poseHeader: {
    alignItems: "center",
    paddingTop: 4,
  },
  numberBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  poseTitle: {
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: 0.5,
    marginTop: 10,
  },
  poseInstructionText: {
    textAlign: "center",
    marginTop: 6,
  },
  photoStageWrap: {
    // Bounded, not flex:1 — the camera used to eat the whole remaining
    // screen height, leaving no room for the reference inset or the
    // footer controls below it.
    height: PHOTO_STAGE_HEIGHT,
    marginTop: 12,
    alignItems: "center",
  },
  stageCenter: {
    alignItems: "center",
    justifyContent: "center",
  },
  // Soft colored glow behind the stage — reads as a device casting light,
  // not just a bordered rectangle.
  photoStageGlow: {
    position: "absolute",
    borderRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 22,
    elevation: 10,
  },
  photoStage: {
    overflow: "hidden",
    borderRadius: 12,
    borderWidth: 2,
  },
  liveBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.62)",
  },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  liveBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  flipButton: {
    position: "absolute",
    bottom: 10,
    right: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.62)",
  },
  // HUD strip for the "detected" (capturing) countdown — fades the camera
  // to black behind it rather than sitting on a flat panel, so it reads as
  // part of the camera itself, not a separate control below it.
  captureHud: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    overflow: "hidden",
  },
  captureHudContent: {
    paddingHorizontal: 16,
    paddingTop: 26,
    paddingBottom: 14,
  },
  captureHudRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 8,
  },
  captureHudDot: { width: 6, height: 6, borderRadius: 3 },
  captureHudLabel: {
    flex: 1,
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  captureHudPercent: {
    fontSize: 14,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  captureHudTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.22)",
    overflow: "hidden",
  },
  captureHudFill: {
    height: "100%",
    borderRadius: 3,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 4,
  },
  cornerAccent: {
    position: "absolute",
    borderRadius: 4,
  },
  referenceInset: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 80,
    height: 128,
    borderRadius: 10,
    borderWidth: 2,
    overflow: "hidden",
    // The bundled reference PNGs are full mockup cards (number + title +
    // instruction on a white background, photo below) — "contain" shows
    // the whole thing undistorted; a light background matches the card's
    // own white top section instead of showing dark letterbox bars.
    backgroundColor: "#F3F4F6",
  },
  referenceLabelPill: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 2,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
  },
  referenceLabelText: {
    color: "#fff",
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  poseFooter: {
    width: "100%",
    minHeight: 64,
    justifyContent: "center",
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
  checkBadgeSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
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
