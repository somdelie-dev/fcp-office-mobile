import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  interpolate,
  Extrapolate,
} from "react-native-reanimated";
import Svg, {
  Circle,
  G,
  Line,
  Defs,
  RadialGradient,
  Stop,
} from "react-native-svg";

export type FaceGuideState = "idle" | "detecting" | "success" | "error";

interface FaceGuideProps {
  state: FaceGuideState;
  size?: number;
}

const getStrokeColor = (state: FaceGuideState): string => {
  switch (state) {
    case "success":
      return "#22C55E";
    case "detecting":
      return "#3B82F6";
    case "error":
      return "#EF4444";
    default:
      return "#6B7280";
  }
};

export function FaceGuide({ state, size = 200 }: FaceGuideProps) {
  const pulseAnim = useSharedValue(0);
  const scanlineAnim = useSharedValue(0);
  const glowAnim = useSharedValue(0);
  const shakeAnim = useSharedValue(0);

  useEffect(() => {
    if (state === "idle" || state === "detecting") {
      pulseAnim.value = withRepeat(withTiming(1, { duration: 1500 }), -1, true);
    } else {
      pulseAnim.value = 0;
    }
  }, [state]);

  useEffect(() => {
    if (state === "detecting") {
      scanlineAnim.value = withRepeat(
        withTiming(1, { duration: 2000 }),
        -1,
        false,
      );
    } else {
      scanlineAnim.value = 0;
    }
  }, [state]);

  useEffect(() => {
    if (state === "success") {
      glowAnim.value = withRepeat(withTiming(1, { duration: 1000 }), -1, true);
    } else {
      glowAnim.value = 0;
    }
  }, [state]);

  useEffect(() => {
    if (state === "error") {
      shakeAnim.value = withSequence(
        withTiming(1, { duration: 60 }),
        withTiming(-1, { duration: 60 }),
        withTiming(1, { duration: 60 }),
        withTiming(0, { duration: 60 }),
      );
    }
  }, [state]);

  const pulseStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(
        pulseAnim.value,
        [0, 0.5, 1],
        [0.3, 0.6, 0.3],
        Extrapolate.CLAMP,
      ),
      transform: [
        {
          scale: interpolate(
            pulseAnim.value,
            [0, 1],
            [1, 1.15],
            Extrapolate.CLAMP,
          ),
        },
      ],
    };
  });

  const scanlineStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          translateY: interpolate(
            scanlineAnim.value,
            [0, 1],
            [-size / 2, size / 2],
            Extrapolate.CLAMP,
          ),
        },
      ],
      opacity: interpolate(
        scanlineAnim.value,
        [0, 0.5, 1],
        [0, 0.8, 0],
        Extrapolate.CLAMP,
      ),
    };
  });

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeAnim.value * 8 }],
  }));

  const strokeColor = getStrokeColor(state);
  const showGlowCircle = state === "success";
  const showScanline = state === "detecting";

  return (
    <Animated.View
      style={[styles.container, { width: size, height: size }, shakeStyle]}
    >
      {/* SVG with gradient glow */}
      <Svg width={size} height={size} style={styles.svg}>
        <Defs>
          <RadialGradient id="glow" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
            <Stop offset="0%" stopColor={strokeColor} stopOpacity="0.3" />
            <Stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
          </RadialGradient>
        </Defs>

        {showGlowCircle ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={size / 2}
            fill="url(#glow)"
            opacity={0.5}
          />
        ) : null}
      </Svg>

      {/* Pulsing outer ring */}
      <Animated.View style={[styles.ring, pulseStyle]}>
        <Svg width={size} height={size} style={styles.svg}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={size / 2}
            fill="none"
            stroke={strokeColor}
            strokeWidth={2}
            strokeDasharray={`${(size * Math.PI) / 2} ${(size * Math.PI) / 2}`}
          />
        </Svg>
      </Animated.View>

      {/* Corner brackets */}
      <View style={[styles.cornerBracket, styles.topLeft]}>
        <Svg width={30} height={30}>
          <G stroke={strokeColor} strokeWidth={2} fill="none">
            <Line x1="3" y1="3" x2="15" y2="3" />
            <Line x1="3" y1="3" x2="3" y2="15" />
          </G>
        </Svg>
      </View>
      <View style={[styles.cornerBracket, styles.topRight]}>
        <Svg width={30} height={30}>
          <G stroke={strokeColor} strokeWidth={2} fill="none">
            <Line x1="15" y1="3" x2="27" y2="3" />
            <Line x1="27" y1="3" x2="27" y2="15" />
          </G>
        </Svg>
      </View>
      <View style={[styles.cornerBracket, styles.bottomLeft]}>
        <Svg width={30} height={30}>
          <G stroke={strokeColor} strokeWidth={2} fill="none">
            <Line x1="3" y1="15" x2="3" y2="27" />
            <Line x1="3" y1="27" x2="15" y2="27" />
          </G>
        </Svg>
      </View>
      <View style={[styles.cornerBracket, styles.bottomRight]}>
        <Svg width={30} height={30}>
          <G stroke={strokeColor} strokeWidth={2} fill="none">
            <Line x1="15" y1="27" x2="27" y2="27" />
            <Line x1="27" y1="15" x2="27" y2="27" />
          </G>
        </Svg>
      </View>

      {/* Scanning line (horizontal) */}
      {showScanline ? (
        <Animated.View
          style={[
            styles.scanline,
            {
              width: size,
              height: 2,
              top: size / 2,
            },
            scanlineStyle,
          ]}
        />
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  svg: {
    position: "absolute",
  },
  ring: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  cornerBracket: {
    position: "absolute",
  },
  topLeft: {
    top: -15,
    left: -15,
  },
  topRight: {
    top: -15,
    right: -15,
  },
  bottomLeft: {
    bottom: -15,
    left: -15,
  },
  bottomRight: {
    bottom: -15,
    right: -15,
  },
  scanline: {
    backgroundColor: "#3B82F6",
    position: "absolute",
    opacity: 0.8,
  },
});
