import React from "react";
import { View } from "react-native";
import Svg, { Path } from "react-native-svg";

export default function WaveHeader({
  color = "#0A1931",
  height = 120,
  style,
}: {
  color?: string;
  height?: number;
  style?: any;
}) {
  return (
    <View style={[{ width: "100%", height }, style]}>
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 360 120"
        preserveAspectRatio="none"
      >
        <Path d="M0,0 Q180,120 360,0 L360,120 L0,120 Z" fill={color} />
      </Svg>
    </View>
  );
}
