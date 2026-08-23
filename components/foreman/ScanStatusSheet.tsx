import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  AlertTriangle,
  Keyboard,
  LogIn,
  LogOut,
  ScanFace,
} from "lucide-react-native";
import type { ScanState } from "./FaceScanOverlay";

interface ScanStatusSheetProps {
  state: ScanState;
  workerName: string;
  action: "in" | "out";
  errorMessage?: string;
  onRetry: () => void;
  onUsePin: () => void;
}

export function ScanStatusSheet({
  state,
  workerName,
  action,
  errorMessage,
  onRetry,
  onUsePin,
}: ScanStatusSheetProps) {
  return (
    <View style={styles.sheet}>
      <View style={styles.grabber} />

      {state === "scanning" && (
        <View style={styles.row}>
          <ScanFace size={18} color="#5F5E5A" />
          <Text style={styles.hint}>Position your face in the frame</Text>
        </View>
      )}

      {state === "verifying" && (
        <View style={styles.row}>
          <Text style={styles.hint}>Verifying against your profile…</Text>
        </View>
      )}

      {state === "confirmed" && (
        <View style={styles.row}>
          <Text style={styles.confirmedText}>
            {action === "in" ? "Clocked in" : "Clocked out"} — {workerName}
          </Text>
        </View>
      )}

      {state === "error" && (
        <View style={styles.errorBlock}>
          <View style={styles.row}>
            <AlertTriangle size={18} color="#A32D2D" />
            <Text style={styles.errorText}>
              {errorMessage ?? "Couldn't verify your face"}
            </Text>
          </View>

          <Pressable style={styles.primaryButton} onPress={onRetry}>
            {action === "in" ? (
              <LogIn size={18} color="#fff" />
            ) : (
              <LogOut size={18} color="#fff" />
            )}
            <Text style={styles.primaryButtonText}>Try again</Text>
          </Pressable>

          <Pressable style={styles.secondaryButton} onPress={onUsePin}>
            <Keyboard size={16} color="#185FA5" />
            <Text style={styles.secondaryButtonText}>
              Trouble scanning? Enter PIN instead
            </Text>
          </Pressable>
        </View>
      )}

      {state !== "error" && (
        <Pressable style={styles.linkButton} onPress={onUsePin}>
          <Keyboard size={14} color="#5F5E5A" />
          <Text style={styles.linkText}>Use PIN instead</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#e5e5e5",
    marginBottom: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    justifyContent: "center",
  },
  hint: { fontSize: 14, color: "#5F5E5A" },
  confirmedText: { fontSize: 15, fontWeight: "600", color: "#0F6E56" },
  errorBlock: { gap: 12 },
  errorText: { fontSize: 14, color: "#A32D2D", flexShrink: 1 },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#0F6E56",
    borderRadius: 16,
    paddingVertical: 14,
  },
  primaryButtonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
  },
  secondaryButtonText: { color: "#185FA5", fontSize: 13, fontWeight: "500" },
  linkButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 14,
  },
  linkText: { color: "#5F5E5A", fontSize: 12 },
});
