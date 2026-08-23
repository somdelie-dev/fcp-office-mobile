// app/(foreman-stack)/workers/new.tsx
import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import { GlassCard } from "@/components/GlassCard";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  apiForemanCreateEmployee,
  apiForemanUploadEmployeePhoto,
} from "../../../lib/apiClient";
import { compressImage } from "../../../lib/imageCompression";

function clean(s: any) {
  return String(s ?? "").trim();
}

function asMoneyNumber(s: string) {
  const x = Number(String(s).replace(",", "."));
  return Number.isFinite(x) ? x : NaN;
}

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

  // Try to infer file type
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

export default function NewWorker() {
  const router = useRouter();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [active, setActive] = useState(true);

  const [photo, setPhoto] = useState<null | {
    uri: string;
    name: string;
    type: string;
  }>(null);

  const [busy, setBusy] = useState(false);

  const canSave = useMemo(() => {
    if (!clean(firstName) || !clean(lastName) || !clean(phone)) return false;
    return true;
  }, [firstName, lastName, phone]);

  const choosePhoto = useCallback(async () => {
    try {
      const f = await takePhoto();
      if (!f) return;
      setPhoto(f);
    } catch (e: any) {
      Alert.alert("Camera", e?.message ?? "Failed to take photo.");
    }
  }, []);

  const removePhoto = useCallback(() => setPhoto(null), []);

  const save = useCallback(async () => {
    if (!canSave) {
      Alert.alert(
        "Fix fields",
        "First name, last name and phone are required.",
      );
      return;
    }

    setBusy(true);
    try {
      const payload = {
        firstName: clean(firstName),
        lastName: clean(lastName),
        phone: clean(phone) || undefined,
        active,
      };

      const created = await apiForemanCreateEmployee(payload);
      const employeeId = created?.employee?.id;

      if (!employeeId) {
        throw new Error("Personel member created but ID is missing.");
      }

      if (photo) {
        // Compress image before upload (smaller for profile photos)
        const compressed = await compressImage(photo.uri, {
          maxWidth: 800,
          maxHeight: 800,
          quality: 0.8,
        });
        const compressedPhoto = {
          uri: compressed.uri,
          name: photo.name.replace(/\.\w+$/, ".jpg"),
          type: "image/jpeg",
        };
        await apiForemanUploadEmployeePhoto(employeeId, compressedPhoto);
      }

      Alert.alert("Saved", "Person added to your crew.");
      router.back();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to add person.");
    } finally {
      setBusy(false);
    }
  }, [canSave, firstName, lastName, phone, active, photo, router]);

  return (
    <AuthStyleBackground>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerRow}>
            <Pressable
              style={styles.backPill}
              onPress={() => router.back()}
              disabled={busy}
            >
              <Text style={styles.backTxt}>← Back</Text>
            </Pressable>

            <Pressable
              style={[
                styles.primaryBtn,
                !canSave && { opacity: 0.5 },
                busy && { opacity: 0.6 },
              ]}
              onPress={save}
              disabled={!canSave || busy}
            >
              {busy ? (
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  <ActivityIndicator color="#fff" />
                  <Text style={styles.primaryTxt}>Saving…</Text>
                </View>
              ) : (
                <Text style={styles.primaryTxt}>Save</Text>
              )}
            </Pressable>
          </View>

          <GlassCard style={{ padding: 12, gap: 10 }}>
            <Text style={styles.h1}>Add New Guy</Text>

            <View style={styles.field}>
              <Text style={styles.label}>First name</Text>
              <TextInput
                value={firstName}
                onChangeText={setFirstName}
                placeholder="e.g. Thamie"
                placeholderTextColor="#8d93a3"
                style={styles.input}
                editable={!busy}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Last name</Text>
              <TextInput
                value={lastName}
                onChangeText={setLastName}
                placeholder="e.g. Ndlovu"
                placeholderTextColor="#8d93a3"
                style={styles.input}
                editable={!busy}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Phone *</Text>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="e.g. 0712345678"
                placeholderTextColor="#8d93a3"
                keyboardType="phone-pad"
                style={styles.input}
                editable={!busy}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Face photo (optional)</Text>

              {photo ? (
                <View style={styles.photoRow}>
                  <Image source={{ uri: photo.uri }} style={styles.photo} />
                  <View style={{ flex: 1, gap: 8 }}>
                    <Pressable
                      style={styles.outlineBtn}
                      onPress={choosePhoto}
                      disabled={busy}
                    >
                      <Text style={styles.outlineTxt}>Change Photo</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.outlineBtn, { borderColor: "#dc2626" }]}
                      onPress={removePhoto}
                      disabled={busy}
                    >
                      <Text style={[styles.outlineTxt, { color: "#dc2626" }]}>
                        Remove
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                  style={styles.outlineBtn}
                  onPress={choosePhoto}
                  disabled={busy}
                >
                  <Text style={styles.outlineTxt}>📷 Take Photo</Text>
                </Pressable>
              )}
            </View>
          </GlassCard>

        </ScrollView>
      </KeyboardAvoidingView>
    </AuthStyleBackground>
  );
}

const ORANGE = "#ea580c";
const NAVY = "#16A34A";

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  backPill: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 5,
    backgroundColor: NAVY,
  },
  backTxt: { color: "#fff", fontWeight: "900" },

  primaryBtn: {
    backgroundColor: ORANGE,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 5,
  },
  primaryTxt: { color: "#fff", fontWeight: "900" },

  h1: { fontSize: 18, fontWeight: "900", color: "#111" },
  field: { gap: 6 },
  label: { fontWeight: "900", color: "#111" },
  hint: { color: "#666", fontWeight: "700", fontSize: 12 },

  input: {
    height: 44,
    borderRadius: 5,
    backgroundColor: "rgba(255,255,255,0.65)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    paddingHorizontal: 12,
    fontWeight: "800",
    color: "#111",
  },

  outlineBtn: {
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.15)",
    backgroundColor: "rgba(255,255,255,0.55)",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 5,
    alignItems: "center",
  },
  outlineTxt: { fontWeight: "900", color: "#111" },

  photoRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  photo: { width: 84, height: 84, borderRadius: 10, backgroundColor: "#eee" },

  note: { color: "#666", fontWeight: "700", fontSize: 12 },
});
