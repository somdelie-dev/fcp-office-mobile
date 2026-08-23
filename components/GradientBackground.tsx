import React from "react";
import { StyleSheet, View } from "react-native";
import { useAppTheme } from "../lib/appTheme";

export function GradientBackground({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isDark, colors } = useAppTheme();

  const containerBg = colors.background;

  return (
    <View style={[styles.container, { backgroundColor: containerBg }]}>
      {/* Background gradient effects, tinted with the Face Scan green accent */}
      <View
        style={[
          styles.gradientBackground,
          {
            backgroundColor: isDark
              ? "rgba(34, 197, 94, 0.06)"
              : "rgba(22, 163, 74, 0.07)",
          },
        ]}
      />
      <View
        style={[
          styles.gradientAccent,
          {
            backgroundColor: isDark
              ? "rgba(34, 197, 94, 0.04)"
              : "rgba(22, 163, 74, 0.05)",
          },
        ]}
      />

      {/* Content */}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: "relative",
  },
  gradientBackground: {
    position: "absolute",
    top: -160,
    left: -120,
    width: 420,
    height: 420,
    borderRadius: 210,
    opacity: 0.6,
    // Sit behind navigation chrome (logo/avatar)
    zIndex: -1,
    elevation: 0,
  },
  gradientAccent: {
    position: "absolute",
    bottom: -180,
    right: -140,
    width: 520,
    height: 520,
    borderRadius: 260,
    opacity: 0.5,
    zIndex: -1,
    elevation: 0,
  },
});
