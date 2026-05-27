import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../lib/themeContext";

interface ThemeToggleProps {
  size?: "small" | "medium" | "large";
}

export function ThemeToggle({ size = "medium" }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  const translateX = useRef(new Animated.Value(isDark ? 1 : 0)).current;
  const rotateAnim = useRef(new Animated.Value(isDark ? 1 : 0)).current;

  // Size configurations
  const sizes = {
    small: { width: 44, height: 24, knobSize: 18, iconSize: 12, padding: 3 },
    medium: { width: 56, height: 30, knobSize: 24, iconSize: 14, padding: 3 },
    large: { width: 68, height: 36, knobSize: 30, iconSize: 18, padding: 3 },
  };

  const config = sizes[size];
  const knobTravel = config.width - config.knobSize - config.padding * 2;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateX, {
        toValue: isDark ? 1 : 0,
        useNativeDriver: true,
        tension: 60,
        friction: 8,
      }),
      Animated.timing(rotateAnim, {
        toValue: isDark ? 1 : 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isDark, translateX, rotateAnim]);

  const knobTranslateX = translateX.interpolate({
    inputRange: [0, 1],
    outputRange: [0, knobTravel],
  });

  const iconRotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <Pressable
      onPress={toggleTheme}
      style={[
        styles.track,
        {
          width: config.width,
          height: config.height,
          borderRadius: config.height / 2,
          padding: config.padding,
          backgroundColor: isDark ? "#1e3a5f" : "#87ceeb",
        },
      ]}
      accessibilityRole="switch"
      accessibilityState={{ checked: isDark }}
      accessibilityLabel={`Switch to ${isDark ? "light" : "dark"} mode`}
    >
      {/* Stars (visible in dark mode) */}
      <Animated.View
        style={[
          styles.starsContainer,
          {
            opacity: translateX.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 1],
            }),
          },
        ]}
      >
        <View style={[styles.star, { top: 5, left: 8 }]} />
        <View style={[styles.star, styles.starSmall, { top: 12, left: 14 }]} />
        <View style={[styles.star, { top: 18, left: 6 }]} />
      </Animated.View>

      {/* Clouds (visible in light mode) */}
      <Animated.View
        style={[
          styles.cloudsContainer,
          {
            opacity: translateX.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 0],
            }),
          },
        ]}
      >
        <View style={[styles.cloud, { top: 8, right: 10 }]} />
        <View
          style={[styles.cloud, styles.cloudSmall, { top: 16, right: 6 }]}
        />
      </Animated.View>

      {/* Knob with icon */}
      <Animated.View
        style={[
          styles.knob,
          {
            width: config.knobSize,
            height: config.knobSize,
            borderRadius: config.knobSize / 2,
            backgroundColor: isDark ? "#fbbf24" : "#fef3c7",
            transform: [{ translateX: knobTranslateX }],
            shadowColor: isDark ? "#fbbf24" : "#f59e0b",
          },
        ]}
      >
        <Animated.View style={{ transform: [{ rotate: iconRotate }] }}>
          <Ionicons
            name={isDark ? "moon" : "sunny"}
            size={config.iconSize}
            color={isDark ? "#1e3a5f" : "#f59e0b"}
          />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    alignItems: "center",
    position: "relative",
    overflow: "hidden",
  },
  knob: {
    justifyContent: "center",
    alignItems: "center",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 10,
  },
  starsContainer: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    right: 0,
  },
  star: {
    position: "absolute",
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
  },
  starSmall: {
    width: 2,
    height: 2,
    borderRadius: 1,
    opacity: 0.7,
  },
  cloudsContainer: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    right: 0,
  },
  cloud: {
    position: "absolute",
    width: 12,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255, 255, 255, 0.8)",
  },
  cloudSmall: {
    width: 8,
    height: 4,
    borderRadius: 2,
  },
});
