import React from "react";
import { StyleSheet, View, ViewStyle, type StyleProp } from "react-native";
import { useTheme } from "../lib/themeContext";

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function GlassCard({ children, style }: Props) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const cardStyle = isDark
    ? {
        backgroundColor: "rgba(15, 23, 42, 0.8)",
        borderColor: "rgba(56, 189, 248, 0.25)",
      }
    : {
        backgroundColor: "rgba(255,255,255,0.72)",
        borderColor: "rgba(255,255,255,0.6)",
      };

  return <View style={[styles.card, cardStyle, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 5,
    padding: 16,
    borderWidth: 1,

    // Soft shadow
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
});
