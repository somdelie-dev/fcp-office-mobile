import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useFaceTheme } from "./faceTheme";

export type ReferenceAngleKey =
  | "front"
  | "left"
  | "right"
  | "smile"
  | "neutral";

export interface ReferenceAngleState {
  key: ReferenceAngleKey;
  label: string;
  complete: boolean;
}

interface ReferencePhotosCardProps {
  angles?: ReferenceAngleState[];
  onCapturePress?: () => void;
}

const DEFAULT_ANGLES: ReferenceAngleState[] = [
  { key: "front", label: "Front", complete: true },
  { key: "left", label: "Left", complete: true },
  { key: "right", label: "Right", complete: true },
  { key: "smile", label: "Smile", complete: false },
  { key: "neutral", label: "Neutral", complete: false },
];

function CheckIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 12.5L10 17L19 7"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function CameraIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 8.5C4 7.4 4.9 6.5 6 6.5H8L9.2 4.5H14.8L16 6.5H18C19.1 6.5 20 7.4 20 8.5V17C20 18.1 19.1 19 18 19H6C4.9 19 4 18.1 4 17V8.5Z"
        stroke={color}
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={12.5} r={3.2} stroke={color} strokeWidth={1.7} />
    </Svg>
  );
}

export default function ReferencePhotosCard({
  angles = DEFAULT_ANGLES,
  onCapturePress,
}: ReferencePhotosCardProps) {
  const { colors, typography } = useFaceTheme();

  const completedCount = angles.filter((angle) => angle.complete).length;

  return (
    <View style={styles.container}>
      <View style={styles.headingRow}>
        <Text
          style={[
            typography.bodyStrong,
            {
              color: colors.textPrimary,
              fontSize: 14,
            },
          ]}
        >
          Reference photos
        </Text>

        <Text
          style={[
            typography.caption,
            {
              color: colors.textSecondary,
            },
          ]}
        >
          {completedCount} of {angles.length} complete
        </Text>
      </View>

      <View style={styles.grid}>
        {angles.map((angle) => (
          <View
            key={angle.key}
            style={[
              styles.photoTile,
              {
                borderColor: angle.complete
                  ? colors.success
                  : colors.glassBorder,
                backgroundColor: angle.complete
                  ? "rgba(0, 80, 0, 0.28)"
                  : "rgba(255,255,255,0.015)",
              },
              !angle.complete && styles.incompleteTile,
            ]}
          >
            <View style={styles.icon}>
              {angle.complete ? (
                <CheckIcon color={colors.success} />
              ) : (
                <CameraIcon color={colors.textTertiary} />
              )}
            </View>

            <Text
              style={[
                typography.caption,
                {
                  color: angle.complete ? colors.success : colors.textSecondary,
                  fontSize: 12,
                  marginTop: 4,
                },
              ]}
            >
              {angle.label}
            </Text>
          </View>
        ))}
      </View>

      <Pressable
        onPress={onCapturePress}
        style={({ pressed }) => [
          styles.captureButton,
          {
            borderColor: colors.glassBorder,
            backgroundColor: colors.glassFill,
          },
          pressed && {
            opacity: 0.75,
          },
        ]}
      >
        <CameraIcon color={colors.textPrimary} />

        <Text
          style={[
            typography.bodyStrong,
            {
              color: colors.textPrimary,
              fontSize: 14,
              marginLeft: 8,
            },
          ]}
        >
          Capture reference photos
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },

  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 8,
  },

  photoTile: {
    width: "48.5%",
    height: 62,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  incompleteTile: {
    borderStyle: "dashed",
  },

  icon: {
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },

  captureButton: {
    height: 37,
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
});
