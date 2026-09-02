import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";

import {
  FaceScreenBackground,
  HeroCard,
  IdentityStatusCard,
} from "@/components/team";
import { useFaceTheme } from "@/components/team/faceTheme";
import ReferencePhotosCard, {
  ReferenceAngleKey,
  ReferenceAngleState,
} from "@/components/team/ReferencePhotosCard";
import {
  apiSupervisorEmployee,
  apiSupervisorListFaceEnrollments,
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

// Supervisor equivalent of (foreman-stack)/workers/[id]/index.tsx — same
// reference-photo status view, but no Verify action: supervisors view and
// add reference photos, they don't run the live verify-match test.
export default function SupervisorEmployeeScreen() {
  // See foreman-stack's timesheets/[id].tsx for why `id` is coerced to a
  // stable string rather than used straight from useLocalSearchParams.
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
  // Whether any enrollment (any status) has ever been submitted — distinguishes
  // "nothing captured yet" (missing) from "captured, awaiting approval" (pending).
  const [hasSubmission, setHasSubmission] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [employeeRes, enrollmentsRes] = await Promise.all([
        apiSupervisorEmployee(id),
        apiSupervisorListFaceEnrollments(id).catch(() => ({
          enrollments: [],
        })),
      ]);

      setEmployee(employeeRes.employee);
      setHasSubmission(enrollmentsRes.enrollments.length > 0);

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

  const verificationStatus = faceProfileComplete
    ? "verified"
    : hasSubmission
      ? "pending"
      : "missing";

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
          verificationStatus={verificationStatus}
          workerStatus={employee.active ? "active" : "inactive"}
        />

        <ReferencePhotosCard
          angles={angles}
          onCapturePress={() =>
            router.push({
              pathname: "/(supervisor-stack)/employees/[id]/capture-reference",
              params: { id: employee.id },
            })
          }
        />
      </ScrollView>
    </FaceScreenBackground>
  );
}
