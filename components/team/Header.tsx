import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { useFaceTheme } from "./faceTheme";

interface HeaderProps {
  title?: string;
  subtitle?: string;
  onBackPress?: () => void;
}

function ChevronLeftIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15 18L9 12L15 6"
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ShieldIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2.5L20 5.5V11.2C20 16.1 16.6 20.4 12 21.5C7.4 20.4 4 16.1 4 11.2V5.5L12 2.5Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path
        d="M9 12.2L11.2 14.4L15.4 9.8"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * Header
 *
 * Top navigation bar for the Face Verification home screen. Deliberately
 * minimal: a circular glass back button, a two-line title block, and a
 * shield glyph on the trailing edge signaling the biometric/security
 * context of the screen.
 */
export default function Header({
  title = "Face Verification",
  subtitle = "Verify identity before scan out",
  onBackPress,
}: HeaderProps) {
  const router = useRouter();
  const { colors, typography, radius, spacing } = useFaceTheme();

  const handleBack = () => {
    if (onBackPress) {
      onBackPress();
      return;
    }
    if (router.canGoBack()) {
      router.back();
    }
  };

  const iconButtonStyle = {
    backgroundColor: colors.glassFill,
    borderColor: colors.glassBorder,
  };

  return (
    <View style={[styles.container, { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md, gap: spacing.md }]}>
      <Pressable
        onPress={handleBack}
        hitSlop={12}
        style={({ pressed }) => [
          styles.iconButton,
          { borderRadius: radius.md },
          iconButtonStyle,
          pressed && { backgroundColor: colors.glassFillStrong },
        ]}
      >
        <ChevronLeftIcon color={colors.textPrimary} />
      </Pressable>

      <View style={styles.titleBlock}>
        <Text style={[typography.headline, { fontSize: 20 }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[typography.caption, { marginTop: 2 }]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>

      <View style={[styles.iconButton, { borderRadius: radius.md }, iconButtonStyle]}>
        <ShieldIcon color={colors.primary} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  titleBlock: {
    flex: 1,
  },
});
