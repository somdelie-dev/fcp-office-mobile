import React, { useEffect, useState } from "react";
import { Animated, Platform, StyleSheet, Text, View } from "react-native";

import { setNetworkStatus } from "./offline/networkStatus";

// Dynamically import NetInfo to handle missing native module
let NetInfo: typeof import("@react-native-community/netinfo").default | null =
  null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  NetInfo = require("@react-native-community/netinfo").default;
} catch {
  console.warn("NetInfo native module not available - assuming online");
}

/**
 * Hook to monitor network connectivity
 */
export function useNetworkStatus() {
  const [isConnected, setIsConnected] = useState(true);
  const [isInternetReachable, setIsInternetReachable] = useState<
    boolean | null
  >(true);

  useEffect(() => {
    // If NetInfo isn't available, assume online
    if (!NetInfo) {
      setNetworkStatus("online", true);
      return;
    }

    // Initial fetch
    NetInfo.fetch()
      .then((state) => {
        const connected = state.isConnected ?? true;
        const reachable = state.isInternetReachable ?? true;
        setIsConnected(connected);
        setIsInternetReachable(reachable);
        setNetworkStatus(
          connected && reachable ? "online" : "offline",
          connected && !!reachable,
        );
      })
      .catch(() => {
        // Assume online on error
        setNetworkStatus("online", true);
      });

    // Subscribe to changes
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = state.isConnected ?? true;
      const reachable = state.isInternetReachable ?? true;
      setIsConnected(connected);
      setIsInternetReachable(reachable);
      setNetworkStatus(
        connected && reachable ? "online" : "offline",
        connected && !!reachable,
      );
    });

    return () => unsubscribe();
  }, []);

  const isOnline =
    isConnected &&
    (isInternetReachable === true || isInternetReachable === null);

  return {
    isConnected,
    isInternetReachable,
    isOnline,
  };
}

/**
 * Offline indicator banner component
 * Shows "Offline - Showing cached data" when device is offline
 */
export function OfflineBanner() {
  const { isOnline } = useNetworkStatus();
  const [visible, setVisible] = useState(false);
  const slideAnim = useState(() => new Animated.Value(-50))[0];

  useEffect(() => {
    if (!isOnline) {
      setVisible(true);
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 100,
        friction: 10,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: -50,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        setVisible(false);
      });
    }
  }, [isOnline, slideAnim]);

  if (!visible && isOnline) return null;

  return (
    <Animated.View
      style={[
        styles.banner,
        {
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <View style={styles.dot} />
      <Text style={styles.text}>Offline · Showing cached data</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    top: Platform.OS === "ios" ? 50 : 30,
    left: 16,
    right: 16,
    backgroundColor: "rgba(220, 38, 38, 0.95)",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#fef2f2",
    marginRight: 8,
  },
  text: {
    color: "#fef2f2",
    fontWeight: "700",
    fontSize: 13,
  },
});
