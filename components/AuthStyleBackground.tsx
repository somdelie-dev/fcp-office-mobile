import React from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../lib/themeContext";

type Props = {
  children: React.ReactNode;
};

export function AuthStyleBackground({ children }: Props) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const BG = isDark ? "#0b1220" : "#EEF0F5";
  const NAVY = isDark ? "#38bdf8" : "#262D68";
  const CIRCLE_BG = isDark ? "rgba(56, 189, 248, 0.15)" : NAVY;

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: BG }]}
      edges={["bottom"]}
    >
      <View style={[styles.container, { backgroundColor: BG }]}>
        {/* Decorative circles */}
        <View
          style={[
            styles.circle,
            styles.circleTop,
            { backgroundColor: CIRCLE_BG },
          ]}
        />
        <View
          style={[
            styles.circleSmall,
            styles.circleTopInner,
            {
              backgroundColor: isDark ? "rgba(56, 189, 248, 0.08)" : "#DADDE8",
            },
          ]}
        />

        <View
          style={[
            styles.circle,
            styles.circleBottom,
            { backgroundColor: CIRCLE_BG },
          ]}
        />
        <View
          style={[
            styles.circleSmall,
            styles.circleBottomInner,
            {
              backgroundColor: isDark ? "rgba(56, 189, 248, 0.08)" : "#DADDE8",
            },
          ]}
        />

        {/* Content */}
        <View style={styles.content}>{children}</View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1 },
  content: { flex: 1, paddingTop: 12 },

  circle: {
    position: "absolute",
    width: 360,
    height: 360,
    borderRadius: 360,
    opacity: 0.8,
  },
  circleSmall: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 220,
  },

  circleTop: { top: -220, right: -220 },
  circleTopInner: { top: -155, right: -155 },

  circleBottom: { bottom: -220, left: -220 },
  circleBottomInner: { bottom: -155, left: -155 },
});
