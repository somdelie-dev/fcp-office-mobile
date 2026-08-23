import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import { GlassCard } from "@/components/GlassCard";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, usePathname, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { apiForemanCreateEmployee } from "../lib/apiClient";
import {
  getEmployee,
  initEmployeesStore,
  upsertEmployee,
} from "../lib/employeesStore";

export default function EmployeeForm() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useLocalSearchParams<{ id?: string }>();

  const isEdit = useMemo(() => pathname.includes("/edit"), [pathname]);
  const editId = typeof params.id === "string" ? params.id : undefined;

  const [code, setCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [dayRate, setDayRate] = useState("0");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    await initEmployeesStore();
    if (!isEdit || !editId) return;

    const e = await getEmployee(editId);
    if (!e) return;

    setCode(e.code);
    setFullName(e.fullName);
    setPhone(e.phone ?? "");
    setDayRate(String(e.dayRate));
    setActive(e.active);
  }, [isEdit, editId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function save() {
    const rate = Number(dayRate);
    setSaving(true);
    try {
      if (isEdit && editId) {
        // For editing: update local cache only
        const res = await upsertEmployee({
          id: editId,
          code,
          fullName,
          phone,
          dayRate: rate,
          active,
        });

        if (!res.ok) {
          Alert.alert("Error", res.reason);
          return;
        }

        Alert.alert("Success", "Guy updated");
        router.replace({
          pathname: "/(foreman-stack)/workers/[id]",
          params: { id: editId },
        });
      } else {
        // For creating: use API (no dayRate on creation)
        const apiResult = await apiForemanCreateEmployee({
          firstName: fullName.split(" ")[0],
          lastName: fullName.split(" ").slice(1).join(" ") || fullName,
          code,
          phone,
          active,
        });

        if (!apiResult?.employee?.id) {
          Alert.alert("Error", "Failed to create guy");
          return;
        }

        // Also cache locally
        const res = await upsertEmployee({
          id: apiResult.employee.id,
          code,
          fullName,
          phone,
          dayRate: rate,
          active,
        });

        if (!res.ok) {
          Alert.alert("Warning", "Created but local cache failed");
          return;
        }

        Alert.alert("Success", "Guy created");
        router.replace({
          pathname: "/(foreman-stack)/workers/[id]",
          params: { id: apiResult.employee.id },
        });
      }
    } catch (error) {
      console.error("Save error:", error);
      Alert.alert(
        "Error",
        `Failed to save: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <AuthStyleBackground>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={64}
        >
          <View style={styles.container}>
            <GlassCard>
              <Pressable onPress={() => router.back()} style={styles.backPill}>
                <Text style={styles.backTxt}>← Back</Text>
              </Pressable>

              <Text style={styles.h1}>
                {isEdit ? "Edit Guy" : "Add Guy"}
              </Text>

              <Label text="Guy Code (QR)" />
              <TextInput
                value={code}
                onChangeText={setCode}
                placeholder="e.g. ABC123"
                placeholderTextColor="#8d93a3"
                autoCapitalize="characters"
                style={styles.input}
              />

              <Label text="Full Name" />
              <TextInput
                value={fullName}
                onChangeText={setFullName}
                placeholder="e.g. Thamie Mkhize"
                placeholderTextColor="#8d93a3"
                style={styles.input}
              />

              <Label text="Phone (optional)" />
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="e.g. 071 234 5678"
                placeholderTextColor="#8d93a3"
                keyboardType="phone-pad"
                style={styles.input}
              />

              <Label text="Day Rate" />
              <TextInput
                value={dayRate}
                onChangeText={setDayRate}
                placeholder="e.g. 350"
                placeholderTextColor="#8d93a3"
                keyboardType="numeric"
                style={styles.input}
              />

              <Pressable
                onPress={() => setActive((v) => !v)}
                style={[
                  styles.toggle,
                  active ? styles.toggleOn : styles.toggleOff,
                ]}
              >
                <Text style={styles.toggleTxt}>
                  {active ? "Active" : "Inactive"}
                </Text>
              </Pressable>

              <Pressable
                onPress={save}
                disabled={saving}
                style={[styles.primaryBtn, saving && { opacity: 0.7 }]}
              >
                <Text style={styles.primaryTxt}>
                  {saving ? "SAVING..." : "SAVE"}
                </Text>
              </Pressable>
            </GlassCard>
          </View>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </AuthStyleBackground>
  );
}

function Label({ text }: { text: string }) {
  return <Text style={styles.label}>{text}</Text>;
}

const NAVY = "#16A34A";

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },

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

  h1: { fontSize: 18, fontWeight: "900", color: "#111", marginBottom: 12 },

  label: {
    marginTop: 10,
    marginBottom: 6,
    color: "#666",
    fontWeight: "900",
    fontSize: 12,
  },

  input: {
    height: 44,
    borderRadius: 5,
    backgroundColor: "rgba(255,255,255,0.65)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    paddingHorizontal: 12,
    fontWeight: "800",
    color: "#111",
  },

  toggle: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 5,
    alignItems: "center",
    borderWidth: 1,
  },
  toggleOn: {
    backgroundColor: "rgba(34,197,94,0.12)",
    borderColor: "rgba(0,0,0,0.06)",
  },
  toggleOff: {
    backgroundColor: "rgba(0,0,0,0.05)",
    borderColor: "rgba(0,0,0,0.06)",
  },
  toggleTxt: { fontWeight: "900", color: "#111" },

  primaryBtn: {
    marginTop: 14,
    backgroundColor: NAVY,
    paddingVertical: 12,
    borderRadius: 5,
    alignItems: "center",
  },
  primaryTxt: { color: "#fff", fontWeight: "900", letterSpacing: 0.8 },
});
