import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View, Pressable } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

import {
  FaceScanOverlay,
  type ScanState,
} from "@/components/foreman/FaceScanOverlay";
import { ScanStatusSheet } from "@/components/foreman/ScanStatusSheet";
import { apiScanOutFace } from "@/lib/apiClient";

// Auto-capture delay
const AUTO_CAPTURE_DELAY_MS = 1800;

export default function FaceRecognation() {
  const { id, name, action } = useLocalSearchParams<{
    id?: string;
    name?: string;
    action?: "in" | "out";
  }>();

  const workerName = name ?? "Worker";
  const clockAction: "in" | "out" = action === "out" ? "out" : "in";

  const [permission, requestPermission] = useCameraPermissions();
  const [state, setState] = useState<ScanState>("scanning");
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const cameraRef = useRef<CameraView | null>(null);
  const captureTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (permission && !permission.granted) requestPermission();
  }, [permission, requestPermission]);

  const runCapture = useCallback(async () => {
    if (!cameraRef.current) return;
    try {
      setState("verifying");
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.6,
        base64: true,
        skipProcessing: true,
      });

      // Integration point: send base64 to your server for verification
      const device = `${Platform.OS}-expo`;
      const res = await apiScanOutFace({
        employeeId: String(id ?? ""),
        device,
        image: photo.base64,
        checkLiveness: false,
      });

      // Server returns ok + verificationStatus; verification never blocks
      if (res?.ok) {
        setState("confirmed");
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );
        setTimeout(() => router.back(), 1400);
      } else {
        setErrorMessage(res?.reason ?? "No face match found");
        setState("error");
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Warning,
        );
      }
    } catch (err: any) {
      // Log full error to terminal for debugging
      console.error("Face scan API error:", err);

      // Prefer structured server response when available
      const serverResp = (err as any)?.response;
      const serverMsgFromBody =
        serverResp?.error ?? serverResp?.message ?? serverResp?.reason ?? null;

      if (serverMsgFromBody) {
        setErrorMessage(`Server: ${serverMsgFromBody}`);
      } else if ((err as any)?.status) {
        setErrorMessage(
          `Error ${String((err as any).status)}: ${String(
            (err as any).message ??
              (err as any).toString?.() ??
              "Unknown error",
          )}`,
        );
      } else {
        setErrorMessage("Couldn't reach the server — check your connection");
      }

      setState("error");
    }
  }, [id, clockAction, router]);

  useEffect(() => {
    if (state !== "scanning") return;
    captureTimer.current = setTimeout(runCapture, AUTO_CAPTURE_DELAY_MS);
    return () => {
      if (captureTimer.current) clearTimeout(captureTimer.current as any);
    };
  }, [state, runCapture]);

  const retry = () => {
    setErrorMessage(undefined);
    setState("scanning");
  };

  const usePin = () => {
    // Replace with existing PIN fallback route if available
    // push to PIN fallback (use any to avoid route typing strictness)
    (router as any).push({
      pathname: "/(foreman-stack)/workers/[id]/clock-in-pin",
      params: { id, action: clockAction },
    });
  };

  if (!permission) return <View style={styles.center} />;

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permissionText}>
          FirstClass needs camera access to verify your face for clock-in.
        </Text>
        <Pressable style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Grant camera access</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="front"
      />

      <FaceScanOverlay
        state={state}
        label={
          state === "error"
            ? errorMessage
            : state === "confirmed"
              ? undefined
              : workerName
        }
        actionLabel={clockAction === "in" ? "Clocked in" : "Clocked out"}
      />

      {/* <View style={styles.topBar}>
        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
          hitSlop={12}
        >
          <Text style={{ color: "#fff", fontWeight: "700" }}>Back</Text>
        </Pressable>
        <View style={styles.topBarCenter}>
          <Text style={styles.topBarTitle}>
            {clockAction === "in" ? "Clock in" : "Clock out 1"}
          </Text>
          <Text style={styles.topBarSubtitle}>{workerName}</Text>
        </View>
        <View style={{ width: 44 }} />
      </View> */}

      <View style={styles.sheetWrap}>
        <ScanStatusSheet
          state={state}
          workerName={workerName}
          action={clockAction}
          errorMessage={errorMessage}
          onRetry={retry}
          onUsePin={usePin}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 16,
  },
  permissionText: { textAlign: "center", fontSize: 14, color: "#5F5E5A" },
  permissionButton: {
    backgroundColor: "#0F6E56",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  permissionButtonText: { color: "#fff", fontWeight: "600" },
  topBar: {
    position: "absolute",
    top: 56,
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    width: 44,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  topBarCenter: { alignItems: "center" },
  topBarTitle: { color: "#fff", fontSize: 14, fontWeight: "600" },
  topBarSubtitle: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 11,
    marginTop: 2,
  },
  sheetWrap: { position: "absolute", left: 0, right: 0, bottom: 0 },
});
