import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { FaceGuide, type FaceGuideState } from "./FaceGuide";

interface FaceScannerOverlayProps {
  state: FaceGuideState;
  statusText: string;
  subText?: string;
  progress: number;
  guideSize?: number;
  onBack?: () => void;
  // Tapping the guide retries after an error. Undefined while
  // idle/detecting/success, since there's nothing to retry yet.
  onGuidePress?: () => void;
}

export function ScannerOverlay({
  state,
  statusText,
  subText,
  progress,
  guideSize = 200,
  onBack,
  onGuidePress,
}: FaceScannerOverlayProps) {
  const showProgressBar = state === "detecting";

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.headerTitle}>← Scan Out</Text>
        </Pressable>
      </View>

      <View style={styles.centerContainer}>
        <Pressable onPress={onGuidePress} disabled={!onGuidePress} hitSlop={20}>
          <FaceGuide state={state} size={guideSize} />
        </Pressable>
      </View>

      <View style={styles.footer}>
        <View style={styles.messageBox}>
          <Text style={styles.statusMessage}>{statusText}</Text>
          {subText ? <Text style={styles.loadingMessage}>{subText}</Text> : null}

          {showProgressBar ? (
            <View style={styles.progressBarContainer}>
              <View style={styles.progressBar}>
                <View
                  style={[styles.progressFill, { width: `${progress}%` }]}
                />
              </View>
              <Text style={styles.progressText}>{Math.round(progress)}%</Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "space-between",
  },
  header: {
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  footer: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  messageBox: {
    backgroundColor: "rgba(31, 41, 55, 0.8)",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(107, 114, 128, 0.3)",
  },
  statusMessage: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 8,
  },
  loadingMessage: {
    fontSize: 13,
    color: "#9CA3AF",
    textAlign: "center",
    marginBottom: 12,
  },
  progressBarContainer: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  progressBar: {
    flex: 1,
    height: 4,
    backgroundColor: "rgba(107, 114, 128, 0.3)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#3B82F6",
    borderRadius: 2,
  },
  progressText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#9CA3AF",
    minWidth: 32,
    textAlign: "right",
  },
});
