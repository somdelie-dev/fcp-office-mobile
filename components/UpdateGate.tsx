import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/themeContext";
import { downloadAndLaunchInstaller } from "../lib/appInstaller";
import {
  checkForUpdate,
  type UpdateCheckResult,
  type UpdateReleaseInfo,
} from "../lib/updateCheck";

const colors = {
  dark: {
    overlay: "rgba(2, 6, 23, 0.96)",
    cardBg: "rgba(30, 41, 59, 0.9)",
    border: "rgba(255,255,255,0.12)",
    text: "#f1f5f9",
    textMuted: "#94a3b8",
    accent: "#22c55e",
    danger: "#ef4444",
  },
  light: {
    overlay: "rgba(15, 23, 42, 0.85)",
    cardBg: "rgba(255,255,255,0.96)",
    border: "rgba(0,0,0,0.08)",
    text: "#0f172a",
    textMuted: "#64748b",
    accent: "#16A34A",
    danger: "#ef4444",
  },
};

function ReleaseNotesList({
  notes,
  muted,
}: {
  notes: string[];
  muted: string;
}) {
  if (notes.length === 0) return null;
  return (
    <View style={styles.notesList}>
      {notes.map((note, i) => (
        <View key={i} style={styles.noteRow}>
          <Text style={[styles.noteBullet, { color: muted }]}>{"•"}</Text>
          <Text style={[styles.noteText, { color: muted }]}>{note}</Text>
        </View>
      ))}
    </View>
  );
}

function useInstallAction() {
  const [installing, setInstalling] = useState(false);

  const install = async () => {
    setInstalling(true);
    try {
      await downloadAndLaunchInstaller();
    } catch (e: any) {
      Alert.alert(
        "Update Failed",
        e?.message ?? "Couldn't download the update. Please try again.",
      );
    } finally {
      setInstalling(false);
    }
  };

  return { installing, install };
}

function RequiredUpdateModal({ release }: { release: UpdateReleaseInfo }) {
  const { theme } = useTheme();
  const c = colors[theme === "dark" ? "dark" : "light"];
  const { installing, install } = useInstallAction();

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      // Swallow the Android hardware back button — this screen is not dismissible.
      onRequestClose={() => {}}
    >
      <View style={[styles.overlay, { backgroundColor: c.overlay }]}>
        <View style={[styles.card, { backgroundColor: c.cardBg, borderColor: c.border }]}>
          <View style={[styles.iconCircle, { backgroundColor: c.danger }]}>
            <Ionicons name="alert-circle" size={28} color="#fff" />
          </View>
          <Text style={[styles.title, { color: c.text }]}>Update Required</Text>
          <Text style={[styles.body, { color: c.textMuted }]}>
            This version of FirstClass is no longer supported. Please update
            to continue.
          </Text>
          <Text style={[styles.versionLine, { color: c.textMuted }]}>
            New version: {release.version}
          </Text>
          <ScrollView style={styles.notesScroll}>
            <ReleaseNotesList notes={release.releaseNotes} muted={c.textMuted} />
          </ScrollView>
          <Pressable
            style={[styles.primaryButton, { backgroundColor: c.accent }]}
            onPress={install}
            disabled={installing}
          >
            {installing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>Update Now</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function OptionalUpdateModal({
  release,
  onDismiss,
}: {
  release: UpdateReleaseInfo;
  onDismiss: () => void;
}) {
  const { theme } = useTheme();
  const c = colors[theme === "dark" ? "dark" : "light"];
  const { installing, install } = useInstallAction();

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <View style={[styles.overlay, { backgroundColor: c.overlay }]}>
        <View style={[styles.card, { backgroundColor: c.cardBg, borderColor: c.border }]}>
          <View style={[styles.iconCircle, { backgroundColor: c.accent }]}>
            <Ionicons name="rocket" size={26} color="#fff" />
          </View>
          <Text style={[styles.title, { color: c.text }]}>
            New FirstClass Update Available
          </Text>
          <Text style={[styles.body, { color: c.textMuted }]}>
            A new version of FirstClass is available.
          </Text>
          <Text style={[styles.versionLine, { color: c.textMuted }]}>
            Version {release.version}
          </Text>
          <ScrollView style={styles.notesScroll}>
            <ReleaseNotesList notes={release.releaseNotes} muted={c.textMuted} />
          </ScrollView>
          <Pressable
            style={[styles.primaryButton, { backgroundColor: c.accent }]}
            onPress={install}
            disabled={installing}
          >
            {installing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>Update Now</Text>
            )}
          </Pressable>
          <Pressable
            style={styles.secondaryButton}
            onPress={onDismiss}
            disabled={installing}
          >
            <Text style={[styles.secondaryButtonText, { color: c.textMuted }]}>
              Later
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/**
 * Mounted once at the app root. Runs the Android update check after login
 * and renders a blocking modal for required updates or a dismissible one
 * for optional updates. Renders nothing on iOS/web, before login, or when
 * the installed build is current.
 */
export function UpdateGate() {
  const { user } = useAuth();
  const [result, setResult] = useState<UpdateCheckResult>({ status: "none" });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user || Platform.OS !== "android") return;

    let cancelled = false;
    checkForUpdate().then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (result.status === "required") {
    return <RequiredUpdateModal release={result.release} />;
  }

  if (result.status === "optional" && !dismissed) {
    return (
      <OptionalUpdateModal
        release={result.release}
        onDismiss={() => setDismissed(true)}
      />
    );
  }

  return null;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 8,
    lineHeight: 20,
  },
  versionLine: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 12,
  },
  notesScroll: {
    maxHeight: 140,
    width: "100%",
    marginBottom: 16,
  },
  notesList: {
    width: "100%",
  },
  noteRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 4,
  },
  noteBullet: {
    fontSize: 13,
  },
  noteText: {
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  primaryButton: {
    width: "100%",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryButton: {
    marginTop: 12,
    paddingVertical: 8,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
