import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

/**
 * Sweeping beam + breathing glow over a live camera feed — the signal that
 * the camera is actively looking for a face rather than just showing a
 * static preview. Stops and resets whenever `active` goes false instead of
 * running invisibly in the background. Shared by the clock-out scanner and
 * the reference-photo capture flow so both read as the same "scanning"
 * moment.
 */
export default function ScanLineOverlay({
  active,
  color,
  size,
}: {
  active: boolean;
  color: string;
  size: number;
}) {
  const sweep = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) {
      sweep.stopAnimation();
      pulse.stopAnimation();
      sweep.setValue(0);
      pulse.setValue(0);
      return;
    }

    const sweepLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(sweep, {
          toValue: 1,
          duration: 1700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(sweep, {
          toValue: 0,
          duration: 1700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    sweepLoop.start();
    pulseLoop.start();
    return () => {
      sweepLoop.stop();
      pulseLoop.stop();
    };
  }, [active, sweep, pulse]);

  if (!active) return null;

  const translateY = sweep.interpolate({
    inputRange: [0, 1],
    outputRange: [size * 0.08, size * 0.92],
  });
  const opacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 1],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.wrap, { transform: [{ translateY }], opacity }]}
    >
      <LinearGradient
        colors={[`${color}00`, `${color}CC`, `${color}00`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{ flex: 1 }}
      />
      <View style={[styles.core, { backgroundColor: color, shadowColor: color }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 54,
  },
  core: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 6,
  },
});
