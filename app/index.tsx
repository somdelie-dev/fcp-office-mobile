import { Redirect } from "expo-router";
import React from "react";
import { ActivityIndicator, View } from "react-native";

import { useAuth } from "../lib/auth";

export default function Index() {
  const { user, loading } = useAuth();

  // Show loading while checking auth state
  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#0b1220",
        }}
      >
        <ActivityIndicator size="large" color="#38bdf8" />
      </View>
    );
  }

  // Not logged in - go to login
  if (!user) {
    return <Redirect href="/login" />;
  }

  // Detect assistant (foreman with availableForemen)
  const isAssistant =
    user.role === "FOREMAN" && (user.availableForemen?.length ?? 0) > 0;

  if (isAssistant) {
    return <Redirect href="/(assistant)/home" />;
  }

  // Route by role
  switch (user.role) {
    case "FOREMAN":
      return <Redirect href="/(foreman)/home" />;
    case "SUPERVISOR":
      return <Redirect href="/(supervisor)/home" />;
    case "ASSISTANT":
      return <Redirect href="/(assistant)/home" />;
    case "ADMIN":
    default:
      return <Redirect href="/(admin)/home" />;
  }
}
