import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ForemanTutorial } from "@/components/ForemanTutorial";
import { GlassCard } from "@/components/GlassCard";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/themeContext";
import { resetTutorial } from "@/lib/tutorialPrefs";

// Enable LayoutAnimation on Android
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type FAQItem = {
  question: string;
  answer: string;
};

const faqs: FAQItem[] = [
  {
    question: "How do I scan a guy's attendance?",
    answer:
      "Navigate to the Scan tab and select your site. Point the camera at the guy's QR code. The scan will be recorded automatically. You can submit the batch when ready.",
  },
  {
    question: "How do I take site day photos?",
    answer:
      "Go to your site day from the History or Home screen, then tap the photo icon. Take a clear photo of the site. Photos are submitted for verification.",
  },
  {
    question: "What if I lose internet connection?",
    answer:
      "The app works offline! Your scans and data are saved locally. When you regain connection, sync your data from the Sync Queue screen.",
  },
  {
    question: "How do I view my timesheets?",
    answer:
      "Go to the Timesheets tab to see all your submitted timesheets. You can filter by date range and see approval status.",
  },
  {
    question: "How do I change my password?",
    answer:
      "Password changes must be done through the web portal or by contacting your supervisor. For security reasons, this cannot be done in the mobile app.",
  },
  {
    question: "Why can't I see some of my team?",
    answer:
      "You can only see team members assigned to your sites. If a guy is missing, contact your supervisor to ensure they are correctly assigned.",
  },
  {
    question: "What does the verification status mean?",
    answer:
      "PENDING means your submission is awaiting review. VERIFIED means it was approved. FLAGGED means it needs attention. REJECTED means you need to resubmit.",
  },
  {
    question: "How do I switch between sites?",
    answer:
      "Use the site picker at the top of the scan screen. Tap it to see all your assigned sites and select the one you want to work with.",
  },
];

