import { GradientBackground } from "@/components/GradientBackground";
import { SyncQueueIcon } from "@/components/OfflineStatus";
import AnimatedTabBar from "@/components/foreman/AnimatedTabBar";
import { Tabs } from "expo-router";
import React from "react";
import { LogoHeader } from "../../components/LogoHeader";
import { useTheme } from "../../lib/themeContext";

const themes = {
  dark: {
    headerBg: "rgba(34, 197, 94, 0.15)",
    headerBorder: "rgba(34, 197, 94, 0.3)",
  },
  light: {
    headerBg: "rgba(34, 197, 94, 0.14)",
    headerBorder: "rgba(34, 197, 94, 0.35)",
  },
} as const;

export default function ForemanTabs() {
  const { theme } = useTheme();
  const colors = themes[theme];

  return (
    <GradientBackground>
      <Tabs
        tabBar={(props) => <AnimatedTabBar {...props} />}
        screenOptions={{
          headerTitle: () => <LogoHeader />,
          headerRight: () => <SyncQueueIcon />,
          headerShadowVisible: true,
          headerStyle: {
            backgroundColor: colors.headerBg,
            borderBottomWidth: 2,
            borderBottomColor: colors.headerBorder,
          },
        }}
      >
        <Tabs.Screen name="home" options={{ title: "Home" }} />
        <Tabs.Screen name="scan" options={{ title: "Scan" }} />
        <Tabs.Screen name="scan-outs" options={{ title: "Scan Outs" }} />
        <Tabs.Screen name="workers" options={{ title: "Team" }} />
        <Tabs.Screen name="timesheets" options={{ title: "AT Sheets" }} />
      </Tabs>
    </GradientBackground>
  );
}
