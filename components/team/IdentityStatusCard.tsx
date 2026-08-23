import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { useFaceTheme } from "./faceTheme";
import GlassPanel from "./GlassPanel";
import StatusChip, { StatusChipTone } from "./StatusChip";

interface StatusRowData {
  key: string;
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: StatusChipTone;
}

interface IdentityStatusCardProps {
  faceProfileComplete?: boolean;
  verificationStatus?: "verified" | "pending" | "failed";
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

function CheckBadgeIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={8.5} stroke={color} strokeWidth={1.8} />
      <Path
        d="M8.7 12.2L10.8 14.3L15.3 9.7"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function PulseIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 12H7L9.5 6L14 18L16.5 12H21"
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
  { label: string; tone: StatusChipTone }
> = {
  verified: { label: "Verified", tone: "success" },
  pending: { label: "Pending", tone: "warning" },
  failed: { label: "Failed", tone: "danger" },
};

/**
 * IdentityStatusCard
 *
 * Glass panel summarizing the three core biometric facts a foreman needs
 * at a glance: whether the face profile is captured, the current
 * verification state, and whether the worker record itself is active.
 * Rendered as icon + label + status chip rows — never a table.
 */
export default function IdentityStatusCard({
  faceProfileComplete = true,
  verificationStatus = "verified",
  workerStatus = "active",
}: IdentityStatusCardProps) {
  const { colors, typography, spacing } = useFaceTheme();
  const verification = VERIFICATION_COPY[verificationStatus];

  const rows: StatusRowData[] = [
    {
      key: "profile",
      icon: <ScanIcon color={colors.primary} />,
      label: "Face Profile",
      value: faceProfileComplete ? "Complete" : "Incomplete",
      tone: faceProfileComplete ? "success" : "warning",
    },
    {
      key: "verification",
      icon: <CheckBadgeIcon color={colors.secondary} />,
      label: "Verification",
      value: verification.label,
      tone: verification.tone,
    },
    {
      key: "status",
      icon: <PulseIcon color={colors.success} />,
      label: "Status",
      value: workerStatus === "active" ? "Active" : "Inactive",
      tone: workerStatus === "active" ? "success" : "neutral",
    },
  ];

  return (
    <GlassPanel radius={5}>
      <Text style={[typography.headline, { marginBottom: spacing.md }]}>
        Identity Status
      </Text>

      <View>
        {rows.map((row, index) => (
          <View
            key={row.key}
            style={[
              styles.row,
              { paddingVertical: spacing.sm },
              index !== rows.length - 1 && {
                borderBottomWidth: 1,
                borderBottomColor: colors.glassBorder,
              },
            ]}
          >
            <View style={[styles.rowLeft, { gap: spacing.sm }]}>
              <View
                style={[
                  styles.iconWrap,
                  {
                    borderRadius: 5,
                    backgroundColor: colors.glassFill,
                    borderColor: colors.glassBorder,
                  },
                ]}
              >
                {row.icon}
              </View>
              <Text style={typography.bodyStrong}>{row.label}</Text>
            </View>
            <StatusChip label={row.value} tone={row.tone} />
          </View>
        ))}
      </View>
    </GlassPanel>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconWrap: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
});
