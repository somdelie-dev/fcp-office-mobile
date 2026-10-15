import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import {
  AUDIENCE_LABEL,
  MESSAGE_ACCENT,
  messageThemes,
  peopleLabel,
} from "@/lib/adminMessages";
import {
  apiAdminMessageRecipients,
  apiAdminSendMessage,
  type MessageAudience,
  type MessageRecipientDto,
} from "@/lib/apiClient";
import { useTheme } from "@/lib/themeContext";

const AUDIENCE_OPTIONS: {
  value: MessageAudience;
  icon: React.ComponentProps<typeof Ionicons>["name"];
}[] = [
  { value: "ALL_FOREMEN", icon: "construct-outline" },
  { value: "ALL_SUPERVISORS", icon: "shield-checkmark-outline" },
  { value: "ALL_FOREMEN_AND_SUPERVISORS", icon: "people-outline" },
  { value: "SELECTED", icon: "person-add-outline" },
];

const TITLE_MAX = 120;
const BODY_MAX = 2000;

export default function ComposeMessageScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const colors = messageThemes[theme];
  const isDark = theme === "dark";
  const insets = useSafeAreaInsets();

  const [recipients, setRecipients] = useState<MessageRecipientDto[]>([]);
  const [recipientsError, setRecipientsError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<MessageAudience>("ALL_FOREMEN");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    apiAdminMessageRecipients()
      .then((res) => setRecipients(res.recipients ?? []))
      .catch((e: any) =>
        setRecipientsError(e?.message ?? "Could not load people."),
      );
  }, []);

  const audienceCount = useMemo(() => {
    if (audience === "SELECTED") return selected.size;
    return recipients.filter((r) =>
      audience === "ALL_FOREMEN"
        ? r.role === "FOREMAN"
        : audience === "ALL_SUPERVISORS"
          ? r.role === "SUPERVISOR"
          : true,
    ).length;
  }, [audience, recipients, selected]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return recipients;
    return recipients.filter(
      (r) =>
        r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q),
    );
  }, [recipients, search]);

  const allShownSelected =
    filtered.length > 0 && filtered.every((r) => selected.has(r.id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAllShown = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allShownSelected) filtered.forEach((r) => next.delete(r.id));
      else filtered.forEach((r) => next.add(r.id));
      return next;
    });

  const canReview =
    title.trim().length > 0 && body.trim().length > 0 && audienceCount > 0;

  const send = async () => {
    setSending(true);
    try {
      const res = await apiAdminSendMessage({
        title: title.trim(),
        body: body.trim(),
        audience,
        userIds: audience === "SELECTED" ? [...selected] : [],
      });
      setReviewing(false);
      Alert.alert(
        "Message sent",
        `Sent to ${peopleLabel(res.recipientCount)}.`,
      );
      router.replace({
        pathname: "/(admin-stack)/messages/[id]",
        params: { id: res.id },
      } as any);
    } catch (e: any) {
      Alert.alert("Sending failed", e?.message ?? "Please try again.");
    } finally {
      setSending(false);
    }
  };

  const inputStyle = [
    styles.input,
    {
      borderColor: colors.rowBorder,
      backgroundColor: colors.inputBg,
      color: colors.textPrimary,
    },
  ];

  return (
    <AuthStyleBackground>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            New message
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Arrives as a phone notification and in their app.
          </Text>

          <View style={styles.labelRow}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>
              Title
            </Text>
            <Text style={[styles.counter, { color: colors.textSecondary }]}>
              {title.length}/{TITLE_MAX}
            </Text>
          </View>
          <TextInput
            value={title}
            onChangeText={setTitle}
            maxLength={TITLE_MAX}
            placeholder="e.g. Site closed tomorrow"
            placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
            style={inputStyle}
          />

          <View style={styles.labelRow}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>
              Message
            </Text>
            <Text style={[styles.counter, { color: colors.textSecondary }]}>
              {body.length}/{BODY_MAX}
            </Text>
          </View>
          <TextInput
            value={body}
            onChangeText={setBody}
            maxLength={BODY_MAX}
            placeholder="Write your message"
            placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
            style={[inputStyle, styles.bodyInput]}
            multiline
          />

          <Text
            style={[
              styles.label,
              styles.sectionLabel,
              { color: colors.textSecondary },
            ]}
          >
            Send to
          </Text>
          <View style={styles.audienceGrid}>
            {AUDIENCE_OPTIONS.map((opt) => {
              const active = audience === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => setAudience(opt.value)}
                  style={[
                    styles.audienceCard,
                    active
                      ? {
                          borderColor: MESSAGE_ACCENT,
                          backgroundColor: `${MESSAGE_ACCENT}1f`,
                        }
                      : {
                          borderColor: colors.rowBorder,
                          backgroundColor: colors.cardBg,
                        },
                  ]}
                >
                  <Ionicons
                    name={opt.icon}
                    size={18}
                    color={active ? MESSAGE_ACCENT : colors.textSecondary}
                  />
                  <Text
                    style={[styles.audienceText, { color: colors.textPrimary }]}
                    numberOfLines={2}
                  >
                    {opt.value === "SELECTED"
                      ? "Pick people"
                      : AUDIENCE_LABEL[opt.value]}
                  </Text>
                  <Ionicons
                    name={active ? "radio-button-on" : "radio-button-off"}
                    size={18}
                    color={active ? MESSAGE_ACCENT : colors.textSecondary}
                  />
                </Pressable>
              );
            })}
          </View>

          {recipientsError && (
            <Text style={styles.errorText}>{recipientsError}</Text>
          )}

          {audience === "SELECTED" && (
            <View
              style={[
                styles.pickerCard,
                {
                  borderColor: colors.rowBorder,
                  backgroundColor: colors.cardBg,
                },
              ]}
            >
              <View
                style={[
                  styles.searchBox,
                  {
                    borderColor: colors.rowBorder,
                    backgroundColor: colors.inputBg,
                  },
                ]}
              >
                <Ionicons
                  name="search"
                  size={16}
                  color={colors.textSecondary}
                />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search name or email"
                  placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                  style={[styles.searchInput, { color: colors.textPrimary }]}
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.pickerHead}>
                <Pressable onPress={toggleAllShown} style={styles.selectAll}>
                  <Ionicons
                    name={allShownSelected ? "checkbox" : "square-outline"}
                    size={18}
                    color={
                      allShownSelected ? MESSAGE_ACCENT : colors.textSecondary
                    }
                  />
                  <Text
                    style={[
                      styles.selectAllText,
                      { color: colors.textPrimary },
                    ]}
                  >
                    {allShownSelected ? "Deselect shown" : "Select shown"}
                  </Text>
                </Pressable>
                <Text style={[styles.counter, { color: colors.textSecondary }]}>
                  {selected.size} selected
                </Text>
              </View>
              {filtered.map((r) => {
                const on = selected.has(r.id);
                return (
                  <Pressable
                    key={r.id}
                    onPress={() => toggle(r.id)}
                    style={[
                      styles.personRow,
                      { borderTopColor: colors.rowBorder },
                    ]}
                  >
                    <Ionicons
                      name={on ? "checkbox" : "square-outline"}
                      size={20}
                      color={on ? MESSAGE_ACCENT : colors.textSecondary}
                    />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        style={[
                          styles.personName,
                          { color: colors.textPrimary },
                        ]}
                        numberOfLines={1}
                      >
                        {r.name}
                      </Text>
                      <Text
                        style={[
                          styles.personEmail,
                          { color: colors.textSecondary },
                        ]}
                        numberOfLines={1}
                      >
                        {r.email}
                      </Text>
                    </View>
                    {!r.hasPush && (
                      <Ionicons
                        name="notifications-off-outline"
                        size={15}
                        color={colors.textSecondary}
                        accessibilityLabel="No phone notifications; they will see it in the app"
                      />
                    )}
                    <View
                      style={[
                        styles.roleBadge,
                        r.role === "SUPERVISOR" && styles.roleBadgeSupervisor,
                      ]}
                    >
                      <Text
                        style={[
                          styles.roleText,
                          r.role === "SUPERVISOR" && styles.roleTextSupervisor,
                        ]}
                      >
                        {r.role === "FOREMAN" ? "Foreman" : "Supervisor"}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
              {filtered.length === 0 && (
                <Text style={[styles.noMatch, { color: colors.textSecondary }]}>
                  No one matches your search
                </Text>
              )}
              <View style={styles.pushHint}>
                <Ionicons
                  name="notifications-off-outline"
                  size={13}
                  color={colors.textSecondary}
                />
                <Text
                  style={[styles.pushHintText, { color: colors.textSecondary }]}
                >
                  No phone notifications set up; they will see it in the app.
                </Text>
              </View>
            </View>
          )}
        </ScrollView>

        <View
          style={[
            styles.bottomBar,
            {
              backgroundColor: colors.barBg,
              borderTopColor: colors.rowBorder,
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          <Pressable
            style={[styles.sendBtn, !canReview && { opacity: 0.5 }]}
            onPress={() => setReviewing(true)}
            disabled={!canReview}
          >
            <Ionicons name="send" size={16} color="#fff" />
            <Text style={styles.sendBtnText}>
              {audienceCount > 0
                ? `Review & send to ${peopleLabel(audienceCount)}`
                : audience === "SELECTED"
                  ? "Pick at least one person"
                  : "Review & send"}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <Modal
        visible={reviewing}
        transparent
        animationType="fade"
        onRequestClose={sending ? undefined : () => setReviewing(false)}
      >
        <View style={styles.confirmOverlay}>
          <View
            style={[styles.confirmCard, { backgroundColor: colors.sheetBg }]}
          >
            <View style={styles.confirmIcon}>
              <Ionicons name="megaphone-outline" size={26} color="#3b82f6" />
            </View>
            <Text style={[styles.confirmTitle, { color: colors.textPrimary }]}>
              Send to {peopleLabel(audienceCount)}?
            </Text>
            <Text style={[styles.confirmNote, { color: colors.textSecondary }]}>
              {AUDIENCE_LABEL[audience]}. Each person gets a notification on
              their phone and in the app. This cannot be unsent.
            </Text>
            <ScrollView
              style={[styles.preview, { borderColor: colors.rowBorder }]}
              contentContainerStyle={{ padding: 12, gap: 6 }}
            >
              <Text
                style={[styles.previewTitle, { color: colors.textPrimary }]}
              >
                {title.trim()}
              </Text>
              <Text
                style={[styles.previewBody, { color: colors.textSecondary }]}
              >
                {body.trim()}
              </Text>
            </ScrollView>
            <View style={styles.confirmActions}>
              <Pressable
                style={[
                  styles.confirmBtn,
                  styles.outlineBtn,
                  { borderColor: colors.rowBorder },
                ]}
                onPress={() => setReviewing(false)}
                disabled={sending}
              >
                <Text
                  style={[styles.confirmBtnText, { color: colors.textPrimary }]}
                >
                  Back
                </Text>
              </Pressable>
              <Pressable
                style={[styles.confirmBtn, { backgroundColor: MESSAGE_ACCENT }]}
                onPress={send}
                disabled={sending}
              >
                {sending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={[styles.confirmBtnText, { color: "#fff" }]}>
                    Send
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </AuthStyleBackground>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32 },
  title: { fontSize: 18, fontWeight: "900" },
  subtitle: { fontSize: 12, fontWeight: "600", marginTop: 2, marginBottom: 6 },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 14,
    marginBottom: 6,
  },
  label: { fontSize: 12, fontWeight: "800" },
  sectionLabel: { marginTop: 18, marginBottom: 8 },
  counter: { fontSize: 11, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 12,
    height: 46,
    fontSize: 15,
    fontWeight: "600",
  },
  bodyInput: { height: 150, paddingTop: 12, textAlignVertical: "top" },

  audienceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  audienceCard: {
    width: "48.5%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 10,
    minHeight: 54,
  },
  audienceText: { flex: 1, fontSize: 13, fontWeight: "800" },

  errorText: {
    color: "#ef4444",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 10,
  },

  pickerCard: { borderWidth: 1, borderRadius: 5, marginTop: 12, padding: 10 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    height: 40,
    borderRadius: 5,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14 },
  pickerHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  selectAll: { flexDirection: "row", alignItems: "center", gap: 6 },
  selectAllText: { fontSize: 13, fontWeight: "800" },
  personRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  personName: { fontSize: 14, fontWeight: "800" },
  personEmail: { fontSize: 11, fontWeight: "500", marginTop: 1 },
  roleBadge: {
    backgroundColor: "rgba(249,115,22,0.15)",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  roleBadgeSupervisor: { backgroundColor: "rgba(139,92,246,0.15)" },
  roleText: { fontSize: 10, fontWeight: "800", color: "#ea580c" },
  roleTextSupervisor: { color: "#7c3aed" },
  noMatch: { textAlign: "center", paddingVertical: 16, fontSize: 13 },
  pushHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  pushHintText: { flex: 1, fontSize: 11, fontWeight: "500" },

  bottomBar: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
  sendBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 50,
    borderRadius: 5,
    backgroundColor: MESSAGE_ACCENT,
  },
  sendBtnText: { color: "#fff", fontSize: 15, fontWeight: "900" },

  confirmOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    padding: 24,
  },
  confirmCard: {
    borderRadius: 14,
    padding: 20,
    alignItems: "center",
    maxHeight: "85%",
  },
  confirmIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(59,130,246,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  confirmTitle: { fontSize: 18, fontWeight: "900", textAlign: "center" },
  confirmNote: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 6,
  },
  preview: {
    alignSelf: "stretch",
    borderWidth: 1,
    borderRadius: 8,
    marginTop: 14,
    maxHeight: 220,
  },
  previewTitle: { fontSize: 15, fontWeight: "800" },
  previewBody: { fontSize: 13, lineHeight: 19 },
  confirmActions: {
    alignSelf: "stretch",
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  confirmBtn: {
    flex: 1,
    height: 48,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  outlineBtn: { borderWidth: 1, backgroundColor: "transparent" },
  confirmBtnText: { fontSize: 15, fontWeight: "900" },
});
