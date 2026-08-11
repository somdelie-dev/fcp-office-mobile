import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { FaceColorPalette, useFaceTheme } from "./faceTheme";

export type StatusChipTone = "success" | "warning" | "info" | "neutral" | "danger";

interface StatusChipProps {
  label: string;
  tone?: StatusChipTone;
  /** Optional leading icon/dot element, e.g. a small Svg or lucide icon. */
  icon?: React.ReactNode;
  /** Renders a filled dot instead of a custom icon when no icon is provided. */
  showDot?: boolean;
}

function getToneStyles(
  colors: FaceColorPalette,
): Record<StatusChipTone, { bg: string; border: string; text: string; dot: string }> {
  return {
    success: {
      bg: colors.successDim,
      border: colors.successBorder,
      text: colors.success,
      dot: colors.success,
    },
    warning: {
      bg: colors.warningDim,
      border: colors.warningBorder,
      text: colors.warning,
      dot: colors.warning,
    },
    info: {
      bg: colors.primaryDim,
      border: colors.primaryGlow,
      text: colors.primary,
      dot: colors.primary,
    },
    danger: {
      bg: colors.dangerDim,
      border: colors.dangerBorder,
      text: colors.danger,
      dot: colors.danger,
    },
    neutral: {
      bg: colors.glassFill,
      border: colors.glassBorder,
      text: colors.textSecondary,
      dot: colors.textTertiary,
    },
  };
}

/**
 * StatusChip
 *
 * Compact pill used for identity/verification state throughout the module
 * (e.g. "Active", "Face Ready", "Complete", "Incomplete"). Purely
 * presentational — parent decides the tone based on real state.
 */
export default function StatusChip({ label, tone = "neutral", icon, showDot = true }: StatusChipProps) {
  const { colors, typography, radius, spacing } = useFaceTheme();
  const t = getToneStyles(colors)[tone];

  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: t.bg,
          borderColor: t.border,
          paddingVertical: spacing.xs,
          paddingHorizontal: spacing.sm,
          borderRadius: radius.pill,
          gap: spacing.xxs,
        },
      ]}
    >
      {icon ? icon : showDot ? <View style={[styles.dot, { backgroundColor: t.dot }]} /> : null}
      <Text style={[typography.caption, { color: t.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    borderWidth: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
