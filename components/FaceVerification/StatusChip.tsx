import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Colors, Radius, Spacing, Typography } from "./faceTheme";

export type StatusChipTone =
  | "success"
  | "warning"
  | "info"
  | "neutral"
  | "danger";

interface StatusChipProps {
  label: string;
  tone?: StatusChipTone;
  /** Optional leading icon/dot element, e.g. a small Svg or lucide icon. */
  icon?: React.ReactNode;
  /** Renders a filled dot instead of a custom icon when no icon is provided. */
  showDot?: boolean;
}

const toneStyles: Record<
  StatusChipTone,
  { bg: string; border: string; text: string; dot: string }
> = {
  success: {
    bg: Colors.successDim,
    border: Colors.successBorder,
    text: Colors.success,
    dot: Colors.success,
  },
  warning: {
    bg: Colors.warningDim,
    border: Colors.warningBorder,
    text: Colors.warning,
    dot: Colors.warning,
  },
  info: {
    bg: Colors.primaryDim,
    border: "rgba(59, 130, 246, 0.4)",
    text: Colors.primary,
    dot: Colors.primary,
  },
  danger: {
    bg: Colors.dangerDim,
    border: "rgba(239, 68, 68, 0.4)",
    text: Colors.danger,
    dot: Colors.danger,
  },
  neutral: {
    bg: Colors.glassFill,
    border: Colors.glassBorder,
    text: Colors.textSecondary,
    dot: Colors.textTertiary,
  },
};

/**
 * StatusChip
 *
 * Compact pill used for identity/verification state throughout the module
 * (e.g. "Active", "Face Ready", "Complete", "Incomplete"). Purely
 * presentational — parent decides the tone based on real state.
 */
export default function StatusChip({
  label,
  tone = "neutral",
  icon,
  showDot = true,
}: StatusChipProps) {
  const t = toneStyles[tone];

  return (
    <View
      style={[styles.chip, { backgroundColor: t.bg, borderColor: t.border }]}
    >
      {icon ? (
        icon
      ) : showDot ? (
        <View style={[styles.dot, { backgroundColor: t.dot }]} />
      ) : null}
      <Text style={[styles.label, { color: t.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.pill,
    borderWidth: 1,
    gap: Spacing.xxs,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    ...Typography.caption,
    color: Colors.textPrimary,
  },
});
