import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withDelay,
  interpolate,
  Extrapolate,
} from "react-native-reanimated";
import Svg, { G, Circle, Path } from "react-native-svg";

interface SuccessAnimationProps {
  employee: {
    fullName: string;
    scanTime: string;
  } | null;
  visible: boolean;
  onComplete?: () => void;
  title?: string;
  caption?: string;
}

export function SuccessAnimation({
  employee,
  visible,
  onComplete,
  title = "Scanned Out",
  caption = "Ready for next employee...",
}: SuccessAnimationProps) {
  const checkmarkScale = useSharedValue(0);
  const checkmarkOpacity = useSharedValue(0);
  const contentOpacity = useSharedValue(0);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      backdropOpacity.value = withTiming(1, { duration: 300 });
      checkmarkScale.value = withTiming(1, {
        duration: 600,
      });
      checkmarkOpacity.value = withTiming(1, { duration: 300 });
      contentOpacity.value = withDelay(200, withTiming(1, { duration: 400 }));

      // Auto complete after 2.5 seconds
      const timer = setTimeout(() => {
        onComplete?.();
      }, 2500);

      return () => clearTimeout(timer);
    } else {
      checkmarkScale.value = 0;
      checkmarkOpacity.value = 0;
      contentOpacity.value = 0;
      backdropOpacity.value = 0;
    }
  }, [visible]);

  const checkmarkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkmarkScale.value }],
    opacity: checkmarkOpacity.value,
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  if (!employee || !visible) return null;

  return (
    <Animated.View style={[styles.container, backdropStyle]}>
      <View style={styles.content}>
        {/* Animated checkmark */}
        <Animated.View style={[styles.checkmarkContainer, checkmarkStyle]}>
          <Svg width={80} height={80} viewBox="0 0 80 80">
            <G>
              <Circle
                cx="40"
                cy="40"
                r="38"
                fill="none"
                stroke="#22C55E"
                strokeWidth="2"
              />
              <Path
                d="M 25 40 L 35 50 L 55 30"
                stroke="#22C55E"
                strokeWidth="4"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </G>
          </Svg>
        </Animated.View>

        {/* Success text and info */}
        <Animated.View style={[styles.textContainer, contentStyle]}>
          <Text style={styles.successTitle}>{title}</Text>
          <Text style={styles.employeeName}>{employee.fullName}</Text>
          <Text style={styles.scanTime}>{employee.scanTime}</Text>

          <View style={styles.loadingIndicator}>
            <Text style={styles.loadingText}>{caption}</Text>
          </View>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    alignItems: "center",
    justifyContent: "center",
  },
  checkmarkContainer: {
    marginBottom: 24,
  },
  textContainer: {
    alignItems: "center",
  },
  successTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#22C55E",
    marginBottom: 8,
  },
  employeeName: {
    fontSize: 20,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  scanTime: {
    fontSize: 16,
    color: "#9CA3AF",
    marginBottom: 16,
  },
  loadingIndicator: {
    marginTop: 12,
    paddingHorizontal: 20,
  },
  loadingText: {
    fontSize: 13,
    color: "#6B7280",
    fontStyle: "italic",
  },
});
