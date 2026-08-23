import React from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppTheme } from "../lib/appTheme";

type Props = {
  children: React.ReactNode;
};

export function AuthStyleBackground({ children }: Props) {
  const { isDark, colors } = useAppTheme();

  // Same dark background + green accent as the Face Scan screen, kept
  // consistent across light/dark instead of the old ad hoc blue/navy tint.
  const BG = colors.background;
  const CIRCLE_BG = isDark ? colors.primaryGreenDim : colors.primaryGreen;
  const CIRCLE_INNER_BG = isDark ? "rgba(34, 197, 94, 0.08)" : colors.surfaceElevated;

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
            { backgroundColor: CIRCLE_INNER_BG },
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
            { backgroundColor: CIRCLE_INNER_BG },
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
  content: {
    flex: 1,
    paddingTop: 12,
    justifyContent: "center",
  },

  circle: {
    position: "absolute",
    width: 360,
    height: 360,
    borderRadius: 360,
    opacity: 0.8,
    // Keep decorative circles behind the header/logo/avatar
    zIndex: -1,
    elevation: 0,
  },
  circleSmall: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 220,
    zIndex: -1,
    elevation: 0,
  },

  circleTop: { top: -260, right: -260 },
  circleTopInner: { top: -190, right: -190 },

  circleBottom: { bottom: -240, left: -240 },
  circleBottomInner: { bottom: -170, left: -170 },
});
