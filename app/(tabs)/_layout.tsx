import { Tabs } from "expo-router";
import React from "react";
import { useAuth } from "../../lib/auth";

export default function MainLayout() {
  const { user } = useAuth();

  if (!user) {
    // Not logged in, show nothing (or a fallback if you want)
    return null;
  }

  const role = (user.role ?? "").trim().toUpperCase();

  if (role === "ADMIN") {
    return (
      <Tabs>
        <Tabs.Screen name="(admin)/sites" options={{ title: "Sites" }} />
        <Tabs.Screen name="(admin)/home" options={{ title: "Home" }} />
        <Tabs.Screen name="(admin)/workers" options={{ title: "Team" }} />
        <Tabs.Screen
          name="(admin)/timesheets"
          options={{ title: "Timesheets" }}
        />
        <Tabs.Screen name="(admin)/foremen" options={{ title: "Foremen" }} />
      </Tabs>
    );
  }
  if (role === "SUPERVISOR") {
    return (
      <Tabs>
        <Tabs.Screen name="(supervisor)/home" options={{ title: "Home" }} />
        <Tabs.Screen
          name="(supervisor)/approvals"
          options={{ title: "Approvals" }}
        />
        <Tabs.Screen
          name="(supervisor)/reports"
          options={{ title: "Reports" }}
        />
      </Tabs>
    );
  }
  // Default to foreman
  return (
    <Tabs>
      <Tabs.Screen name="(foreman)/home" options={{ title: "Home" }} />
      <Tabs.Screen name="(foreman)/scan" options={{ title: "Scan" }} />
    </Tabs>
  );
}
