import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { useFaceTheme } from "./faceTheme";

interface HeroCardProps {
  name: string;
  workerCode: string;
  photoUri?: string | null;
  isActive?: boolean;
  isFaceReady?: boolean;
  identityStatusLabel?: string;
  identityReady?: boolean;
}

export default function HeroCard({
  name,
  workerCode,
  photoUri,
  isActive = true,
  identityStatusLabel = "Setup Required",
  identityReady = false,
}: HeroCardProps) {
  const { colors, typography } = useFaceTheme();

  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.glassFill,
          borderColor: colors.glassBorder,
        },
      ]}
    >
      <View style={styles.identityRow}>
        <View
          style={[
            styles.avatar,
            {
              backgroundColor: colors.primary,
              borderColor: colors.glassBorder,
            },
          ]}
        >
          {photoUri ? (
            <Image
              source={{ uri: photoUri }}
              style={styles.avatarImage}
              resizeMode="cover"
            />
          ) : (
            <Text
              style={[
                typography.bodyStrong,
                styles.initials,
                {
                  color: colors.textOnPrimary,
                },
              ]}
            >
              {initials}
            </Text>
          )}
        </View>

        <View style={styles.identityText}>
          <Text
            numberOfLines={1}
            style={[
              typography.bodyStrong,
              {
                color: colors.textPrimary,
                fontSize: 16,
              },
            ]}
          >
            {name}
          </Text>

          <Text
            numberOfLines={1}
            style={[
              typography.caption,
              {
                color: colors.textSecondary,
                marginTop: 1,
              },
            ]}
          >
            Code {workerCode}
          </Text>
        </View>
      </View>

      <View style={styles.badges}>
        <View
          style={[
            styles.badge,
            {
              backgroundColor: isActive
                ? "rgba(0, 140, 35, 0.20)"
                : "rgba(120, 120, 120, 0.15)",
            },
          ]}
        >
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor: isActive
                  ? colors.success
                  : colors.textTertiary,
              },
            ]}
          />

          <Text
            style={[
              typography.caption,
              {
                color: isActive ? colors.success : colors.textSecondary,
                fontSize: 11,
                fontWeight: "700",
              },
            ]}
          >
            {isActive ? "Active" : "Inactive"}
          </Text>
        </View>

        <View
          style={[
            styles.badge,
            {
              backgroundColor: identityReady
                ? "rgba(0, 140, 35, 0.20)"
                : "rgba(160, 100, 0, 0.20)",
            },
          ]}
        >
          <Text
            style={[
              typography.caption,
              {
                color: identityReady ? colors.success : colors.warning,
                fontSize: 11,
                fontWeight: "700",
              },
            ]}
          >
            {identityReady ? "Identity ready" : identityStatusLabel}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
  },

  identityRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  avatar: {
    width: 100,
    height: 100,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    // borderWidth: 1,
  },

  avatarImage: {
    width: "100%",
    height: "100%",
  },

  initials: {
    fontSize: 17,
    fontWeight: "700",
  },

  identityText: {
    flex: 1,
    marginLeft: 12,
    paddingRight: 4,
  },

  badges: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    marginLeft: 0,
  },

  badge: {
    minHeight: 23,
    paddingHorizontal: 9,
    borderRadius: 7,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },

  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
});
