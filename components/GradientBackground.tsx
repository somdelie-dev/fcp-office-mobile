import React from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../lib/themeContext";

export function GradientBackground({
  children,
}: {
  children: React.ReactNode;
}) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const containerBg = isDark ? "#0b1220" : "#fafafa";

  return (
    <View style={[styles.container, { backgroundColor: containerBg }]}>
      {/* Background gradient effects */}
      <View
        style={[
          styles.gradientBackground,
          {
            backgroundColor: isDark
              ? "rgba(56, 189, 248, 0.06)"
              : "rgba(99, 102, 241, 0.08)",
          },
        ]}
      />
      <View
        style={[
          styles.gradientAccent,
          {
            backgroundColor: isDark
              ? "rgba(56, 189, 248, 0.04)"
              : "rgba(168, 85, 247, 0.06)",
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
    top: -100,
    left: -50,
    width: 400,
    height: 400,
    borderRadius: 200,
    opacity: 0.6,
  },
  gradientAccent: {
    position: "absolute",
    bottom: -150,
    right: -100,
    width: 500,
    height: 500,
    borderRadius: 250,
    opacity: 0.5,
  },
});
