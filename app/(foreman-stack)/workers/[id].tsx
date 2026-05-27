// app/(foreman-stack)/workers/[id].tsx
import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import { GlassCard } from "@/components/GlassCard";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  fetchEmployeeFromServer,
  getEmployee,
  initEmployeesStore,
  type Employee,
} from "../../../lib/employeesStore";
// OPTIONAL if you want server delete:
// import { apiFetch } from "../../../lib/api";

export default function EmployeeDetails() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [emp, setEmp] = useState<Employee | null>(null);

  const refresh = useCallback(async () => {
    const employeeId = String(id);

    try {
      await initEmployeesStore();

      // 1) show cached immediately if present
      const cached = await getEmployee(employeeId);
      if (cached) setEmp(cached);

      // 2) then fetch from server (this is the endpoint you require)
      const fresh = await fetchEmployeeFromServer(employeeId);
      if (fresh) setEmp(fresh);
      else if (!cached) setEmp(null);
    } catch (error) {
      console.error("Failed to refresh employee:", error);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  if (!emp) {
    return (
      <AuthStyleBackground>
        <View style={styles.container}>
          <GlassCard>
            <Text style={styles.h1}>Person not found</Text>
            <Pressable style={styles.btn} onPress={() => router.back()}>
              <Text style={styles.btnTxt}>Back</Text>
            </Pressable>
          </GlassCard>
        </View>
      </AuthStyleBackground>
    );
  }

  return (
    <AuthStyleBackground>
      <View style={styles.container}>
        <GlassCard>
          <Pressable onPress={() => router.back()} style={styles.backPill}>
            <Text style={styles.backTxt}>← Back</Text>
          </Pressable>

          <Text style={styles.name}>{emp.fullName}</Text>
          <Text style={styles.meta}>Code: {emp.code}</Text>

          {emp.phone ? (
            <Text style={styles.meta}>Phone: {emp.phone}</Text>
          ) : null}

          <Text style={styles.meta}>
            Status: {emp.active ? "Active" : "Inactive"}
          </Text>
        </GlassCard>
      </View>
    </AuthStyleBackground>
  );
}

const NAVY = "#262D68";

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  h1: { fontSize: 18, fontWeight: "900" },

  backPill: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.65)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    marginBottom: 10,
  },
  backTxt: { fontWeight: "900", color: "#111" },

  name: { fontSize: 18, fontWeight: "900", color: "#111" },
  meta: { marginTop: 6, color: "#666", fontWeight: "800" },

  actions: { flexDirection: "row", gap: 10, marginTop: 16 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 5, alignItems: "center" },
  btnTxt: { fontWeight: "900" },
});
