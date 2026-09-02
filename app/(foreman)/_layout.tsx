import { GradientBackground } from "@/components/GradientBackground";
import AnimatedTabBar from "@/components/foreman/AnimatedTabBar";
import { fill3DTransitionSpec, forFill3D } from "@/components/foreman/tabSceneTransition";
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
          sceneStyleInterpolator: forFill3D,
          transitionSpec: fill3DTransitionSpec,
          header: () => <LogoHeader />,
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
        <Tabs.Screen name="tutorial" options={{ title: "Tutorial" }} />
      </Tabs>
    </GradientBackground>
  );
}
