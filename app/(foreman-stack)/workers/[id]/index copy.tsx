// app/(foreman-stack)/workers/[id]/index.tsx
import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import { GlassCard } from "@/components/GlassCard";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  fetchEmployeeFromServer,
  getEmployee,
  initEmployeesStore,
  type Employee,
} from "../../../../lib/employeesStore";
import { apiForemanUploadEmployeePhoto } from "../../../../lib/apiClient";
import { compressImage } from "../../../../lib/imageCompression";
// OPTIONAL if you want server delete:
// import { apiFetch } from "../../../../lib/api";

async function takePhoto() {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error("Camera permission denied.");

  const res = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.85,
    allowsEditing: true,
    aspect: [1, 1],
  });

  if (res.canceled) return null;

  const a = res.assets?.[0];
  if (!a?.uri) return null;

  const uri = a.uri;
  const ext = uri.split(".").pop()?.toLowerCase();
  const type =
    ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

  return {
    uri,
    name: `employee_${Date.now()}.${ext || "jpg"}`,
    type,
  };
}

export default function EmployeeDetails() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [emp, setEmp] = useState<Employee | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

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

  const handleAddOrUpdatePhoto = useCallback(async () => {
    try {
      const file = await takePhoto();
      if (!file) return;

      setUploadingPhoto(true);
      const compressed = await compressImage(file.uri, {
        maxWidth: 800,
        maxHeight: 800,
        quality: 0.8,
      });
      const compressedPhoto = {
        uri: compressed.uri,
        name: file.name.replace(/\.\w+$/, ".jpg"),
        type: "image/jpeg",
      };

      await apiForemanUploadEmployeePhoto(String(id), compressedPhoto);
      await refresh();
    } catch (e: any) {
      Alert.alert("Photo", e?.message ?? "Failed to update photo.");
    } finally {
      setUploadingPhoto(false);
    }
  }, [id, refresh]);

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
          <Text style={styles.name}>{emp.fullName}</Text>
          <Text style={styles.meta}>Code: {emp.code}</Text>

          {emp.phone ? (
            <Text style={styles.meta}>Phone: {emp.phone}</Text>
          ) : null}

          <Text style={styles.meta}>
            Status: {emp.active ? "Active" : "Inactive"}
          </Text>

          <View style={styles.photoSection}>
            <Text style={styles.label}>Face Photo</Text>
            <View style={styles.photoRow}>
              {emp.faceImageUrl ? (
                <Image
                  source={{ uri: emp.faceImageUrl }}
                  style={styles.photo}
                />
              ) : (
                <View style={[styles.photo, styles.photoPlaceholder]}>
                  <Text style={styles.photoPlaceholderTxt}>No photo</Text>
                </View>
              )}
              <Pressable
                style={[styles.outlineBtn, uploadingPhoto && { opacity: 0.6 }]}
                onPress={handleAddOrUpdatePhoto}
                disabled={uploadingPhoto}
              >
                {uploadingPhoto ? (
                  <ActivityIndicator color="#111" />
                ) : (
                  <Text style={styles.outlineBtnTxt}>
                    {emp.faceImageUrl ? "Update Photo" : "Add Photo"}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>

          <View style={styles.actions}>
            <Pressable
              style={styles.outlineBtn}
              onPress={() =>
                router.push({
                  pathname: "/(foreman-stack)/workers/[id]/enroll-face",
                  params: { id: String(id) },
                })
              }
            >
              <Text style={styles.outlineBtnTxt}>Enroll Face</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.successBtn]}
              onPress={() =>
                router.push({
                  pathname: "/(foreman-stack)/workers/[id]/scan-out-face",
                  params: { id: String(id) },
                })
              }
            >
              <Text style={styles.successBtnTxt}>Scan Out (Face)</Text>
            </Pressable>
          </View>

          {__DEV__ && (
            <View style={styles.actions}>
              <Pressable
                style={styles.outlineBtn}
                onPress={() => router.push("/(foreman-stack)/dev-face-test")}
              >
                <Text style={styles.outlineBtnTxt}>
                  🧪 face-service test (Phase 0, dev only)
                </Text>
              </Pressable>
            </View>
          )}
        </GlassCard>
      </View>
    </AuthStyleBackground>
  );
}

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

  label: { fontWeight: "900", color: "#111" },
  photoSection: { marginTop: 16, gap: 8 },
  photoRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  photo: { width: 64, height: 64, borderRadius: 10, backgroundColor: "#eee" },
  photoPlaceholder: { justifyContent: "center", alignItems: "center" },
  photoPlaceholderTxt: {
    fontSize: 10,
    color: "#888",
    fontWeight: "700",
    textAlign: "center",
  },
  outlineBtn: {
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.15)",
    backgroundColor: "rgba(255,255,255,0.55)",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  outlineBtnTxt: { fontWeight: "900", color: "#111" },

  actions: { flexDirection: "row", gap: 10, marginTop: 16 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 5, alignItems: "center" },
  btnTxt: { fontWeight: "900" },

  successBtn: { backgroundColor: "#22C55E" },
  successBtnTxt: { fontWeight: "900", color: "#111827" },
});
