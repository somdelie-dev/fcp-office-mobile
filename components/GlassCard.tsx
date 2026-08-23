import React from "react";
import { StyleSheet, View, ViewStyle, type StyleProp } from "react-native";
import { useAppTheme } from "../lib/appTheme";

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function GlassCard({ children, style }: Props) {
  const { isDark, colors } = useAppTheme();

  // Elevated surface + green-tinted border, matching the Face Scan module's
  // glass card treatment instead of the old blue tint.
  const cardStyle = isDark
    ? {
        backgroundColor: "rgba(11, 24, 38, 0.85)",
        borderColor: colors.primaryGreenDim,
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
