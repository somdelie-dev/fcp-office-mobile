import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { useFaceTheme } from "./faceTheme";

interface PrimaryActionsProps {
  onVerifyPress?: () => void;
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

/**
 * PrimaryActions
 *
 * The terminal's main call to action, rendered as a large tactile card
 * rather than a conventional button. "Capture Reference Photos" used to
 * have a second card here, but it duplicated ReferencePhotosCard's own
 * capture button on the same screen — removed rather than offering the
 * same action twice.
 */
export default function PrimaryActions({ onVerifyPress }: PrimaryActionsProps) {
  const { colors, typography, spacing, shadows } = useFaceTheme();

  return (
    <View style={[styles.container, { gap: spacing.md }]}>
      <Pressable onPress={onVerifyPress} style={({ pressed }) => [pressed && styles.pressed]}>
        <LinearGradient
          colors={[colors.success, "#16A34A"] as const}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.card, { gap: spacing.md, paddingVertical: spacing.lg, paddingHorizontal: spacing.lg, borderRadius: 5 }, shadows.glowSoft]}
        >
          <View style={[styles.iconBadgePrimary, { borderRadius: 5 }]}>
            <FaceScanIcon color={colors.textOnPrimary} />
          </View>
          <View style={styles.textBlock}>
            <Text style={[typography.title, { fontSize: 20, color: colors.textOnPrimary }]}>Verify Face</Text>
            <Text style={[typography.body, { color: "rgba(255,255,255,0.82)", marginTop: 2 }]}>
              Verify identity using facial recognition
            </Text>
          </View>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  pressed: {
    opacity: 0.9,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconBadgePrimary: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  textBlock: {
    flex: 1,
  },
});
