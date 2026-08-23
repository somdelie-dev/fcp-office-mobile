import { Ionicons } from "@expo/vector-icons";
import * as Application from "expo-application";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassCard } from "@/components/GlassCard";
import { downloadAndLaunchInstaller } from "@/lib/appInstaller";
import { useAuth } from "@/lib/auth";
import { cacheClearAll } from "@/lib/mobileCache";
import { useTheme } from "@/lib/themeContext";
import { checkForUpdate } from "@/lib/updateCheck";

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuth();
  const isDark = theme === "dark";

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [clearingCache, setClearingCache] = useState(false);
  const [checkingForUpdate, setCheckingForUpdate] = useState(false);

  const colors = {
    bg: isDark ? "#0f172a" : "#f8fafc",
    text: isDark ? "#f1f5f9" : "#0f172a",
    textMuted: isDark ? "#94a3b8" : "#64748b",
    cardBg: isDark ? "rgba(30, 41, 59, 0.8)" : "rgba(255,255,255,0.9)",
    border: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)",
    accent: isDark ? "#22c55e" : "#16A34A",
    danger: "#ef4444",
    success: "#22c55e",
  };

  const handleClearCache = async () => {
    Alert.alert(
      "Clear Cache",
      "This will clear all cached data. You may need to reload some data after this. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            setClearingCache(true);
            try {
              await cacheClearAll();
              Alert.alert("Success", "Cache cleared successfully");
            } catch (e) {
              Alert.alert("Error", "Failed to clear cache");
            } finally {
              setClearingCache(false);
            }
          },
        },
      ],
    );
  };

  const appVersion = Application.nativeApplicationVersion ?? "1.0.0";
  const buildNumber = Application.nativeBuildVersion ?? "1";

  const handleCheckForUpdate = async () => {
    if (Platform.OS !== "android") {
      Alert.alert("Not Available", "Updates are only distributed for Android.");
      return;
    }
    setCheckingForUpdate(true);
    try {
      const result = await checkForUpdate({ force: true });
      if (result.status === "none") {
        Alert.alert("Up to Date", "You're running the latest version of FirstClass.");
        return;
      }
      Alert.alert(
        "Update Available",
        `Version ${result.release.version} is available.${
          result.release.releaseNotes.length
            ? `\n\n${result.release.releaseNotes.map((n) => `• ${n}`).join("\n")}`
            : ""
        }`,
        [
          { text: "Later", style: "cancel" },
          {
            text: "Update Now",
            onPress: async () => {
              try {
                await downloadAndLaunchInstaller();
              } catch (e: any) {
                Alert.alert(
                  "Update Failed",
                  e?.message ?? "Couldn't download the update. Please try again.",
                );
              }
            },
          },
        ],
      );
    } catch {
      Alert.alert("Check Failed", "Couldn't reach the update server. Try again later.");
    } finally {
      setCheckingForUpdate(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.bg }]}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + 24 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Customize your app experience
        </Text>
      </View>

      {/* Appearance */}
      <GlassCard style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Appearance
        </Text>

        <SettingRow
          icon="moon-outline"
          label="Dark Mode"
          description="Use dark theme for the app"
          colors={colors}
        >
          <Switch
            value={isDark}
            onValueChange={toggleTheme}
            trackColor={{ false: "#767577", true: colors.accent }}
            thumbColor={isDark ? "#fff" : "#f4f3f4"}
          />
        </SettingRow>
      </GlassCard>

      {/* Notifications */}
      <GlassCard style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Notifications
        </Text>

        <SettingRow
          icon="notifications-outline"
          label="Push Notifications"
          description="Receive push notifications"
          colors={colors}
        >
          <Switch
            value={notificationsEnabled}
            onValueChange={setNotificationsEnabled}
            trackColor={{ false: "#767577", true: colors.accent }}
            thumbColor={notificationsEnabled ? "#fff" : "#f4f3f4"}
          />
        </SettingRow>

        <SettingRow
          icon="volume-high-outline"
          label="Sound"
          description="Play sound for notifications"
          colors={colors}
          border
        >
          <Switch
            value={soundEnabled}
            onValueChange={setSoundEnabled}
            trackColor={{ false: "#767577", true: colors.accent }}
            thumbColor={soundEnabled ? "#fff" : "#f4f3f4"}
            disabled={!notificationsEnabled}
          />
        </SettingRow>

        <SettingRow
          icon="phone-portrait-outline"
          label="Vibration"
          description="Vibrate for notifications"
          colors={colors}
          border
          last
        >
          <Switch
            value={vibrationEnabled}
            onValueChange={setVibrationEnabled}
            trackColor={{ false: "#767577", true: colors.accent }}
            thumbColor={vibrationEnabled ? "#fff" : "#f4f3f4"}
            disabled={!notificationsEnabled}
          />
        </SettingRow>
      </GlassCard>

      {/* Data & Storage */}
      <GlassCard style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Data & Storage
        </Text>

        <Pressable onPress={handleClearCache} disabled={clearingCache}>
          <SettingRow
            icon="trash-outline"
            label="Clear Cache"
            description="Free up storage space"
            colors={colors}
            danger
            last
          >
            <Ionicons
              name="chevron-forward"
              size={20}
              color={colors.textMuted}
            />
          </SettingRow>
        </Pressable>
      </GlassCard>

      {/* Account */}
      <GlassCard style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Account
        </Text>

        <SettingRow
          icon="person-outline"
          label={user?.name ?? "User"}
          description={user?.email ?? ""}
          colors={colors}
          last
        >
          <View
            style={[
              styles.roleBadge,
              { backgroundColor: colors.accent + "20" },
            ]}
          >
            <Text style={[styles.roleBadgeText, { color: colors.accent }]}>
              {user?.role ?? "USER"}
            </Text>
          </View>
        </SettingRow>
      </GlassCard>

      {/* About */}
      <GlassCard style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>About</Text>

        <SettingRow
          icon="information-circle-outline"
          label="Version"
          description={`v${appVersion} (${buildNumber})`}
          colors={colors}
        >
          <Text style={[styles.versionText, { color: colors.textMuted }]}>
            {Platform.OS === "ios" ? "iOS" : "Android"}
          </Text>
        </SettingRow>

        {Platform.OS === "android" && (
          <Pressable onPress={handleCheckForUpdate} disabled={checkingForUpdate}>
            <SettingRow
              icon="cloud-download-outline"
              label="Check for Updates"
              description={
                checkingForUpdate ? "Checking…" : "See if a newer version is available"
              }
              colors={colors}
              border
            >
              <Ionicons
                name="chevron-forward"
                size={20}
                color={colors.textMuted}
              />
            </SettingRow>
          </Pressable>
        )}

        <Pressable onPress={() => router.push("/(foreman-stack)/help")}>
          <SettingRow
            icon="help-circle-outline"
            label="Help & Support"
            description="Get help using the app"
            colors={colors}
            border
            last
          >
            <Ionicons
              name="chevron-forward"
              size={20}
              color={colors.textMuted}
            />
          </SettingRow>
        </Pressable>
      </GlassCard>
    </ScrollView>
  );
}

type SettingRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description: string;
  colors: any;
  children?: React.ReactNode;
  border?: boolean;
  last?: boolean;
  danger?: boolean;
};

function SettingRow({
  icon,
  label,
  description,
  colors,
  children,
  border,
  last,
  danger,
}: SettingRowProps) {
  return (
    <View
      style={[
        styles.settingRow,
        border && { borderTopWidth: 1, borderTopColor: colors.border },
        last && { borderBottomWidth: 0 },
      ]}
    >
      <View
        style={[
          styles.iconContainer,
          {
            backgroundColor: danger
              ? colors.danger + "15"
              : colors.accent + "15",
          },
        ]}
      >
        <Ionicons
          name={icon}
          size={20}
          color={danger ? colors.danger : colors.accent}
        />
      </View>
      <View style={styles.settingContent}>
        <Text
          style={[
            styles.settingLabel,
            { color: danger ? colors.danger : colors.text },
          ]}
        >
          {label}
        </Text>
        <Text style={[styles.settingDescription, { color: colors.textMuted }]}>
          {description}
        </Text>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  header: {
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 12,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  settingContent: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: "700",
  },
  settingDescription: {
    fontSize: 12,
    marginTop: 2,
  },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: "800",
  },
  versionText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
