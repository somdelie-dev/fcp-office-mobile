import { Ionicons } from "@expo/vector-icons";
import { useVideoPlayer, VideoView } from "expo-video";
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

import { GlassCard } from "@/components/GlassCard";
import { useTheme } from "@/lib/themeContext";
import { TUTORIAL_TOPICS } from "@/lib/tutorialTopics";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const videoSource = require("@/assets/tutorial.mp4");

type SubTab = "video" | "text";

export default function TutorialScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [subTab, setSubTab] = useState<SubTab>("video");

  const colors = {
    bg: isDark ? "#0f172a" : "#f8fafc",
    text: isDark ? "#f1f5f9" : "#0f172a",
    textMuted: isDark ? "#94a3b8" : "#64748b",
    border: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)",
    accent: isDark ? "#22c55e" : "#16A34A",
    segmentBg: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
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
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Tutorial</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Watch the walkthrough or read how-to guides
        </Text>
      </View>

      <View style={[styles.segmented, { backgroundColor: colors.segmentBg }]}>
        <SegmentButton
          label="Video"
          icon="play-circle"
          active={subTab === "video"}
          accent={colors.accent}
          textColor={colors.text}
          mutedColor={colors.textMuted}
          onPress={() => setSubTab("video")}
        />
        <SegmentButton
          label="Text"
          icon="reader"
          active={subTab === "text"}
          accent={colors.accent}
          textColor={colors.text}
          mutedColor={colors.textMuted}
          onPress={() => setSubTab("text")}
        />
      </View>

      {subTab === "video" ? (
        <VideoTab colors={colors} />
      ) : (
        <TextTab colors={colors} />
      )}
    </ScrollView>
  );
}

function SegmentButton({
  label,
  icon,
  active,
  accent,
  textColor,
  mutedColor,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  accent: string;
  textColor: string;
  mutedColor: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.segment, active && { backgroundColor: accent }]}
    >
      <Ionicons
        name={icon}
        size={16}
        color={active ? "#fff" : mutedColor}
      />
      <Text
        style={[
          styles.segmentLabel,
          { color: active ? "#fff" : mutedColor },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function VideoTab({ colors }: { colors: Record<string, string> }) {
  const player = useVideoPlayer(videoSource, (p) => {
    p.loop = false;
  });

  return (
    <GlassCard style={styles.videoCard}>
      <VideoView
        style={styles.video}
        player={player}
        contentFit="contain"
        allowsFullscreen
        allowsPictureInPicture
        nativeControls
      />
      <Text style={[styles.videoHint, { color: colors.textMuted }]}>
        Full walkthrough of the foreman app, from signing in to submitting
        your timesheets.
      </Text>
    </GlassCard>
  );
}

function TextTab({ colors }: { colors: Record<string, string> }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const toggle = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(expanded === id ? null : id);
  };

  return (
    <GlassCard style={styles.section}>
      {TUTORIAL_TOPICS.map((topic, index) => {
        const isOpen = expanded === topic.id;
        return (
          <Pressable
            key={topic.id}
            onPress={() => toggle(topic.id)}
            style={[
              styles.topicItem,
              index < TUTORIAL_TOPICS.length - 1 && {
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              },
            ]}
          >
            <View style={styles.topicHeader}>
              <View style={styles.topicHeaderLeft}>
                <View
                  style={[
                    styles.topicIcon,
                    { backgroundColor: topic.accent + "18" },
                  ]}
                >
                  <Ionicons name={topic.icon} size={18} color={topic.accent} />
                </View>
                <Text style={[styles.topicTitle, { color: colors.text }]}>
                  {topic.title}
                </Text>
              </View>
              <Ionicons
                name={isOpen ? "chevron-up" : "chevron-down"}
                size={20}
                color={colors.textMuted}
              />
            </View>

            {isOpen && (
              <View style={styles.stepsList}>
                {topic.steps.map((step, stepIndex) => (
                  <View key={stepIndex} style={styles.stepRow}>
                    <Text style={[styles.stepNumber, { color: topic.accent }]}>
                      {stepIndex + 1}
                    </Text>
                    <Text
                      style={[styles.stepText, { color: colors.textMuted }]}
                    >
                      {step}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </Pressable>
        );
      })}
    </GlassCard>
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
    marginBottom: 4,
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
  segmented: {
    flexDirection: "row",
    padding: 4,
    borderRadius: 12,
    gap: 4,
  },
  segment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
  },
  segmentLabel: {
    fontSize: 13,
    fontWeight: "800",
  },
  videoCard: {
    padding: 12,
    gap: 12,
  },
  video: {
    width: "100%",
    aspectRatio: 9 / 16,
    maxHeight: 520,
    borderRadius: 10,
    backgroundColor: "#000",
  },
  videoHint: {
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 4,
  },
  section: {
    padding: 16,
  },
  topicItem: {
    paddingVertical: 14,
  },
  topicHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  topicHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
    paddingRight: 12,
  },
  topicIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  topicTitle: {
    fontSize: 14,
    fontWeight: "700",
    flex: 1,
  },
  stepsList: {
    marginTop: 12,
    gap: 10,
    paddingLeft: 4,
  },
  stepRow: {
    flexDirection: "row",
    gap: 10,
  },
  stepNumber: {
    fontSize: 13,
    fontWeight: "800",
    width: 16,
  },
  stepText: {
    fontSize: 13,
    lineHeight: 20,
    flex: 1,
  },
});
