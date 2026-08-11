import React from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useFaceTheme } from "./faceTheme";

interface FaceScreenBackgroundProps {
  children: React.ReactNode;
}

/**
 * FaceScreenBackground
 *
 * Full-bleed backdrop with soft ambient glow circles, shared by every
 * screen in the Face Verification module. Follows the app-wide light/dark
 * theme (see lib/themeContext) rather than being hardcoded to one look.
 */
export default function FaceScreenBackground({
  children,
}: FaceScreenBackgroundProps) {
  const { colors, isDark } = useFaceTheme();

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={["bottom"]}
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View
          style={[
            // styles.glow,
            styles.glowTop,
            { backgroundColor: colors.primary, opacity: isDark ? 0.22 : 0.14 },
          ]}
          pointerEvents="none"
        />
        <View
          style={[
            // styles.glow,
            styles.glowBottom,
            {
              backgroundColor: colors.secondary,
              opacity: isDark ? 0.22 : 0.12,
            },
          ]}
          pointerEvents="none"
        />
        <View style={styles.content}>{children}</View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  container: {
    flex: 1,
    overflow: "hidden",
  },
  // glow: {
  //   position: "absolute",
  //   width: 320,
  //   height: 320,
  //   borderRadius: 320,
  //   // Ensure decorative glows sit behind navigational chrome (avatar, icons)
  //   // so they do not visually cover interactive header elements.
  //   zIndex: -1,
  //   elevation: 0,
  // },
  glowTop: {
    top: -220,
    right: -260,
  },
  glowBottom: {
    bottom: -240,
    left: -200,
  },
  content: {
    flex: 1,
  },
});
