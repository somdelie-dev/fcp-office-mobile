import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "../../lib/appTheme";
import type { ForemanOption } from "../../lib/auth";

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * Makes the assistant's current "acting for" context impossible to miss.
 * Shows the foreman's real photo (Employee.faceImageUrl, surfaced by
 * /api/app/me as `photoUrl`) when one exists; falls back to an initials
 * avatar when there's no photo on file, or the image fails to load.
 */
export function ForemanContextBanner({
  foreman,
  onChange,
}: {
  foreman: ForemanOption;
  onChange?: () => void;
}) {
  const { colors } = useAppTheme();
  const [photoFailed, setPhotoFailed] = useState(false);
  const showPhoto = !!foreman.photoUrl && !photoFailed;

  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: colors.primaryGreenDim, borderColor: colors.primaryGreen },
      ]}
    >
      {showPhoto ? (
        <Image
          source={{ uri: foreman.photoUrl! }}
          style={styles.avatarPhoto}
          onError={() => setPhotoFailed(true)}
        />
      ) : (
        <View style={[styles.avatar, { backgroundColor: colors.primaryGreen }]}>
          <Text style={[styles.avatarText, { color: colors.textOnPrimary }]}>
            {initialsFor(foreman.name)}
          </Text>
        </View>
      )}

      <View style={{ flex: 1 }}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          ASSISTANT · WORKING FOR
        </Text>
        <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
          {foreman.name}
        </Text>
      </View>

      {onChange && (
        <Pressable
          onPress={onChange}
          hitSlop={8}
          style={[styles.changeBtn, { borderColor: colors.primaryGreen }]}
        >
          <Ionicons name="swap-horizontal" size={14} color={colors.primaryGreen} />
          <Text style={[styles.changeBtnText, { color: colors.primaryGreen }]}>
            Change
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarPhoto: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarText: { fontSize: 16, fontWeight: "900" },
  label: { fontSize: 10, fontWeight: "900", letterSpacing: 0.6 },
  name: { fontSize: 16, fontWeight: "900", marginTop: 2 },
  changeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  changeBtnText: { fontSize: 12, fontWeight: "800" },
});
