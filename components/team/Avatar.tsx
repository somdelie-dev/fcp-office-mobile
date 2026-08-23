import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { useFaceTheme } from "./faceTheme";

interface AvatarProps {
  uri?: string | null;
  name: string;
  size?: number;
  /** Ring color override — defaults to a subtle glass border. Pass colors.success for a "selected/active" look. */
  ringColor?: string;
}

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Circular worker photo with an initials fallback — most employees don't
 * have Employee.faceImageUrl set (it's an optional legacy field, separate
 * from the FaceEnrollment reference-photo system), so the fallback is the
 * common case, not an edge case.
 */
export default function Avatar({ uri, name, size = 48, ringColor }: AvatarProps) {
  const { colors } = useFaceTheme();
  const resolvedRing = ringColor ?? colors.glassBorderStrong;

  return (
    <View
      style={[
        styles.wrapper,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: resolvedRing,
          backgroundColor: colors.glassFillStrong,
        },
      ]}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />
      ) : (
        <Text style={[styles.initials, { color: colors.textPrimary, fontSize: size * 0.36 }]}>
          {initialsFor(name)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  initials: {
    fontWeight: "800",
  },
});
