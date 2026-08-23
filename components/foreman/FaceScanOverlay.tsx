import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { Check } from "lucide-react-native";

export type ScanState =
  | "scanning"
  | "detected"
  | "verifying"
  | "confirmed"
  | "error";

interface FaceScanOverlayProps {
  state: ScanState;
  /** Worker name once matched, or a short error string when state === "error" */
  label?: string;
  actionLabel?: "Clocked in" | "Clocked out";
}

const FRAME_SIZE = { width: 220, height: 260 };

export function FaceScanOverlay({
  state,
  label,
  actionLabel,
}: FaceScanOverlayProps) {
  const scanLineY = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  const locked =
    state === "detected" || state === "verifying" || state === "confirmed";
  const isError = state === "error";

  useEffect(() => {
    if (state !== "scanning") {
      scanLineY.stopAnimation();
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineY, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scanLineY, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [state, scanLineY]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const translateY = scanLineY.interpolate({
    inputRange: [0, 1],
    outputRange: [16, FRAME_SIZE.height - 16],
  });

  const frameColor = isError
    ? "#E24B4A"
    : locked
      ? "#1D9E75"
      : "rgba(255,255,255,0.5)";

  return (
    <View pointerEvents="none" style={styles.container}>
      <View
        style={[
          styles.frame,
          { borderColor: frameColor, borderWidth: locked || isError ? 2 : 1 },
        ]}
      >
        {!locked && !isError && (
          <>
            <Corner style={[styles.cornerTL]} color={frameColor} />
            <Corner style={[styles.cornerTR]} color={frameColor} />
            <Corner style={[styles.cornerBL]} color={frameColor} />
            <Corner style={[styles.cornerBR]} color={frameColor} />
          </>
        )}

        {state === "scanning" && (
          <Animated.View
            style={[styles.scanLine, { transform: [{ translateY }] }]}
          />
        )}

        {(locked || isError) && label ? (
          <View
            style={[
              styles.tag,
              { backgroundColor: isError ? "#E24B4A" : "#1D9E75" },
            ]}
          >
            {state === "confirmed" ? (
              <View style={styles.tagRow}>
                <Check size={14} color="#fff" strokeWidth={3} />
                <Text style={styles.tagText}>
                  {actionLabel ?? "Clocked in"}
                </Text>
              </View>
            ) : (
              <Text style={styles.tagText}>{label}</Text>
            )}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function Corner({ style, color }: { style: any; color: string }) {
  return <View style={[styles.corner, style, { borderColor: color }]} />;
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  frame: {
    width: FRAME_SIZE.width,
    height: FRAME_SIZE.height,
    borderRadius: 28,
    overflow: "hidden",
  },
  corner: {
    position: "absolute",
    width: 28,
    height: 28,
    borderWidth: 0,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 28,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 28,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 28,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 28,
  },
  scanLine: {
    position: "absolute",
    left: 12,
    right: 12,
    height: 2,
    borderRadius: 2,
    backgroundColor: "#1D9E75",
    shadowColor: "#1D9E75",
    shadowOpacity: 0.8,
    shadowRadius: 8,
  },
  tag: {
    position: "absolute",
    bottom: -14,
    alignSelf: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  tagRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  tagText: { color: "#fff", fontSize: 12, fontWeight: "600" },
});
