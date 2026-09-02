import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useFaceTheme } from "./faceTheme";
import StatusChip, { StatusChipTone } from "./StatusChip";

interface IdentityStatusCardProps {
  faceProfileComplete?: boolean;
  verificationStatus?: "verified" | "pending" | "failed" | "missing";
  workerStatus?: "active" | "inactive";
}

function ScanIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 8V6C4 4.9 4.9 4 6 4H8M16 4H18C19.1 4 20 4.9 20 6V8M20 16V18C20 19.1 19.1 20 18 20H16M8 20H6C4.9 20 4 19.1 4 18V16"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <Circle cx={12} cy={12} r={3.2} stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}

function WorkerStatusIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={8} r={3} stroke={color} strokeWidth={1.8} />
      <Path
        d="M5 19C5.8 15.7 8.1 14 12 14C15.9 14 18.2 15.7 19 19"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <Path
        d="M18 4.5L19 5.5L21 3.5"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const VERIFICATION_COPY: Record<
  NonNullable<IdentityStatusCardProps["verificationStatus"]>,
  {
    label: string;
    tone: StatusChipTone;
  }
> = {
  verified: {
    label: "Verified",
    tone: "success",
  },
  pending: {
    label: "Pending",
    tone: "warning",
  },
  failed: {
    label: "Failed",
    tone: "danger",
  },
  missing: {
    label: "Missing",
    tone: "danger",
  },
};

export default function IdentityStatusCard({
  verificationStatus = "pending",
  workerStatus = "active",
}: IdentityStatusCardProps) {
  const { colors, typography } = useFaceTheme();

  const verification = VERIFICATION_COPY[verificationStatus];

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.glassFill,
          borderColor: colors.glassBorder,
        },
      ]}
    >
      <View style={styles.row}>
        <View style={styles.left}>
          <ScanIcon color={colors.textSecondary} />

          <Text
            style={[
              typography.bodyStrong,
              {
                color: colors.textPrimary,
                marginLeft: 10,
              },
            ]}
          >
            Face verification
          </Text>
        </View>

        <StatusChip label={verification.label} tone={verification.tone} />
      </View>

      <View
        style={[
          styles.divider,
          {
            backgroundColor: colors.glassBorder,
          },
        ]}
      />

      <View style={styles.row}>
        <View style={styles.left}>
          <WorkerStatusIcon color={colors.textSecondary} />

          <Text
            style={[
              typography.bodyStrong,
              {
                color: colors.textPrimary,
                marginLeft: 10,
              },
            ]}
          >
            Team status
          </Text>
        </View>

        <StatusChip
          label={workerStatus === "active" ? "Active" : "Inactive"}
          tone={workerStatus === "active" ? "success" : "neutral"}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
    paddingHorizontal: 14,
    paddingTop: 14,
    gap: 10,
  },

  row: {
    minHeight: 43,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  left: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },

  divider: {
    height: 1,
    width: "100%",
  },
});
