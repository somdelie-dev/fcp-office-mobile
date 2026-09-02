import { LogoHeader } from "@/components/LogoHeader";
import { Stack } from "expo-router";

export default function SupervisorStackLayout() {
  return (
    <Stack
      screenOptions={{
        header: () => <LogoHeader />,
        headerShadowVisible: true,
        headerStyle: {
          // oklch(20.8% 0.042 265.755)
          backgroundColor: "rgba(99, 144, 251, 0.48)",
        },
      }}
    />
  );
}
