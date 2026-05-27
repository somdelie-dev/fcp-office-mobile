import { GradientBackground } from "@/components/GradientBackground";
import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LogoHeader } from "../../components/LogoHeader";
import { useTheme } from "../../lib/themeContext";

const themes = {
  dark: {
    headerBg: "rgba(56, 189, 248, 0.15)",
    headerBorder: "rgba(56, 189, 248, 0.3)",
    tabBarBg: "rgba(15, 23, 42, 0.95)",
    tabActive: "#38bdf8",
    tabInactive: "#64748b",
  },
  light: {
    headerBg: "rgba(99, 144, 251, 0.48)",
    headerBorder: "rgba(99, 144, 251, 0.48)",
    tabBarBg: "rgba(255, 255, 255, 0.95)",
    tabActive: "#262D68",
    tabInactive: "#8a8a8a",
  },
} as const;

function getTabBarMetrics(insets: { bottom: number }) {
  // 56 is the typical nav tab "base" height on Android.
  // iOS often wants a bit more vertical space.
  const baseHeight = Platform.OS === "ios" ? 60 : 56;

  // This is the key: ALWAYS respect bottom inset, but never let it be too small.
  const bottomPad = Math.max(insets.bottom, Platform.OS === "ios" ? 16 : 10);

  // Total height = base + bottom safe area pad
  const height = baseHeight + bottomPad;

  return { baseHeight, bottomPad, height };
}

export default function ForemanTabs() {
  const { theme } = useTheme();
  const colors = themes[theme];
  const insets = useSafeAreaInsets();

  const { bottomPad, height } = getTabBarMetrics(insets);

  return (
    <GradientBackground>
      <Tabs
        screenOptions={{
          headerTitle: () => <LogoHeader />,
          headerShadowVisible: true,
          headerStyle: {
            backgroundColor: colors.headerBg,
            borderBottomWidth: 2,
            borderBottomColor: colors.headerBorder,
          },

          tabBarShowLabel: true,
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: "700",
            // ✅ Don’t manually shove labels down; it breaks on some Androids
            marginBottom: 0,
          },

          tabBarActiveTintColor: colors.tabActive,
          tabBarInactiveTintColor: colors.tabInactive,

          tabBarStyle: {
            height,
            paddingBottom: bottomPad,
            paddingTop: 6,
            borderTopWidth: 0,
            backgroundColor: colors.tabBarBg,

            shadowColor: "#000",
            shadowOpacity: 0.08,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: -6 },
            elevation: 18,
          },
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: "Home",
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={focused ? "home" : "home-outline"}
                size={size}
                color={color}
              />
            ),
          }}
        />

        <Tabs.Screen
          name="scan"
          options={{
            title: "Scan",
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={focused ? "qr-code" : "qr-code-outline"}
                size={size + 2}
                color={color}
              />
            ),
          }}
        />

        <Tabs.Screen
          name="history"
          options={{
            title: "Photos",
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={focused ? "images" : "images-outline"}
                size={size}
                color={color}
              />
            ),
          }}
        />

        <Tabs.Screen
          name="workers"
          options={{
            title: "My Crew",
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={focused ? "people" : "people-outline"}
                size={size}
                color={color}
              />
            ),
          }}
        />

        <Tabs.Screen
          name="timesheets"
          options={{
            title: "Timesheets",
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={focused ? "document-text" : "document-text-outline"}
                size={size}
                color={color}
              />
            ),
          }}
        />
      </Tabs>
    </GradientBackground>
  );
}
