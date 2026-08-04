// app/(foreman-stack)/workers/[id]/index.tsx
import { AuthStyleBackground } from "../../../../components/AuthStyleBackground";
import { GlassCard } from "../../../../components/GlassCard";
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
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ScrollView,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import Header from "../../../../components/FaceVerification/Header";
import HeroCard from "../../../../components/FaceVerification/HeroCard";
import IdentityStatusCard from "../../../../components/FaceVerification/IdentityStatusCard";
import ReferencePhotosCard from "../../../../components/FaceVerification/ReferencePhotosCard";
import PrimaryActions from "../../../../components/FaceVerification/PrimaryActions";
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
        <SafeAreaView style={styles.container}>
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIcon}>
              <Ionicons
                name="person-circle-outline"
                size={90}
                color="#4DA3FF"
              />
            </View>

            <Text style={styles.emptyTitle}>Person Not Found</Text>

            <Text style={styles.emptySubtitle}>
              We couldn't load this person's verification profile. Please return
              and try again.
            </Text>

            <Pressable
              style={styles.primaryButton}
              onPress={() => router.back()}
            >
              <Ionicons name="arrow-back" size={18} color="#fff" />

              <Text style={styles.primaryButtonText}>Go Back</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </AuthStyleBackground>
    );
  }

  return (
    <AuthStyleBackground>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaView style={styles.container}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
          >
            <Header />

            <HeroCard
              name={emp.fullName}
              workerCode={emp.code}
              photoUri={emp.faceImageUrl}
              isActive={emp.active}
              isFaceReady={!!emp.faceImageUrl}
            />

            <IdentityStatusCard
              faceProfileComplete={!!emp.faceImageUrl}
              workerStatus={emp.active ? "active" : "inactive"}
            />

            <ReferencePhotosCard onCapturePress={handleAddOrUpdatePhoto} />

            <PrimaryActions
              onVerifyPress={() =>
                router.push({
                  pathname: "/(foreman-stack)/workers/[id]/scan-out-face",
                  params: { id: String(id) },
                })
              }
              onCaptureReferencePress={() =>
                router.push({
                  pathname: "/(foreman-stack)/workers/[id]/enroll-face",
                  params: { id: String(id) },
                })
              }
            />
          </ScrollView>
        </SafeAreaView>
      </GestureHandlerRootView>
    </AuthStyleBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 40,
  },

  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 30,
  },

  emptyIcon: {
    width: 140,
    height: 140,
    borderRadius: 70,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(77,163,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(77,163,255,0.25)",
    marginBottom: 30,
  },

  emptyTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#FFFFFF",
  },

  emptySubtitle: {
    marginTop: 12,
    textAlign: "center",
    color: "#93A4B8",
    lineHeight: 24,
    fontSize: 16,
  },

  primaryButton: {
    marginTop: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 56,
    paddingHorizontal: 28,
    borderRadius: 18,
    backgroundColor: "#2563EB",
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 16,
  },
});
