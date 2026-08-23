import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, TextStyle, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { useFaceTheme } from "./faceTheme";
import GlassPanel from "./GlassPanel";
import StatusChip from "./StatusChip";

export type ReferenceAngleKey = "front" | "left" | "right" | "smile" | "neutral";

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

const RING_SIZE = 88;
const RING_STROKE = 8;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function ProgressRing({
  progress,
  trackColor,
  fillColor,
  textStyle,
}: {
  progress: number;
  trackColor: string;
  fillColor: string;
  textStyle: TextStyle;
}) {
  const dashOffset = RING_CIRCUMFERENCE * (1 - progress);

  return (
    <View style={styles.ringWrap}>
      <Svg width={RING_SIZE} height={RING_SIZE}>
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke={trackColor}
          strokeWidth={RING_STROKE}
          fill="none"
        />
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke={fillColor}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
          strokeDashoffset={dashOffset}
          fill="none"
          rotation={-90}
          origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
        />
      </Svg>
      <View style={styles.ringLabel}>
        <Text style={[textStyle, styles.ringPercentText]}>{Math.round(progress * 100)}%</Text>
      </View>
    </View>
  );
}

function CheckIcon({ color }: { color: string }) {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 12.5L9.5 18L20 6"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function DotIcon({ color }: { color: string }) {
  return <View style={[styles.incompleteDot, { backgroundColor: color }]} />;
}

function CameraIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 8.5C4 7.4 4.9 6.5 6 6.5H8L9.2 4.5H14.8L16 6.5H18C19.1 6.5 20 7.4 20 8.5V17C20 18.1 19.1 19 18 19H6C4.9 19 4 18.1 4 17V8.5Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={12.5} r={3.4} stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}

/**
 * ReferencePhotosCard
 *
 * Glass panel showing reference-photo capture progress as a circular ring
 * plus a chip grid for each required angle (Front / Left / Right / Smile /
 * Neutral), each marked Complete or Incomplete. Ends in a full-width
 * capture CTA so a foreman can immediately fill any gaps.
 */
export default function ReferencePhotosCard({
  angles = DEFAULT_ANGLES,
  onCapturePress,
}: ReferencePhotosCardProps) {
  const { colors, typography, spacing } = useFaceTheme();

  const progress = useMemo(() => {
    const done = angles.filter((a) => a.complete).length;
    return angles.length === 0 ? 0 : done / angles.length;
  }, [angles]);

  const completedCount = angles.filter((a) => a.complete).length;

  return (
    <GlassPanel radius={5}>
      <View style={[styles.headerRow, { marginBottom: spacing.lg }]}>
        <View style={[styles.headerTextBlock, { paddingRight: spacing.md }]}>
          <Text style={typography.headline}>Reference Photos</Text>
          <Text style={[typography.caption, { marginTop: 2 }]}>
            {completedCount} of {angles.length} angles captured
          </Text>
        </View>
        <ProgressRing progress={progress} trackColor={colors.glassBorder} fillColor={colors.success} textStyle={typography.bodyStrong} />
      </View>

      <View style={[styles.chipGrid, { gap: spacing.xs, marginBottom: spacing.lg }]}>
        {angles.map((angle) => (
          <StatusChip
            key={angle.key}
            label={`${angle.label} · ${angle.complete ? "Complete" : "Incomplete"}`}
            tone={angle.complete ? "success" : "neutral"}
            icon={angle.complete ? <CheckIcon color={colors.success} /> : <DotIcon color={colors.textTertiary} />}
          />
        ))}
      </View>

      <Pressable
        onPress={onCapturePress}
        style={({ pressed }) => [
          styles.captureButton,
          { gap: spacing.xs, paddingVertical: spacing.sm + 2, borderRadius: 5, backgroundColor: colors.success },
          pressed && { opacity: 0.9 },
        ]}
      >
        <CameraIcon color={colors.textOnPrimary} />
        <Text style={[typography.bodyStrong, { color: colors.textOnPrimary }]}>Capture Reference Photo</Text>
      </Pressable>
    </GlassPanel>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTextBlock: {
    flex: 1,
  },
  ringWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  ringLabel: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  ringPercentText: {
    fontSize: 16,
  },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  incompleteDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  captureButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
});
