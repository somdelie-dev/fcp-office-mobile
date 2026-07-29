import { LogoHeader } from "@/components/LogoHeader";
import { SyncQueueIcon } from "@/components/OfflineStatus";
import { Stack } from "expo-router";

export default function ForemanStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerTitle: () => <LogoHeader />,
        headerShadowVisible: true,
        headerStyle: {
          // oklch(20.8% 0.042 265.755)
          backgroundColor: "rgba(99, 144, 251, 0.48)",
        },
        headerRight: () => <SyncQueueIcon />,
      }}
    />
  );
}
