import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import { GlassCard } from "@/components/GlassCard";
import { recordFaceScanOut } from "../../../../lib/employeesStore";

export default function ScanOutFace() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleScanOut() {
    if (!id) return setMessage("No employee id provided.");
    setLoading(true);
    setMessage(null);
    try {
      const res = await recordFaceScanOut(String(id));
      setMessage(
        `Scanned out at ${res.timestamp} — status: ${res.verificationStatus} (${String(
          res.confidence,
        )})`,
      );
    } catch (err: any) {
      console.warn("Scan-out failed", err);
      setMessage(`Scan failed: ${err?.message ?? String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthStyleBackground>
      <View style={styles.container}>
        <GlassCard>
          <Text style={styles.h1}>Scan Out (Face)</Text>
          <Text style={styles.helpText}>
            This route was missing and has been restored. Tap Scan to record a
            face-based scan-out (no photo uploaded).
          </Text>

          <Pressable
            style={[styles.btn, styles.primary]}
            onPress={handleScanOut}
          >
            <Text style={styles.btnTxt}>{loading ? "Scanning…" : "Scan"}</Text>
          </Pressable>

          {message ? <Text style={styles.message}>{message}</Text> : null}

          <Pressable
            style={[styles.btn, styles.ghost]}
            onPress={() => router.back()}
          >
            <Text style={styles.btnTxt}>Back</Text>
          </Pressable>
        </GlassCard>
      </View>
    </AuthStyleBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  h1: { fontSize: 18, fontWeight: "900", marginBottom: 8 },
  helpText: { color: "#666", marginBottom: 12 },
  btn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  primary: { backgroundColor: "#2563EB" },
  ghost: { backgroundColor: "rgba(255,255,255,0.06)" },
  btnTxt: { color: "#fff", fontWeight: "800" },
  message: { marginTop: 12, color: "#fff" },
});
