// LoginScreen.tsx
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
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
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../lib/auth";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit() {
    setError(null);

    if (!email.trim() || !password.trim()) {
      setError("Enter email and password.");
      return;
    }

    try {
      setBusy(true);
      await signIn(email.trim(), password);
      // Navigate to index which will redirect to the appropriate home screen
      router.replace("/");
    } catch (e: any) {
      setError(e?.message ?? "Login failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={[styles.circle, styles.circleTop]} />
          <View style={[styles.circleSmall, styles.circleTopInner]} />
          <View style={[styles.circle, styles.circleBottom]} />
          <View style={[styles.circleSmall, styles.circleBottomInner]} />

          <View style={styles.card}>
            <Text style={styles.title}>SIGN IN</Text>

            <View style={styles.inputWrap}>
              <Ionicons
                name="mail"
                size={18}
                color="#2B2F3A"
                style={styles.icon}
              />
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Email"
                placeholderTextColor="#A2A7B3"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                style={styles.input}
                returnKeyType="next"
              />
            </View>

            <View style={styles.inputWrap}>
              <Ionicons
                name="lock-closed"
                size={18}
                color="#2B2F3A"
                style={styles.icon}
              />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor="#A2A7B3"
                secureTextEntry={!showPassword}
                style={styles.input}
                returnKeyType="done"
                onSubmitEditing={onSubmit}
              />
              <Pressable
                onPress={() => setShowPassword((v) => !v)}
                hitSlop={8}
                style={{ paddingLeft: 8 }}
              >
                <Ionicons
                  name={showPassword ? "eye-off" : "eye"}
                  size={18}
                  color="#A2A7B3"
                />
              </Pressable>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              onPress={onSubmit}
              disabled={busy}
              style={({ pressed }) => [
                styles.button,
                (pressed || busy) && { opacity: 0.9 },
              ]}
            >
              <Text style={styles.buttonText}>
                {busy ? "SIGNING IN..." : "SIGN IN"}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {}}
              style={{ paddingVertical: 10, alignItems: "center" }}
            >
              <Text style={styles.forgot}>Forgot Password?</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}

const NAVY = "#262D68";
const BG = "#EEF0F5";
const CARD = "#F7F7F8";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  container: {
    flex: 1,
    backgroundColor: BG,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 18,
  },
  circle: {
    position: "absolute",
    width: 360,
    height: 360,
    borderRadius: 360,
    backgroundColor: NAVY,
    opacity: 0.95,
  },
  circleSmall: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 220,
    backgroundColor: "#DADDE8",
  },
  circleTop: { top: -220, right: -220 },
  circleTopInner: { top: -155, right: -155 },
  circleBottom: { bottom: -220, left: -220 },
  circleBottomInner: { bottom: -155, left: -155 },

  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: CARD,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 1,
    color: "#121318",
    marginBottom: 14,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E6E7EC",
    paddingHorizontal: 12,
    height: 46,
    marginBottom: 12,
  },
  icon: { marginRight: 10 },
  input: { flex: 1, color: "#111", fontWeight: "600" },
  error: { color: "#B00020", fontWeight: "700", marginBottom: 10 },
  button: {
    height: 46,
    borderRadius: 10,
    backgroundColor: NAVY,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "900",
    letterSpacing: 1,
    fontSize: 13,
  },
  forgot: { color: "#6A6F7A", fontWeight: "700", fontSize: 12 },
});
