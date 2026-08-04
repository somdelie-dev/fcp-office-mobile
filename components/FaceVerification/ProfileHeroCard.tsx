import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";

type HeroCardProps = {
  name: string;
  code: string;
  photo?: string | null;
  active?: boolean;
  enrolled?: boolean;
};

export function HeroCard({
  name,
  code,
  photo,
  active = true,
  enrolled = false,
}: HeroCardProps) {
  return (
    <LinearGradient colors={["#111827", "#09131F"]} style={styles.card}>
      <View style={styles.photoWrapper}>
        <View style={styles.photoGlow} />

        {photo ? (
          <Image source={{ uri: photo }} style={styles.photo} />
        ) : (
          <View style={[styles.photo, styles.placeholder]}>
            <Text style={styles.placeholderText}>No Face{"\n"}Profile</Text>
          </View>
        )}
      </View>

      <Text style={styles.name}>{name}</Text>

      <Text style={styles.code}>{code}</Text>

      <View style={styles.chips}>
        <StatusChip color="#22C55E" label={active ? "Active" : "Inactive"} />

        <StatusChip
          color={enrolled ? "#3B82F6" : "#F59E0B"}
          label={enrolled ? "Face Ready" : "Not Enrolled"}
        />
      </View>
    </LinearGradient>
  );
}

function StatusChip({ color, label }: { color: string; label: string }) {
  return (
    <View
      style={[
        styles.chip,
        {
          borderColor: color,
          backgroundColor: `${color}20`,
        },
      ]}
    >
      <View
        style={[
          styles.dot,
          {
            backgroundColor: color,
          },
        ]}
      />

      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 28,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    marginBottom: 20,
  },

  photoWrapper: {
    width: 170,
    height: 170,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 18,
  },

  photoGlow: {
    position: "absolute",
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 3,
    borderColor: "#3B82F6",
    shadowColor: "#3B82F6",
    shadowOpacity: 0.8,
    shadowRadius: 20,
    shadowOffset: {
      width: 0,
      height: 0,
    },
  },

  photo: {
    width: 155,
    height: 155,
    borderRadius: 78,
  },

  placeholder: {
    backgroundColor: "#182433",
    justifyContent: "center",
    alignItems: "center",
  },

  placeholderText: {
    color: "#8FA2B7",
    fontWeight: "700",
    textAlign: "center",
  },

  name: {
    fontSize: 30,
    fontWeight: "800",
    color: "#fff",
    marginTop: 10,
  },

  code: {
    fontSize: 16,
    color: "#94A3B8",
    marginTop: 6,
    marginBottom: 22,
  },

  chips: {
    flexDirection: "row",
    gap: 12,
  },

  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
  },

  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },

  chipText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },
});
