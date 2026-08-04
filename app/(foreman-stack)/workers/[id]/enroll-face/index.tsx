import React, { useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import {
  apiCreateFaceEnrollments,
  type FaceEnrollmentPose,
} from "@/lib/apiClient";

// Phase 2 (office-app/../FACE_VERIFICATION_TECHNICAL_DESIGN.md §6, Enrollment
// sequence). Captures 5 reference photos and submits them as PENDING_APPROVAL
// FaceEnrollment rows — an admin must approve before they're used for
// matching. Never blocks anything else in the app; a failed/incomplete
// enrollment just means the employee keeps using existing scan-out methods.

const POSES: { key: FaceEnrollmentPose; label: string }[] = [
  { key: "FRONT", label: "Look straight at the camera" },
  { key: "LEFT", label: "Turn slightly to your left" },
  { key: "RIGHT", label: "Turn slightly to your right" },
  { key: "SMILE", label: "Smile" },
  { key: "NEUTRAL", label: "Neutral expression" },
];

type CapturedPhoto = { uri: string; name: string; type: string; pose: FaceEnrollmentPose };

export default function EnrollFaceScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const employeeId = String(id);

  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const [poseIndex, setPoseIndex] = useState(0);
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const currentPose = POSES[poseIndex];

  const handleCapture = async () => {
    setBusy(true);
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.85 });
      if (!photo?.uri) return;

      const captured: CapturedPhoto = {
        uri: photo.uri,
        name: `face_${currentPose.key.toLowerCase()}_${Date.now()}.jpg`,
        type: "image/jpeg",
        pose: currentPose.key,
      };

      const nextPhotos = [...photos, captured];
      setPhotos(nextPhotos);

      if (poseIndex + 1 < POSES.length) {
        setPoseIndex(poseIndex + 1);
      } else {
        await handleSubmit(nextPhotos);
      }
    } catch (e: any) {
      setSummary(`Capture failed: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async (allPhotos: CapturedPhoto[]) => {
    setSubmitting(true);
    try {
      let latitude: number | undefined;
      let longitude: number | undefined;
      try {
        const loc = await Location.getLastKnownPositionAsync();
        latitude = loc?.coords.latitude;
        longitude = loc?.coords.longitude;
      } catch {
        // Optional metadata only — never block enrollment on location.
      }

      const res = await apiCreateFaceEnrollments(employeeId, allPhotos, {
        device: `${Platform.OS} ${Platform.Version}`,
        latitude,
        longitude,
      });

      const succeeded = res.results.filter((r) => !("error" in r)).length;
      const failed = res.results.length - succeeded;
      setSummary(
        failed === 0
          ? `${succeeded}/${res.results.length} photos enrolled. Pending admin approval.`
          : `${succeeded}/${res.results.length} photos enrolled, ${failed} failed (no face detected — retake those).`,
      );
      setDone(true);
    } catch (e: any) {
      setSummary(`Upload failed: ${e?.message ?? "Check your connection and try again."}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRestart = () => {
    setPoseIndex(0);
    setPhotos([]);
    setSummary(null);
    setDone(false);
  };

  if (!permission) return <View style={styles.container} />;
  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.text}>Camera permission required to enroll a face.</Text>
        <Pressable style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnTxt}>Grant permission</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing="front" active={!done} />

      <View style={styles.overlay} pointerEvents="box-none">
        <Pressable style={styles.closeBtn} onPress={() => router.back()}>
          <Text style={styles.closeBtnTxt}>Close</Text>
        </Pressable>

        {!done ? (
          <>
            <Text style={styles.progressTxt}>
              Photo {poseIndex + 1} of {POSES.length}
            </Text>
            <Text style={styles.promptTxt}>{currentPose.label}</Text>
          </>
        ) : (
          <Text style={styles.promptTxt}>{summary}</Text>
        )}
      </View>

      <View style={styles.actions}>
        {!done ? (
          <Pressable style={styles.btn} onPress={handleCapture} disabled={busy || submitting}>
            {busy || submitting ? (
              <ActivityIndicator color="#111827" />
            ) : (
              <Text style={styles.btnTxt}>
                {poseIndex + 1 < POSES.length ? "Capture" : "Capture & Submit"}
              </Text>
            )}
          </Pressable>
        ) : (
          <>
            <Pressable style={styles.outlineBtn} onPress={handleRestart}>
              <Text style={styles.outlineBtnTxt}>Retake all</Text>
            </Pressable>
            <Pressable style={styles.btn} onPress={() => router.back()}>
              <Text style={styles.btnTxt}>Done</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111827" },
  camera: { flex: 1 },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 56,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  closeBtn: { position: "absolute", top: 56, right: 20 },
  closeBtnTxt: { color: "#fff", fontWeight: "700" },
  progressTxt: { color: "#9CA3AF", fontSize: 13, marginTop: 8 },
  promptTxt: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 8,
  },
  centered: {
    flex: 1,
    backgroundColor: "#111827",
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
    padding: 24,
  },
  text: { color: "#fff", fontSize: 16, textAlign: "center" },
  actions: { flexDirection: "row", gap: 10, padding: 16, backgroundColor: "#111827" },
  btn: {
    flex: 1,
    backgroundColor: "#22C55E",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  btnTxt: { fontWeight: "900", color: "#111827" },
  outlineBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fff",
    alignItems: "center",
  },
  outlineBtnTxt: { fontWeight: "900", color: "#fff" },
});
