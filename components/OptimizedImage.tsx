/**
 * Optimized Image Component
 *
 * A drop-in replacement for React Native Image that:
 * - Uses expo-image for disk caching (no re-downloads)
 * - Applies Cloudinary optimizations automatically
 * - Shows placeholder/fallback for missing images
 */

import { Image as ExpoImage, ImageStyle } from "expo-image";
import React, { useMemo } from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";

import {
  getAvatarColor,
  getDetailUrl,
  getInitials,
  getThumbnailUrl,
} from "../lib/cloudinaryImage";

export type OptimizedImageProps = {
  /** Image URL (will be optimized for Cloudinary) */
  uri?: string | null;
  /** Size variant: thumbnail for lists, detail for full-screen */
  size?: "thumbnail" | "detail" | "original";
  /** Content fit mode */
  contentFit?: "cover" | "contain" | "fill" | "none" | "scale-down";
  /** Style for the image container */
  style?: StyleProp<ImageStyle | ViewStyle>;
  /** Name for avatar fallback (will show initials) */
  fallbackName?: string;
  /** Border radius */
  borderRadius?: number;
  /** Whether this is an avatar (circular, shows initials on failure) */
  isAvatar?: boolean;
  /** Placeholder blur hash */
  placeholder?: string;
  /** Transition duration in ms */
  transition?: number;
};

/**
 * Optimized image component with caching and Cloudinary optimization
 */
export function OptimizedImage({
  uri,
  size = "thumbnail",
  contentFit = "cover",
  style,
  fallbackName,
  borderRadius = 0,
  isAvatar = false,
  placeholder,
  transition = 200,
}: OptimizedImageProps) {
  // Apply Cloudinary transformations
  const optimizedUri = useMemo(() => {
    if (!uri) return null;
    switch (size) {
      case "thumbnail":
        return getThumbnailUrl(uri);
      case "detail":
        return getDetailUrl(uri);
      default:
        return uri;
    }
  }, [uri, size]);

  // Avatar-specific styles
  const avatarRadius = isAvatar ? 999 : borderRadius;

  // If no URI, show fallback
  if (!optimizedUri) {
    if (isAvatar && fallbackName) {
      return (
        <View
          style={[
            styles.avatarFallback,
            {
              backgroundColor: getAvatarColor(fallbackName),
              borderRadius: avatarRadius,
            },
            style,
          ]}
        >
          <Text style={styles.avatarInitials}>{getInitials(fallbackName)}</Text>
        </View>
      );
    }
    return (
      <View
        style={[styles.placeholder, { borderRadius: avatarRadius }, style]}
      />
    );
  }

  return (
    <ExpoImage
      source={{ uri: optimizedUri }}
      style={[{ borderRadius: avatarRadius }, style] as ImageStyle[]}
      contentFit={contentFit}
      cachePolicy="disk"
      placeholder={placeholder}
      transition={transition}
    />
  );
}

/**
 * Avatar component (circular image with initials fallback)
 */
export function Avatar({
  uri,
  name,
  size = 48,
  style,
}: {
  uri?: string | null;
  name?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <OptimizedImage
      uri={uri}
      size="thumbnail"
      isAvatar
      fallbackName={name}
      style={[{ width: size, height: size }, style]}
      borderRadius={size / 2}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: "#e2e8f0",
  },
  avatarFallback: {
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitials: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 16,
  },
});
