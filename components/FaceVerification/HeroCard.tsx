import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { Colors, Radius, Spacing, Typography } from "./faceTheme";
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
  const footerLabel =
    identityStatusLabel ??
    (identityReady ? "Identity Ready" : "Setup Required");

  return (
    <GlassPanel
      elevated
      radius={Radius.xl}
      contentPadding={0}
      style={styles.wrapper}
    >
      <LinearGradient
        colors={Colors.gradientHero}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.body}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Face Verification</Text>
          </View>

          <View style={styles.portraitSlot}>
            <FacePreview photoUri={photoUri} />
          </View>

          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>

          <View style={styles.codePill}>
            <Text style={styles.codeText}>{workerCode}</Text>
          </View>

          <View style={styles.chipRow}>
            {isActive && <StatusChip label="Active" tone="success" />}
            {isFaceReady && <StatusChip label="Face Ready" tone="info" />}
          </View>
        </View>

        <View style={styles.footer}>
          <ShieldCheckIcon
            color={identityReady ? Colors.success : Colors.warning}
          />
          <Text
            style={[
              styles.footerText,
              { color: identityReady ? Colors.success : Colors.warning },
            ]}
          >
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
    paddingTop: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  badge: {
    paddingVertical: Spacing.xxs,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    backgroundColor: Colors.glassFill,
    marginBottom: Spacing.lg,
  },
  badgeText: {
    ...Typography.label,
    color: Colors.secondary,
  },
  portraitSlot: {
    marginBottom: Spacing.lg,
  },
  name: {
    ...Typography.display,
    textAlign: "center",
  },
  codePill: {
    marginTop: Spacing.sm,
    paddingVertical: Spacing.xxs,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    backgroundColor: Colors.glassFill,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  codeText: {
    ...Typography.mono,
    color: Colors.textPrimary,
    letterSpacing: 1.2,
  },
  chipRow: {
    flexDirection: "row",
    gap: Spacing.xs,
    marginTop: Spacing.lg,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.glassBorder,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  footerText: {
    ...Typography.bodyStrong,
  },
});
