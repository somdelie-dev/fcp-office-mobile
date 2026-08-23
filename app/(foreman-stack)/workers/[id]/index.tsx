import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";

import {
  FaceScreenBackground,
  Header,
  HeroCard,
  IdentityStatusCard,
  PrimaryActions,
} from "@/components/team";
import { useFaceTheme } from "@/components/team/faceTheme";
import ReferencePhotosCard, {
  ReferenceAngleKey,
  ReferenceAngleState,
} from "@/components/team/ReferencePhotosCard";
import {
  apiForemanEmployee,
  apiListFaceEnrollments,
  EmployeeDto,
} from "@/lib/apiClient";

const ANGLE_LABELS: Record<ReferenceAngleKey, string> = {
  front: "Front",
  left: "Left",
  right: "Right",
  smile: "Smile",
  neutral: "Neutral",
};

const ANGLE_ORDER: ReferenceAngleKey[] = [
  "front",
  "left",
  "right",
  "smile",
  "neutral",
];

export default function SingleTeamScreen() {
  // `useLocalSearchParams` can hand back a fresh array/object reference for
  // `id` on successive recomputations even when the value hasn't changed —
  // coercing to a plain string here keeps it a stable primitive so effects
  // that depend on it don't re-fire on every render (see timesheets/[id].tsx).
  const params = useLocalSearchParams<{ id: string }>();
  const id = String(params.id ?? "");
  const { colors, typography, spacing } = useFaceTheme();

  const [employee, setEmployee] = useState<EmployeeDto | null>(null);
  const [angles, setAngles] = useState<ReferenceAngleState[]>(
    ANGLE_ORDER.map((key) => ({
      key,
      label: ANGLE_LABELS[key],
      complete: false,
    })),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [employeeRes, enrollmentsRes] = await Promise.all([
        apiForemanEmployee(id),
        apiListFaceEnrollments(id).catch(() => ({ enrollments: [] })),
      ]);

      setEmployee(employeeRes.employee);

      const approvedPoses = new Set(
        enrollmentsRes.enrollments
          .filter((e) => e.status === "APPROVED")
          .map((e) => e.pose.toLowerCase()),
      );
      setAngles(
        ANGLE_ORDER.map((key) => ({
          key,
          label: ANGLE_LABELS[key],
          complete: approvedPoses.has(key),
        })),
      );
    } catch (e: any) {
      setError(e?.message ?? "Failed to load worker.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const faceProfileComplete = useMemo(
    () => angles.length > 0 && angles.every((a) => a.complete),
    [angles],
  );

  if (loading) {
    return (
      <FaceScreenBackground>
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <ActivityIndicator color={colors.primary} />
        </View>
      </FaceScreenBackground>
    );
  }

  if (error || !employee) {
    return (
      <FaceScreenBackground>
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: spacing.lg,
          }}
        >
          <Text style={[typography.body, { textAlign: "center" }]}>
            {error ?? "Worker not found."}
          </Text>
        </View>
      </FaceScreenBackground>
    );
  }

  return (
    <FaceScreenBackground>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing.xl,
          gap: spacing.md,
        }}
        showsVerticalScrollIndicator={false}
      >
        <HeroCard
          name={employee.fullName}
          workerCode={employee.code}
          photoUri={employee.faceImageUrl}
          isActive={employee.active}
          isFaceReady={faceProfileComplete}
          identityStatusLabel={
            faceProfileComplete ? "Identity Ready" : "Setup Required"
          }
          identityReady={faceProfileComplete}
        />

        <IdentityStatusCard
          faceProfileComplete={faceProfileComplete}
          verificationStatus={faceProfileComplete ? "verified" : "pending"}
          workerStatus={employee.active ? "active" : "inactive"}
        />

        <ReferencePhotosCard
          angles={angles}
          onCapturePress={() =>
            router.push({
              pathname: "/(foreman-stack)/workers/[id]/capture-reference",
              params: { id: employee.id },
            })
          }
        />

        <PrimaryActions
          onVerifyPress={() =>
            router.push({
              pathname: "/(foreman-stack)/workers/[id]/verify",
              params: { id: employee.id },
            })
          }
        />
      </ScrollView>
    </FaceScreenBackground>
  );
}
