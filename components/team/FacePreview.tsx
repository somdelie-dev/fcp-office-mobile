import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Image, StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";

import { useFaceTheme } from "./faceTheme";

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
export default function FacePreview({ photoUri, size, animatedGlowStyle }: FacePreviewProps) {
  const { colors, shadows, layout } = useFaceTheme();
  const resolvedSize = size ?? layout.portraitSize;
  const outerGlowSize = resolvedSize + 40;
  const ringSize = resolvedSize + 12;

  return (
    <View style={[styles.container, { width: outerGlowSize, height: outerGlowSize }]}>
      {/* Outer ambient glow */}
      <Animated.View
        style={[
          styles.outerGlow,
          {
            width: outerGlowSize,
            height: outerGlowSize,
            borderRadius: outerGlowSize / 2,
            backgroundColor: colors.primaryDim,
          },
          shadows.glow,
          animatedGlowStyle,
        ]}
      />

      {/* Gradient ring */}
      <LinearGradient
        colors={colors.gradientPortraitRing}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.ring, { width: ringSize, height: ringSize, borderRadius: ringSize / 2 }]}
      >
        {/* Inner glass ring */}
        <View
          style={[
            styles.innerRing,
            {
              width: resolvedSize + 6,
              height: resolvedSize + 6,
              borderRadius: (resolvedSize + 6) / 2,
              backgroundColor: colors.backgroundElevated,
              borderColor: colors.glassBorderStrong,
            },
          ]}
        >
          {/* Portrait */}
          <View
            style={[
              styles.portraitWrapper,
              {
                width: resolvedSize,
                height: resolvedSize,
                borderRadius: resolvedSize / 2,
                backgroundColor: colors.backgroundDeep,
              },
              shadows.portrait,
            ]}
          >
            {photoUri ? (
              <Image
                source={{ uri: photoUri }}
                style={{ width: resolvedSize, height: resolvedSize, borderRadius: resolvedSize / 2 }}
                resizeMode="cover"
              />
            ) : (
              <View
                style={[
                  styles.placeholder,
                  {
                    width: resolvedSize,
                    height: resolvedSize,
                    borderRadius: resolvedSize / 2,
                    backgroundColor: colors.backgroundDeep,
                  },
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
  },
  ring: {
    alignItems: "center",
    justifyContent: "center",
    padding: 3,
  },
  innerRing: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  portraitWrapper: {
    overflow: "hidden",
  },
  placeholder: {},
});
