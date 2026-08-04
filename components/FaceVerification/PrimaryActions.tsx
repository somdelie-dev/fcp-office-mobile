import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { Colors, Radius, Shadows, Spacing, Typography } from "./faceTheme";
import GlassPanel from "./GlassPanel";

interface PrimaryActionsProps {
  onVerifyPress?: () => void;
  onCaptureReferencePress?: () => void;
}

function FaceScanIcon({ color }: { color: string }) {
  return (
    <Svg width={30} height={30} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 8V6.5C4 5.1 5.1 4 6.5 4H8"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <Path
        d="M16 4H17.5C18.9 4 20 5.1 20 6.5V8"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <Path
        d="M20 16V17.5C20 18.9 18.9 20 17.5 20H16"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <Path
        d="M8 20H6.5C5.1 20 4 18.9 4 17.5V16"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <Path
        d="M9 10.5C9 10.5 9.5 9.5 10 10.5"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      <Path
        d="M14 10.5C14 10.5 14.5 9.5 15 10.5"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      <Path
        d="M9 14.5C9.8 15.4 14.2 15.4 15 14.5"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function CameraPlusIcon({ color }: { color: string }) {
  return (
    <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 8.5C4 7.4 4.9 6.5 6 6.5H8L9.2 4.5H14.8L16 6.5H18C19.1 6.5 20 7.4 20 8.5V17C20 18.1 19.1 19 18 19H6C4.9 19 4 18.1 4 17V8.5Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={12.5} r={3.4} stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}

/**
 * PrimaryActions
 *
 * The two primary calls to action on the Face Verification home screen,
 * rendered as large tactile cards rather than conventional buttons:
 *
 * 1. "Verify Face" — a bold blue-gradient card, the terminal's main action.
 * 2. "Capture Reference Photos" — a quieter glass card for secondary setup.
 */
export default function PrimaryActions({
  onVerifyPress,
  onCaptureReferencePress,
}: PrimaryActionsProps) {
  return (
    <View style={styles.container}>
      <Pressable
        onPress={onVerifyPress}
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        <LinearGradient
          colors={Colors.gradientPrimaryAction}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.card, Shadows.glowSoft]}
        >
          <View style={styles.iconBadgePrimary}>
            <FaceScanIcon color={Colors.textOnPrimary} />
          </View>
          <View style={styles.textBlock}>
            <Text style={styles.primaryTitle}>Verify Face</Text>
            <Text style={styles.primarySubtitle}>
              Verify identity using facial recognition
            </Text>
          </View>
        </LinearGradient>
      </Pressable>

      <Pressable
        onPress={onCaptureReferencePress}
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        <GlassPanel radius={Radius.xl} contentPadding={0}>
          <View style={styles.card}>
            <View style={styles.iconBadgeSecondary}>
              <CameraPlusIcon color={Colors.secondary} />
            </View>
            <View style={styles.textBlock}>
              <Text style={styles.secondaryTitle}>
                Capture Reference Photos
              </Text>
              <Text style={styles.secondarySubtitle}>
                Improve verification accuracy
              </Text>
            </View>
          </View>
        </GlassPanel>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.md,
  },
  pressed: {
    opacity: 0.9,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.xl,
  },
  iconBadgePrimary: {
    width: 56,
    height: 56,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  iconBadgeSecondary: {
    width: 56,
    height: 56,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.secondaryDim,
    borderWidth: 1,
    borderColor: "rgba(6, 182, 212, 0.35)",
  },
  textBlock: {
    flex: 1,
  },
  primaryTitle: {
    ...Typography.title,
    fontSize: 20,
    color: Colors.textOnPrimary,
  },
  primarySubtitle: {
    ...Typography.body,
    color: "rgba(255,255,255,0.82)",
    marginTop: 2,
  },
  secondaryTitle: {
    ...Typography.title,
    fontSize: 20,
  },
  secondarySubtitle: {
    ...Typography.body,
    marginTop: 2,
  },
});
