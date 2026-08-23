import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { useFaceTheme } from "./faceTheme";
import FacePreview from "./FacePreview";
import GlassPanel from "./GlassPanel";
import StatusChip from "./StatusChip";

interface HeroCardProps {
  name: string;
  workerCode: string;
  photoUri?: string | null;
  isActive?: boolean;
  isFaceReady?: boolean;
  /** Overrides the bottom footer label, e.g. "Identity Ready" / "Setup Required". */
  identityStatusLabel?: string;
  identityReady?: boolean;
}

function ShieldCheckIcon({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2.5L20 5.5V11.2C20 16.1 16.6 20.4 12 21.5C7.4 20.4 4 16.1 4 11.2V5.5L12 2.5Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path
        d="M9 12.2L11.2 14.4L15.4 9.8"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * HeroCard
 *
 * The centerpiece of the Face Verification home screen. Presents the
 * worker's biometric identity as a premium terminal readout: badge,
 * glowing portrait, name, coded identifier pill, live status chips, and a
 * footer confirming readiness — mirroring the "scan complete" summary
 * screens on commercial biometric hardware (BioStation / Hikvision).
 */
export default function HeroCard({
  name,
  workerCode,
  photoUri,
  isActive = true,
  isFaceReady = true,
  identityStatusLabel,
  identityReady = true,
}: HeroCardProps) {
  const { colors, typography, radius, spacing } = useFaceTheme();
  const footerLabel =
    identityStatusLabel ??
    (identityReady ? "Identity Ready" : "Setup Required");
  const footerColor = identityReady ? colors.success : colors.warning;

  return (
    <GlassPanel elevated radius={5} contentPadding={0} style={styles.wrapper}>
      <LinearGradient
        colors={colors.gradientHero}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.gradient}
      >
        <View
          style={[
            styles.body,
            {
              paddingTop: spacing.xl,
              paddingHorizontal: spacing.lg,
              paddingBottom: spacing.lg,
            },
          ]}
        >
          <View style={{ marginBottom: spacing.lg }}>
            <FacePreview photoUri={photoUri} />
          </View>

          <Text
            style={[typography.display, { textAlign: "center" }]}
            numberOfLines={1}
          >
            {name}
          </Text>

          <View
            style={[
              styles.codePill,
              {
                marginTop: spacing.sm,
                paddingVertical: spacing.xxs,
                paddingHorizontal: spacing.md,
                borderRadius: radius.pill,
                backgroundColor: colors.glassFill,
                borderColor: colors.glassBorder,
              },
            ]}
          >
            <Text
              style={[
                typography.mono,
                { color: colors.textPrimary, letterSpacing: 1.2 },
              ]}
            >
              {workerCode}
            </Text>
          </View>

          <View
            style={[styles.chipRow, { gap: spacing.xs, marginTop: spacing.lg }]}
          >
            {isActive && <StatusChip label="Active" tone="success" />}
            {isFaceReady && <StatusChip label="Face Ready" tone="info" />}
          </View>
        </View>

        <View
          style={[
            styles.footer,
            {
              gap: spacing.xs,
              paddingVertical: spacing.md,
              borderTopColor: colors.glassBorder,
              backgroundColor: colors.glassFill,
            },
          ]}
        >
          <ShieldCheckIcon color={footerColor} />
          <Text style={[typography.bodyStrong, { color: footerColor }]}>
            {footerLabel}
          </Text>
        </View>
      </LinearGradient>
    </GlassPanel>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: "100%",
  },
  gradient: {
    width: "100%",
  },
  body: {
    alignItems: "center",
  },
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderWidth: 1,
  },
  codePill: {
    borderWidth: 1,
  },
  chipRow: {
    flexDirection: "row",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderTopWidth: 1,
  },
});
