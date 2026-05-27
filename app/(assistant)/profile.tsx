import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/themeContext";

const themes = {
  dark: {
    bg: "#0b1220",
    cardBg: "rgba(30, 41, 59, 0.8)",
    textPrimary: "#ffffff",
    textSecondary: "#94a3b8",
    accent: "#38bdf8",
    border: "#1f2a44",
    danger: "#ef4444",
    dangerLight: "rgba(239, 68, 68, 0.1)",
    gradientStart: "#0a1628",
    gradientMid: "#1a2f4f",
    gradientEnd: "#0a1628",
  },
  light: {
    bg: "#f8fafc",
    cardBg: "rgba(255, 255, 255, 0.9)",
    textPrimary: "#0f172a",
    textSecondary: "#64748b",
    accent: "#262D68",
    border: "#e2e8f0",
    danger: "#ef4444",
    dangerLight: "rgba(239, 68, 68, 0.08)",
    gradientStart: "#262D68",
    gradientMid: "#3B4BA4",
    gradientEnd: "#262D68",
  },
};

function safeName(name?: string | null) {
  const n = (name ?? "").trim();
  return n.length ? n : "Assistant";
}

function getInitials(name?: string | null) {
  const n = safeName(name);
  const parts = n.split(" ").filter(Boolean);
  if (parts.length === 0) return "A";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export default function AssistantProfile() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { theme } = useTheme();
  const colors = themes[theme];

  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(30));

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const handleLogout = () => {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log Out",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/login");
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientMid, colors.gradientEnd]}
        style={styles.headerGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Section */}
        <Animated.View
          style={[
            styles.profileSection,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <View style={styles.avatarContainer}>
            <View style={styles.avatarRing}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{getInitials(user?.name)}</Text>
              </View>
            </View>
            <View style={styles.statusDot} />
          </View>

          <Text style={styles.name}>{safeName(user?.name)}</Text>
          <Text style={styles.role}>Assistant</Text>

          {user?.email && (
            <View style={styles.emailContainer}>
              <Ionicons name="mail-outline" size={14} color="#8fa3bf" />
              <Text style={styles.email}>{user.email}</Text>
            </View>
          )}
        </Animated.View>

        {/* Settings Card */}
        <Animated.View
          style={[
            styles.card,
            { backgroundColor: colors.cardBg },
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <View style={styles.sectionHeader}>
            <Ionicons name="settings-outline" size={18} color={colors.accent} />
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              Settings
            </Text>
          </View>

          <View
            style={[styles.settingItem, { borderBottomColor: colors.border }]}
          >
            <View style={styles.settingLeft}>
              <Ionicons
                name={theme === "dark" ? "moon" : "sunny"}
                size={20}
                color={colors.accent}
              />
              <Text style={[styles.settingText, { color: colors.textPrimary }]}>
                Theme
              </Text>
            </View>
            <ThemeToggle size="small" />
          </View>
        </Animated.View>

        {/* Account Card */}
        <Animated.View
          style={[
            styles.card,
            { backgroundColor: colors.cardBg },
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <View style={styles.sectionHeader}>
            <Ionicons name="person-outline" size={18} color={colors.accent} />
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              Account
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.settingItem, { borderBottomColor: "transparent" }]}
            onPress={handleLogout}
          >
            <View style={styles.settingLeft}>
              <Ionicons
                name="log-out-outline"
                size={20}
                color={colors.danger}
              />
              <Text style={[styles.settingText, { color: colors.danger }]}>
                Log Out
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.danger} />
          </TouchableOpacity>
        </Animated.View>

        <View style={styles.bottomPadding} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 280,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 60,
  },
  profileSection: {
    alignItems: "center",
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  avatarContainer: {
    position: "relative",
    marginBottom: 20,
  },
  avatarRing: {
    padding: 4,
    borderRadius: 70,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    borderWidth: 4,
    borderColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: 40,
    fontWeight: "700",
    color: "#ffffff",
  },
  statusDot: {
    position: "absolute",
    bottom: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#4ade80",
    borderWidth: 3,
    borderColor: "#ffffff",
  },
  name: {
    fontSize: 26,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  role: {
    fontSize: 15,
    color: "#b8c9e0",
    marginBottom: 12,
    fontWeight: "600",
  },
  emailContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  email: {
    fontSize: 14,
    color: "#8fa3bf",
    fontWeight: "500",
  },
  card: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  settingItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  settingLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  settingRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  settingText: {
    fontSize: 15,
    fontWeight: "600",
  },
  settingValue: {
    fontSize: 14,
    fontWeight: "500",
  },
  bottomPadding: {
    height: 40,
  },
});
