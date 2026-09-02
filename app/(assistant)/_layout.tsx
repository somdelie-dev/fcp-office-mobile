import { GradientBackground } from "@/components/GradientBackground";
import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LogoHeader } from "../../components/LogoHeader";
import { useTheme } from "../../lib/themeContext";
import AnimatedTabBar from "@/components/foreman/AnimatedTabBar";
import { fill3DTransitionSpec, forFill3D } from "@/components/foreman/tabSceneTransition";

const themes = {
  dark: {
    headerBg: "rgba(34, 197, 94, 0.15)",
    headerBorder: "rgba(34, 197, 94, 0.3)",
    tabBarBg: "rgba(11, 24, 38, 0.95)",
    tabActive: "#22c55e",
    tabInactive: "#64748b",
  },
  light: {
    headerBg: "rgba(34, 197, 94, 0.14)",
    headerBorder: "rgba(34, 197, 94, 0.35)",
    tabBarBg: "rgba(255, 255, 255, 0.95)",
    tabActive: "#16A34A",
    tabInactive: "#8a8a8a",
  },
};

function getTabBarMetrics(insets: { bottom: number }) {
  const baseHeight = Platform.OS === "ios" ? 60 : 56;
  const bottomPad = Math.max(insets.bottom, Platform.OS === "ios" ? 16 : 10);
  const height = baseHeight + bottomPad;
  return { baseHeight, bottomPad, height };
}

export default function AssistantTabs() {
  const { theme } = useTheme();
  const colors = themes[theme];
  const insets = useSafeAreaInsets();

  const { bottomPad, height } = getTabBarMetrics(insets);
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
          sceneStyle: {
            backgroundColor: "transparent",
          },

          tabBarShowLabel: true,
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: "700",
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
          name="history"
          options={{
            title: "History",
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={focused ? "time" : "time-outline"}
                size={size}
                color={color}
              />
            ),
          }}
        />

        <Tabs.Screen
          name="site-photo"
          options={{
            title: "Site Photo",
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={focused ? "camera" : "camera-outline"}
                size={size}
                color={color}
              />
            ),
          }}
        />

        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={focused ? "person" : "person-outline"}
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
