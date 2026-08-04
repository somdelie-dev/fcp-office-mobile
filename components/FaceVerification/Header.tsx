import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { Colors, Radius, Spacing, Typography } from "./faceTheme";

interface HeaderProps {
  title?: string;
  subtitle?: string;
  onBackPress?: () => void;
}

function ChevronLeftIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15 18L9 12L15 6"
        stroke={Colors.textPrimary}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ShieldIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2.5L20 5.5V11.2C20 16.1 16.6 20.4 12 21.5C7.4 20.4 4 16.1 4 11.2V5.5L12 2.5Z"
        stroke={Colors.primary}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path
        d="M9 12.2L11.2 14.4L15.4 9.8"
        stroke={Colors.primary}
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

  const handleBack = () => {
    if (onBackPress) {
      onBackPress();
      return;
    }
    if (router.canGoBack()) {
      router.back();
    }
  };

  return (
    <View style={styles.container}>
      <Pressable
        onPress={handleBack}
        hitSlop={12}
        style={({ pressed }) => [
          styles.iconButton,
          pressed && styles.iconButtonPressed,
        ]}
      >
        <ChevronLeftIcon />
      </Pressable>

      <View style={styles.titleBlock}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>

      <View style={styles.iconButton}>
        <ShieldIcon />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.glassFill,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  iconButtonPressed: {
    backgroundColor: Colors.glassFillStrong,
  },
  titleBlock: {
    flex: 1,
  },
  title: {
    ...Typography.headline,
    fontSize: 20,
  },
  subtitle: {
    ...Typography.caption,
    marginTop: 2,
  },
});
