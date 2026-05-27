import { LogoHeader } from "@/components/LogoHeader";
import { Stack } from "expo-router";

export default function AdminStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerTitle: () => <LogoHeader />,
        headerShadowVisible: true,
        headerStyle: {
          // Match supervisor/foreman stack header styling
          backgroundColor: "rgba(99, 144, 251, 0.48)",
        },
      }}
    />
  );
}
