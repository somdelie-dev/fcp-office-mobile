import React from "react";
import { StyleSheet, View } from "react-native";

/**
 * Professional face-scanner frame used by the Foreman clock-out scanner.
 * Decorative only: it does not track a detected face's actual position.
 */
export default function CornerBrackets({
  size,
  color,
}: {
  size: number;
  color: string;
}) {
  const len = Math.max(30, size * 0.18);
  const inset = Math.max(5, size * 0.035);
  const stroke = size >= 220 ? 4 : 3;
  const radius = Math.min(22, size * 0.075);

  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFillObject, styles.container]}
    >
      <View
        style={[
          styles.frame,
          {
            width: size + inset * 2,
            height: size + inset * 2,
            borderRadius: radius + inset,
          },
        ]}
      >
        <View
          style={[
            styles.corner,
            {
              top: 0,
              left: 0,
              width: len,
              height: len,
              borderTopWidth: stroke,
              borderLeftWidth: stroke,
              borderColor: color,
              borderTopLeftRadius: radius,
            },
          ]}
        />
        <View
          style={[
            styles.corner,
            {
              top: 0,
              right: 0,
              width: len,
              height: len,
              borderTopWidth: stroke,
              borderRightWidth: stroke,
              borderColor: color,
              borderTopRightRadius: radius,
            },
          ]}
        />
        <View
          style={[
            styles.corner,
            {
              bottom: 0,
              left: 0,
              width: len,
              height: len,
              borderBottomWidth: stroke,
              borderLeftWidth: stroke,
              borderColor: color,
              borderBottomLeftRadius: radius,
            },
          ]}
        />
        <View
          style={[
            styles.corner,
            {
              bottom: 0,
              right: 0,
              width: len,
              height: len,
              borderBottomWidth: stroke,
              borderRightWidth: stroke,
              borderColor: color,
              borderBottomRightRadius: radius,
            },
          ]}
        />

        {/* Small centre target keeps the frame visually anchored without
            pretending to be a live face-tracking box. */}
        <View style={[styles.target, { borderColor: `${color}55` }]}>
          <View style={[styles.targetDot, { backgroundColor: color }]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  frame: {
    position: "relative",
  },
  corner: {
    position: "absolute",
  },
  target: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 24,
    height: 24,
    marginLeft: -12,
    marginTop: -12,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  targetDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});
