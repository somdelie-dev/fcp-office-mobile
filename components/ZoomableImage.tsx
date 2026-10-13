import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const AnimatedImage = Animated.createAnimatedComponent(Image);

// Full-size site photos travel through the API server, so a slow link can
// stall indefinitely; give up and offer a retry instead of spinning forever.
const LOAD_TIMEOUT_MS = 30000;

interface ZoomableImageProps {
  uri: string;
  width: number;
  height: number;
  borderRadius?: number;
  minScale?: number;
  maxScale?: number;
}

/**
 * Pinch-to-zoom + pan image component.
 * Double-tap resets to original scale.
 */
export function ZoomableImage({
  uri,
  width,
  height,
  borderRadius = 12,
  minScale = 1,
  maxScale = 5,
}: ZoomableImageProps) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setStatus("loading");
    const t = setTimeout(
      () => setStatus((s) => (s === "loading" ? "error" : s)),
      LOAD_TIMEOUT_MS,
    );
    return () => clearTimeout(t);
  }, [uri, attempt]);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      const newScale = savedScale.value * e.scale;
      scale.value = Math.min(Math.max(newScale, minScale), maxScale);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value < 1) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
    });

  const panGesture = Gesture.Pan()
    .minDistance(5)
    .onUpdate((e) => {
      if (scale.value > 1) {
        translateX.value = savedTranslateX.value + e.translationX;
        translateY.value = savedTranslateY.value + e.translationY;
      }
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        // Reset
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        // Zoom to 2.5x
        scale.value = withTiming(2.5);
        savedScale.value = 2.5;
      }
    });

  const composed = Gesture.Simultaneous(pinchGesture, panGesture, doubleTap);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <View style={{ width, height, overflow: "hidden", borderRadius }}>
      <GestureDetector gesture={composed}>
        <AnimatedImage
          key={`${uri}#${attempt}`}
          source={{ uri }}
          style={[
            { width, height, borderRadius, opacity: status === "loaded" ? 1 : 0 } as ImageStyle,
            animatedStyle,
          ]}
          resizeMode="contain"
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
        />
      </GestureDetector>

      {status !== "loaded" && (
        <View
          style={[StyleSheet.absoluteFill, styles.overlay]}
          pointerEvents={status === "error" ? "auto" : "none"}
        >
          {status === "error" ? (
            <Pressable
              onPress={() => setAttempt((a) => a + 1)}
              style={styles.retry}
            >
              <Ionicons name="refresh" size={28} color="#fff" />
              <Text style={styles.retryText}>
                Couldn't load photo. Tap to retry.
              </Text>
            </Pressable>
          ) : (
            <ActivityIndicator size="large" color="#fff" />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  retry: {
    alignItems: "center",
    gap: 8,
    padding: 16,
  },
  retryText: {
    color: "#fff",
    fontSize: 14,
    textAlign: "center",
  },
});
