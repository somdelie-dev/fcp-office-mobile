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
        // headerRight: () => <SyncQueueIcon />,
      }}
    >
      {/* `presentation` reconfigures how the navigator mounts a screen, so it
          has to be declared statically here — setting it dynamically from
          inside the screen itself (via a rendered <Stack.Screen options={...}/>)
          makes the navigator think the screen's config changed on every
          render, which remounts it in a loop (looks like open/close/open/close). */}
      <Stack.Screen
        name="workers/[id]/capture-reference"
        options={{ presentation: "modal" }}
      />
    </Stack>
  );
}
