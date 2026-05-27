import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../lib/themeContext";

interface LoadingOverlayProps {
  icon?: string;
  title?: string;
  message?: string;
  visible?: boolean;
}

const themes = {
  dark: {
    titleColor: "white",
    messageColor: "#94a3b8",
  },
  light: {
    titleColor: "#111",
    messageColor: "#999",
  },
};

export default function LoadingOverlay({
  icon = "⏳",
  title = "Loading…",
  message = "Please wait",
}: LoadingOverlayProps) {
  const { theme } = useTheme();
  const colors = themes[theme];

  // Animation values
  const spinValue = useRef(new Animated.Value(0)).current;
  const pulseValue = useRef(new Animated.Value(1)).current;
  const fadeValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Spin animation
    Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 2000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ).start();

    // Pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseValue, {
          toValue: 1.2,
          duration: 800,
          easing: Easing.ease,
          useNativeDriver: true,
        }),
        Animated.timing(pulseValue, {
          toValue: 1,
          duration: 800,
          easing: Easing.ease,
          useNativeDriver: true,
        }),
      ]),
    ).start();

    // Fade in animation
    Animated.timing(fadeValue, {
      toValue: 1,
      duration: 400,
      easing: Easing.ease,
      useNativeDriver: true,
    }).start();
  }, []);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.emptyContainer,
          {
            opacity: fadeValue,
          },
        ]}
      >
        <Animated.Text
          style={[
            styles.emptyIcon,
            {
              transform: [{ rotate: spin }, { scale: pulseValue }],
            },
          ]}
        >
          {icon}
        </Animated.Text>
        <Text style={[styles.emptyTitle, { color: colors.titleColor }]}>
          {title}
        </Text>
        <Text style={[styles.emptyMessage, { color: colors.messageColor }]}>
          {message}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  emptyMessage: {
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
    lineHeight: 20,
  },
});
