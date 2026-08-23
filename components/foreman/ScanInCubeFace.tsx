import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import { useFaceTheme } from "@/components/team/faceTheme";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

type Props = {
  siteName?: string | null;
};

/**
 * Incoming face for the Home -> Scan cube transition. A lightweight branded
 * placeholder rather than the real Scan screen, so the camera-heavy screen
 * only ever mounts once, after the real navigation lands.
 */
export default function ScanInCubeFace({ siteName }: Props) {
  const { colors, typography } = useFaceTheme();

  return (
    <AuthStyleBackground>
      <View style={styles.center}>
        <View style={[styles.iconRing, { backgroundColor: colors.successDim, borderColor: colors.successBorder }]}>
          <Ionicons name="qr-code" size={40} color={colors.success} />
        </View>
        <Text style={typography.title}>Scan In</Text>
        {siteName ? (
          <Text style={[typography.body, styles.siteName]} numberOfLines={1}>
            {siteName}
          </Text>
        ) : null}
      </View>
    </AuthStyleBackground>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  iconRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  siteName: {
    textAlign: "center",
  },
});
