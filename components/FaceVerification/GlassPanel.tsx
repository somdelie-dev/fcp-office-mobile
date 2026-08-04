import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import React, { PropsWithChildren } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import Animated from "react-native-reanimated";

import { Colors, Layout, Radius, Shadows } from "./faceTheme";

interface GlassPanelProps extends PropsWithChildren {
  /** Corner radius override. Defaults to the standard 28px card radius. */
  radius?: number;
  /** Adds a stronger elevation + glow shadow, used for the hero card. */
  elevated?: boolean;
  /** Adds a faint top-highlight gradient to imply a curved glass surface. */
  showSheen?: boolean;
  /** Extra style applied to the outer wrapper (margins, flex, etc). */
  style?: ViewStyle | ViewStyle[];
  /** Padding applied inside the panel. Defaults to 24. */
  contentPadding?: number;
  /** Reserved for Reanimated entrance/press animations — pass an animated style. */
  animatedStyle?: ViewStyle;
}

/**
 * GlassPanel
 *
 * Base "frosted glass" surface used by every card in the Face Verification
 * module. Combines a blur layer, a translucent fill, a thin luminous border,
 * and an inner glow to read as premium biometric-terminal chrome rather than
 * a flat admin-app card.
 *
 * This component is intentionally style-only — it has no press behavior.
 * Wrap it in a Pressable/TouchableOpacity where interaction is needed
 * (see PrimaryActions.tsx).
 */
export default function GlassPanel({
  children,
  radius = Radius.xl,
  elevated = false,
  showSheen = true,
  style,
  contentPadding = 24,
  animatedStyle,
}: GlassPanelProps) {
  return (
    <Animated.View
      style={[
        styles.wrapper,
        { borderRadius: radius },
        elevated ? Shadows.card : undefined,
        style,
        animatedStyle,
      ]}
    >
      <BlurView
        intensity={Layout.blurIntensity}
        tint="dark"
        style={[StyleSheet.absoluteFillObject, { borderRadius: radius }]}
      />

      <View
        style={[
          StyleSheet.absoluteFillObject,
          styles.fill,
          { borderRadius: radius, borderColor: Colors.glassBorder },
        ]}
      />

      {showSheen && (
        <LinearGradient
          colors={["rgba(255,255,255,0.08)", "rgba(255,255,255,0)"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.6 }}
          style={[StyleSheet.absoluteFillObject, { borderRadius: radius }]}
          pointerEvents="none"
        />
      )}

      <View style={[styles.content, { padding: contentPadding }]}>
        {children}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    overflow: "hidden",
    backgroundColor: Colors.backgroundElevated,
  },
  fill: {
    backgroundColor: Colors.glassFill,
    borderWidth: 1,
  },
  content: {
    width: "100%",
  },
});
