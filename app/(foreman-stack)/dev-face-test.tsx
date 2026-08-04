import React, { useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";

// Phase 0 diagnostic screen ONLY (office-app/../FACE_VERIFICATION_TECHNICAL_DESIGN.md).
// Talks directly to the standalone face-service (not through lib/api.ts / the
// FCP backend) — this is not part of the real attendance flow, not linked to
// an employee record, and produces nothing that gets saved anywhere. Delete
// once Phase 0 is done, or once Phase 2 wires the real scan-out-face screen
// up to face-service properly.

// Same LAN-IP pattern as lib/api.ts's getApiBase() — change if your machine's
// IP or face-service's port differs.
const FACE_SERVICE_BASE = "http://192.168.0.154:4001";

type Step = "reference" | "live" | "done";

export default function DevFaceTestScreen() {
  const router = useRouter();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const [step, setStep] = useState<Step>("reference");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [referenceEmbedding, setReferenceEmbedding] = useState<number[] | null>(
    null,
  );

  const appendLog = (line: string) =>
    setLog((prev) => [...prev, line].slice(-12));

  const captureBase64 = async (): Promise<string> => {
    const photo = await cameraRef.current?.takePictureAsync({
      base64: true,
      quality: 0.7,
    });
    if (!photo?.base64) throw new Error("Camera did not return image data");
    return photo.base64;
  };

  const handleCaptureReference = async () => {
    setBusy(true);
    try {
      appendLog("Capturing reference photo...");
      const base64 = await captureBase64();

      appendLog("POST /enroll...");
      const res = await fetch(`${FACE_SERVICE_BASE}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: [base64] }),
      });
      const json = await res.json();
      const [result] = json.results ?? [];

      if (!result || "error" in result) {
        appendLog(`Enroll failed: ${result?.error ?? "unknown error"}`);
        return;
      }

      setReferenceEmbedding(result.embedding);
      appendLog(`Enrolled. qualityScore=${result.qualityScore.toFixed(3)}`);
      setStep("live");
    } catch (err: any) {
      appendLog(`Error reaching face-service: ${err?.message ?? err}`);
      appendLog(`(is it running at ${FACE_SERVICE_BASE}?)`);
    } finally {
      setBusy(false);
    }
  };

  const handleCaptureLive = async () => {
    if (!referenceEmbedding) return;
    setBusy(true);
    try {
      appendLog("Capturing live photo...");
      const base64 = await captureBase64();

      appendLog("POST /verify...");
      const res = await fetch(`${FACE_SERVICE_BASE}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: base64,
          candidateEmbeddings: [referenceEmbedding],
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        appendLog(`Verify failed: ${json?.error ?? "unknown error"}`);
        return;
      }

      appendLog(
        `confidence=${json.confidence.toFixed(3)} distance=${json.distance.toFixed(3)} ${json.processingTimeMs}ms`,
      );
      setStep("done");
    } catch (err: any) {
      appendLog(`Error reaching face-service: ${err?.message ?? err}`);
    } finally {
      setBusy(false);
    }
  };

  const handleReset = () => {
    setStep("reference");
    setReferenceEmbedding(null);
    setLog([]);
  };

  if (!permission) return <View style={styles.container} />;
  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.text}>Camera permission required.</Text>
        <Pressable style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnTxt}>Grant permission</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing="front" />

      <ScrollView style={styles.logPanel}>
        <Text style={styles.title}>face-service Phase 0 test</Text>
        <Text style={styles.subtitle}>{FACE_SERVICE_BASE}</Text>
        {log.map((line, i) => (
          <Text key={i} style={styles.logLine}>
            {line}
          </Text>
        ))}
      </ScrollView>

      <View style={styles.actions}>
        {step === "reference" && (
          <Pressable style={styles.btn} onPress={handleCaptureReference} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnTxt}>Capture reference photo</Text>}
          </Pressable>
        )}
        {step === "live" && (
          <Pressable style={styles.btn} onPress={handleCaptureLive} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnTxt}>Capture live photo & verify</Text>}
          </Pressable>
        )}
        {step === "done" && (
          <Pressable style={styles.btn} onPress={handleReset}>
            <Text style={styles.btnTxt}>Reset</Text>
          </Pressable>
        )}
        <Pressable style={styles.outlineBtn} onPress={() => router.back()}>
          <Text style={styles.outlineBtnTxt}>Close</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111827" },
  camera: { flex: 1 },
  centered: {
    flex: 1,
    backgroundColor: "#111827",
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
    padding: 24,
  },
  text: { color: "#fff", fontSize: 16, textAlign: "center" },
  logPanel: {
    maxHeight: 180,
    backgroundColor: "rgba(0,0,0,0.75)",
    padding: 12,
  },
  title: { color: "#fff", fontWeight: "900", fontSize: 14 },
  subtitle: { color: "#9CA3AF", fontSize: 11, marginBottom: 6 },
  logLine: { color: "#D1FAE5", fontSize: 11, fontFamily: "monospace" },
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
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fff",
    alignItems: "center",
  },
  outlineBtnTxt: { fontWeight: "900", color: "#fff" },
});