export default function HelpScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user } = useAuth();
  const isDark = theme === "dark";

  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);

  const handleReplayTutorial = async () => {
    await resetTutorial();
    setShowTutorial(true);
  };

  const colors = {
    bg: isDark ? "#0f172a" : "#f8fafc",
    text: isDark ? "#f1f5f9" : "#0f172a",
    textMuted: isDark ? "#94a3b8" : "#64748b",
    cardBg: isDark ? "rgba(30, 41, 59, 0.8)" : "rgba(255,255,255,0.9)",
    border: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)",
    accent: isDark ? "#22c55e" : "#16A34A",
    success: "#22c55e",
    warning: "#f59e0b",
  };

  const toggleFAQ = (index: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  const handleEmail = () => {
    Linking.openURL("mailto:support@example.com?subject=App Support Request");
  };

  const handlePhone = () => {
    Linking.openURL("tel:+27123456789");
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.bg }]}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + 24 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>
          Help & Support
        </Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Find answers to common questions
        </Text>
      </View>

      {/* Quick Actions */}
      <GlassCard style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Contact Us
        </Text>

        <View style={styles.quickActions}>
          <Pressable
            style={[styles.quickAction, { borderColor: colors.border }]}
            onPress={handleEmail}
          >
            <View
              style={[
                styles.quickActionIcon,
                { backgroundColor: colors.accent + "15" },
              ]}
            >
              <Ionicons name="mail-outline" size={24} color={colors.accent} />
            </View>
            <Text style={[styles.quickActionLabel, { color: colors.text }]}>
              Email Support
            </Text>
            <Text style={[styles.quickActionHint, { color: colors.textMuted }]}>
              support@example.com
            </Text>
          </Pressable>

          <Pressable
            style={[styles.quickAction, { borderColor: colors.border }]}
            onPress={handlePhone}
          >
            <View
              style={[
                styles.quickActionIcon,
                { backgroundColor: colors.success + "15" },
              ]}
            >
              <Ionicons name="call-outline" size={24} color={colors.success} />
            </View>
            <Text style={[styles.quickActionLabel, { color: colors.text }]}>
              Call Support
            </Text>
            <Text style={[styles.quickActionHint, { color: colors.textMuted }]}>
              Mon-Fri 8am-5pm
            </Text>
          </Pressable>
        </View>
      </GlassCard>

      {/* FAQs */}
      <GlassCard style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Frequently Asked Questions
        </Text>

        {faqs.map((faq, index) => (
          <Pressable
            key={index}
            onPress={() => toggleFAQ(index)}
            style={[
              styles.faqItem,
              index < faqs.length - 1 && {
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              },
            ]}
          >
            <View style={styles.faqHeader}>
              <Text style={[styles.faqQuestion, { color: colors.text }]}>
                {faq.question}
              </Text>
              <Ionicons
                name={expandedIndex === index ? "chevron-up" : "chevron-down"}
                size={20}
                color={colors.textMuted}
              />
            </View>
            {expandedIndex === index && (
              <Text style={[styles.faqAnswer, { color: colors.textMuted }]}>
                {faq.answer}
              </Text>
            )}
          </Pressable>
        ))}
      </GlassCard>

      {/* Tips */}
      <GlassCard style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Tips & Best Practices
        </Text>

        <TipRow
          icon="wifi-outline"
          title="Stay Connected"
          description="Sync your data regularly when you have internet connection"
          colors={colors}
        />
        <TipRow
          icon="camera-outline"
          title="Clear Photos"
          description="Take photos in good lighting for faster verification"
          colors={colors}
        />
        <TipRow
          icon="battery-charging-outline"
          title="Battery Saver"
          description="Keep your phone charged when using the scanner frequently"
          colors={colors}
        />
        <TipRow
          icon="refresh-outline"
          title="Regular Updates"
          description="Keep the app updated for the best experience"
          colors={colors}
          last
        />
      </GlassCard>

      {/* Replay Tutorial */}
      <GlassCard style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          App Tutorial
        </Text>
        <Pressable
          style={[
            styles.replayBtn,
            {
              backgroundColor: colors.accent + "12",
              borderColor: colors.accent + "30",
            },
          ]}
          onPress={handleReplayTutorial}
        >
          <Ionicons
            name="play-circle-outline"
            size={22}
            color={colors.accent}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.replayBtnTitle, { color: colors.text }]}>
              Replay Tutorial
            </Text>
            <Text style={[styles.replayBtnHint, { color: colors.textMuted }]}>
              Walk through all the app features again
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      </GlassCard>

      {/* Logged in as */}
      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: colors.textMuted }]}>
          Logged in as {user?.name ?? "User"}
        </Text>
        <Text style={[styles.footerHint, { color: colors.textMuted }]}>
          {user?.role ?? "USER"} • {user?.email ?? ""}
        </Text>
      </View>

      {showTutorial && (
        <ForemanTutorial forceShow onDone={() => setShowTutorial(false)} />
      )}
    </ScrollView>
  );
}

type TipRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  colors: any;
  last?: boolean;
};

function TipRow({ icon, title, description, colors, last }: TipRowProps) {
  return (
    <View
      style={[
        styles.tipRow,
        !last && { borderBottomWidth: 1, borderBottomColor: colors.border },
      ]}
    >
      <View
        style={[styles.tipIcon, { backgroundColor: colors.warning + "15" }]}
      >
        <Ionicons name={icon} size={18} color={colors.warning} />
      </View>
      <View style={styles.tipContent}>
        <Text style={[styles.tipTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.tipDescription, { color: colors.textMuted }]}>
          {description}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  header: {
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 12,
  },
  quickActions: {
    flexDirection: "row",
    gap: 12,
  },
  quickAction: {
    flex: 1,
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  quickActionLabel: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 2,
  },
  quickActionHint: {
    fontSize: 11,
    fontWeight: "600",
  },
  faqItem: {
    paddingVertical: 14,
  },
  faqHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  faqQuestion: {
    fontSize: 14,
    fontWeight: "700",
    flex: 1,
    paddingRight: 12,
  },
  faqAnswer: {
    fontSize: 13,
    lineHeight: 20,
    marginTop: 10,
  },
  tipRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  tipIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  tipContent: {
    flex: 1,
  },
  tipTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  tipDescription: {
    fontSize: 12,
    marginTop: 2,
  },
  footer: {
    alignItems: "center",
    paddingVertical: 16,
  },
  footerText: {
    fontSize: 13,
    fontWeight: "600",
  },
  footerHint: {
    fontSize: 11,
    marginTop: 2,
  },
  replayBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  replayBtnTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  replayBtnHint: {
    fontSize: 12,
    marginTop: 2,
  },
});
