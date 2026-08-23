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
import { useAppTheme } from "../lib/appTheme";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const router = useRouter();
  const { isDark, colors } = useAppTheme();
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
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={["top", "bottom"]}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAvoidingView
          style={[styles.container, { backgroundColor: colors.background }]}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View
            style={[
              styles.circle,
              styles.circleTop,
              { backgroundColor: colors.primaryGreenDim },
            ]}
          />
          <View
            style={[
              styles.circleSmall,
              styles.circleTopInner,
              {
                backgroundColor: isDark
                  ? "rgba(34, 197, 94, 0.08)"
                  : colors.surfaceElevated,
              },
            ]}
          />
          <View
            style={[
              styles.circle,
              styles.circleBottom,
              { backgroundColor: colors.primaryGreenDim },
            ]}
          />
          <View
            style={[
              styles.circleSmall,
              styles.circleBottomInner,
              {
                backgroundColor: isDark
                  ? "rgba(34, 197, 94, 0.08)"
                  : colors.surfaceElevated,
              },
            ]}
          />

          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              SIGN IN
            </Text>

            <View
              style={[
                styles.inputWrap,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.border,
                },
              ]}
            >
              <Ionicons
                name="mail"
                size={18}
                color={colors.textSecondary}
                style={styles.icon}
              />
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Email"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                style={[styles.input, { color: colors.textPrimary }]}
                returnKeyType="next"
              />
            </View>

            <View
              style={[
                styles.inputWrap,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.border,
                },
              ]}
            >
              <Ionicons
                name="lock-closed"
                size={18}
                color={colors.textSecondary}
                style={styles.icon}
              />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor={colors.textTertiary}
                secureTextEntry={!showPassword}
                style={[styles.input, { color: colors.textPrimary }]}
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
                  color={colors.textTertiary}
                />
              </Pressable>
            </View>

            {error ? (
              <Text style={[styles.error, { color: colors.danger }]}>
                {error}
              </Text>
            ) : null}

            <Pressable
              onPress={onSubmit}
              disabled={busy}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: colors.primaryGreen },
                (pressed || busy) && { opacity: 0.85 },
              ]}
            >
              <Text style={[styles.buttonText, { color: colors.textOnPrimary }]}>
                {busy ? "SIGNING IN..." : "SIGN IN"}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {}}
              style={{ paddingVertical: 10, alignItems: "center" }}
            >
              <Text style={[styles.forgot, { color: colors.textSecondary }]}>
                Forgot Password?
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 18,
  },
  circle: {
    position: "absolute",
    width: 360,
    height: 360,
    borderRadius: 360,
    opacity: 0.95,
  },
  circleSmall: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 220,
  },
  circleTop: { top: -220, right: -220 },
  circleTopInner: { top: -155, right: -155 },
  circleBottom: { bottom: -220, left: -220 },
  circleBottomInner: { bottom: -155, left: -155 },

  card: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 14,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 46,
    marginBottom: 12,
  },
  icon: { marginRight: 10 },
  input: { flex: 1, fontWeight: "600" },
  error: { fontWeight: "700", marginBottom: 10 },
  button: {
    height: 46,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  buttonText: {
    fontWeight: "900",
    letterSpacing: 1,
    fontSize: 13,
  },
  forgot: { fontWeight: "700", fontSize: 12 },
});
