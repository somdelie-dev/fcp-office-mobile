import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useFaceTheme } from "./faceTheme";

interface PrimaryActionsProps {
  onVerifyPress?: () => void;
}

function ShieldIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3L19 5.7V11C19 15.5 16.1 19.3 12 20.5C7.9 19.3 5 15.5 5 11V5.7L12 3Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path
        d="M8.8 11.8L11 14L15.5 9.5"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export default function PrimaryActions({ onVerifyPress }: PrimaryActionsProps) {
  const { colors, typography } = useFaceTheme();

  return (
    <Pressable
      onPress={onVerifyPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: colors.primary,
        },
        pressed && {
          opacity: 0.85,
        },
      ]}
    >
      <ShieldIcon color={colors.textOnPrimary} />

      <Text
        style={[
          typography.bodyStrong,
          {
            color: colors.textOnPrimary,
            fontSize: 14,
            marginLeft: 7,
          },
        ]}
      >
        Verify identity
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: "100%",
    height: 37,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
});
