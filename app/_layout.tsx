import { Redirect, Stack, useRouter } from "expo-router";
import React, { useEffect } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { OfflineBanner } from "../components/OfflineStatus";
import { UpdateGate } from "../components/UpdateGate";
import { AuthProvider, useAuth } from "../lib/auth";
import { DataCacheProvider } from "../lib/dataCache";
import { NetworkStatusListener } from "../lib/networkMonitor";
import { setupNotificationListeners } from "../lib/push";
import { ThemeProvider } from "../lib/themeContext";

function Gate() {
  const { user } = useAuth();

  if (!user) return <Redirect href="/login" />;

  // Detect assistant even if role === FOREMAN
  const role = (user.role ?? "").trim().toUpperCase();

  const isAssistant =
    role === "FOREMAN" && (user.availableForemen?.length ?? 0) > 0;

  if (isAssistant) return <Redirect href="/(assistant)/home" />;

  if (role === "FOREMAN") return <Redirect href="/(foreman)/home" />;
  if (role === "SUPERVISOR") return <Redirect href="/(supervisor)/home" />;
  if (role === "ASSISTANT") return <Redirect href="/(assistant)/home" />;

  return <Redirect href="/(admin)/home" />;
}

function NotificationNavigator() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!user) return;
    if (Platform.OS === "web") return;

    const cleanup = setupNotificationListeners((data: any) => {
      if (!data || typeof data !== "object") return;

      // Handle photo request notification tap
      if (data.type === "PHOTO_REQUEST") {
        const requestId = (data as any).requestId ?? "";
        const siteId = (data as any).siteId ?? "";
        const dateISO = (data as any).dateISO ?? "";

        router.push({
          pathname: "/(foreman-stack)/SiteDayPhotoScreen",
          params: { requestId, siteId, dateISO },
        });
      }

      // Handle photo rejected notification tap → open notifications list
      if (data.type === "PHOTO_REJECTED") {
        router.push("/(foreman-stack)/notifications");
      }

      // Handle timesheet workflow notification taps
      if (data.type === "TIMESHEET_SUBMITTED") {
        router.push("/(supervisor)/timesheets");
      }

      if (data.type === "TIMESHEET_REJECTED") {
        router.push("/(foreman)/timesheets");
      }

      if (data.type === "TIMESHEET_APPROVED") {
        router.push("/(foreman)/timesheets");
      }

      // Handle site day photo reminder notification tap (scheduled at midnight)
      if (data.type === "site-day-photo-reminder") {
        router.push({
          pathname: "/(foreman-stack)/SiteDayPhotoScreen",
        });
      }
    });

    return cleanup;
  }, [user, router]);

  return null;
}

export default function RootLayout() {
  const showOfflineBanner = Platform.OS !== "web";

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <DataCacheProvider>
              <NotificationNavigator />
              <NetworkStatusListener />
              <UpdateGate />
              {showOfflineBanner ? <OfflineBanner /> : null}

              <Stack
                screenOptions={{
                  headerShown: false,
                  headerStyle: { backgroundColor: "#334155" },
                  headerTitle: "",
                  headerShadowVisible: false,
                }}
              >
                {/* Gate is the default route controller */}
                <Stack.Screen name="index" options={{ headerShown: false }} />

                {/* Public */}
                <Stack.Screen
                  name="login"
                  options={{ gestureEnabled: false, animation: "fade" }}
                />

                {/* Role stacks */}
                <Stack.Screen name="(foreman)" />
                <Stack.Screen name="(supervisor)" />
                <Stack.Screen name="(admin)" />
                <Stack.Screen name="(admin-stack)" />
                <Stack.Screen name="(assistant)" />
              </Stack>
            </DataCacheProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
