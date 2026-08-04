import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Image, StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";

import { Colors, Layout, Shadows } from "./faceTheme";

interface FacePreviewProps {
  /** Remote or local portrait source. Falls back to a glass silhouette if omitted. */
  photoUri?: string | null;
  /** Diameter of the portrait itself. Defaults to the 180px spec size. */
  size?: number;
  /** Reserved for Reanimated pulse/breathing animation on the outer glow ring. */
  animatedGlowStyle?: object;
}

/**
 * FacePreview
 *
 * The centerpiece biometric portrait: an outer ambient blue glow, a
 * conic-style gradient ring (simulated with a two-color linear gradient),
 * a frosted glass inner ring, and the portrait image itself with a soft
 * directional shadow. Modeled after Face ID / BioStation capture previews.
 */
export default function FacePreview({
  photoUri,
  size = Layout.portraitSize,
  animatedGlowStyle,
}: FacePreviewProps) {
  const outerGlowSize = size + 40;
  const ringSize = size + 12;

  return (
    <View
      style={[
        styles.container,
        { width: outerGlowSize, height: outerGlowSize },
      ]}
    >
      {/* Outer ambient glow */}
      <Animated.View
        style={[
          styles.outerGlow,
          {
            width: outerGlowSize,
            height: outerGlowSize,
            borderRadius: outerGlowSize / 2,
          },
          Shadows.glow,
          animatedGlowStyle,
        ]}
      />

      {/* Gradient ring */}
      <LinearGradient
        colors={Colors.gradientPortraitRing}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.ring,
          { width: ringSize, height: ringSize, borderRadius: ringSize / 2 },
        ]}
      >
        {/* Inner glass ring */}
        <View
          style={[
            styles.innerRing,
            { width: size + 6, height: size + 6, borderRadius: (size + 6) / 2 },
          ]}
        >
          {/* Portrait */}
          <View
            style={[
              styles.portraitWrapper,
              { width: size, height: size, borderRadius: size / 2 },
              Shadows.portrait,
            ]}
          >
            {photoUri ? (
              <Image
                source={{ uri: photoUri }}
                style={{ width: size, height: size, borderRadius: size / 2 }}
                resizeMode="cover"
              />
            ) : (
              <View
                style={[
                  styles.placeholder,
                  { width: size, height: size, borderRadius: size / 2 },
                ]}
              />
            )}
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  outerGlow: {
    position: "absolute",
    backgroundColor: Colors.primaryDim,
  },
  ring: {
    alignItems: "center",
    justifyContent: "center",
    padding: 3,
  },
  innerRing: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.backgroundElevated,
    borderWidth: 1,
    borderColor: Colors.glassBorderStrong,
  },
  portraitWrapper: {
    overflow: "hidden",
    backgroundColor: Colors.backgroundDeep,
  },
  placeholder: {
    backgroundColor: Colors.backgroundDeep,
  },
});
