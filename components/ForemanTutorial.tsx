import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useTheme } from "@/lib/themeContext";
import {
  isTutorialCompleted,
  setTutorialCompleted,
} from "@/lib/tutorialPrefs";

/* ------------------------------------------------------------------ */
/*  Tutorial step definitions                                         */
/* ------------------------------------------------------------------ */

type Step = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  accent: string;
};

const STEPS: Step[] = [
  {
    icon: "home",
    title: "Welcome to Your Dashboard",
    body: "This is your Home screen. You'll see today's date, your assigned sites, how many team members have been scanned, and the current day status at a glance.",
    accent: "#38bdf8",
  },
  {
    icon: "qr-code",
    title: "Scan Guy Attendance",
    body: "Tap the Scan tab to open the camera. Point it at a guy's QR badge — you'll hear a beep on success. Scans are saved locally and sync automatically when you're online.",
    accent: "#22c55e",
  },
  {
    icon: "people",
    title: "Manage Your Team",
    body: "The Team tab shows everyone assigned to your site. You can search by name or code, view details, and add new guys with the + button.",
    accent: "#a78bfa",
  },
  {
    icon: "document-text",
    title: "Track Timesheets",
    body: "The Timesheets tab shows fortnightly pay periods. Each timesheet displays the date range, status, total days worked, and wages. Tap one to see the full day-by-day breakdown.",
    accent: "#f59e0b",
  },
  {
    icon: "time",
    title: "Review Your History",
    body: "The History tab lists past attendance days. Tap a day to view scans, add notes, or mark it as ready for your supervisor to review.",
    accent: "#ec4899",
  },
  {
    icon: "camera",
    title: "Site Day Photos",
    body: "When your supervisor requests a photo, you'll see an alert on the Home screen. Take clear photos — they're compressed and uploaded automatically, even offline.",
    accent: "#14b8a6",
  },
  {
    icon: "cloud-offline",
    title: "Works Offline",
    body: "No signal on site? No problem. Scans, photos, and data are saved locally and sync when you're back online. Check your sync queue in Settings anytime.",
    accent: "#6366f1",
  },
  {
    icon: "checkmark-circle",
    title: "You're All Set!",
    body: "That's everything you need to get started. You can replay this tutorial anytime from the Help screen. Have a great day on site!",
    accent: "#22c55e",
  },
];

/* ------------------------------------------------------------------ */
/*  Theme colours                                                     */
/* ------------------------------------------------------------------ */

const palette = {
  dark: {
    overlay: "rgba(0,0,0,0.82)",
    card: "#0f172a",
    cardBorder: "rgba(56,189,248,0.25)",
    text: "#f1f5f9",
    muted: "#94a3b8",
    dot: "#334155",
    dotActive: "#38bdf8",
    skip: "#64748b",
  },
  light: {
    overlay: "rgba(0,0,0,0.60)",
    card: "#ffffff",
    cardBorder: "rgba(0,0,0,0.08)",
    text: "#0f172a",
    muted: "#64748b",
    dot: "#cbd5e1",
    dotActive: "#262D68",
    skip: "#94a3b8",
  },
};

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

type Props = {
  /** Force-show even if already completed (e.g. "Replay tutorial") */
  forceShow?: boolean;
  onDone?: () => void;
};

export function ForemanTutorial({ forceShow, onDone }: Props) {
  const { theme } = useTheme();
  const colors = palette[theme];

  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  // Check if we should show
  useEffect(() => {
    if (forceShow) {
      setVisible(true);
      return;
    }
    isTutorialCompleted().then((done) => {
      if (!done) setVisible(true);
    });
  }, [forceShow]);

  // Animate card on step change
  useEffect(() => {
    if (!visible) return;
    fadeAnim.setValue(0);
    slideAnim.setValue(30);
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, [step, visible, fadeAnim, slideAnim]);

  const finish = useCallback(() => {
    setTutorialCompleted();
    setVisible(false);
    onDone?.();
  }, [onDone]);

  const next = useCallback(() => {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      finish();
    }
  }, [step, finish]);

  const prev = useCallback(() => {
    if (step > 0) setStep((s) => s - 1);
  }, [step]);

  if (!visible) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;
  const { width } = Dimensions.get("window");

  return (
    <View style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor: colors.overlay }]}>
      <View style={styles.center}>
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.cardBorder,
              maxWidth: width - 48,
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* Icon circle */}
          <View style={[styles.iconCircle, { backgroundColor: current.accent + "18" }]}>
            <Ionicons name={current.icon} size={36} color={current.accent} />
          </View>

          {/* Step counter */}
          <Text style={[styles.stepLabel, { color: colors.muted }]}>
            Step {step + 1} of {STEPS.length}
          </Text>

          {/* Title */}
          <Text style={[styles.title, { color: colors.text }]}>{current.title}</Text>

          {/* Body */}
          <Text style={[styles.body, { color: colors.muted }]}>{current.body}</Text>

          {/* Dots */}
          <View style={styles.dots}>
            {STEPS.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  {
                    backgroundColor: i === step ? colors.dotActive : colors.dot,
                    width: i === step ? 20 : 8,
                  },
                ]}
              />
            ))}
          </View>

          {/* Buttons */}
          <View style={styles.buttons}>
            {!isFirst ? (
              <Pressable style={[styles.btnSecondary, { borderColor: colors.cardBorder }]} onPress={prev}>
                <Ionicons name="arrow-back" size={18} color={colors.muted} />
                <Text style={[styles.btnSecondaryText, { color: colors.muted }]}>Back</Text>
              </Pressable>
            ) : (
              <View style={{ flex: 1 }} />
            )}

            <Pressable
              style={[styles.btnPrimary, { backgroundColor: current.accent }]}
              onPress={next}
            >
              <Text style={styles.btnPrimaryText}>{isLast ? "Get Started" : "Next"}</Text>
              {!isLast && <Ionicons name="arrow-forward" size={18} color="#fff" />}
            </Pressable>
          </View>

          {/* Skip */}
          {!isLast && (
            <Pressable style={styles.skip} onPress={finish}>
              <Text style={[styles.skipText, { color: colors.skip }]}>Skip tutorial</Text>
            </Pressable>
          )}
        </Animated.View>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles                                                            */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  overlay: {
    zIndex: 9999,
    justifyContent: "center",
    alignItems: "center",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    borderRadius: 20,
    borderWidth: 1,
    padding: 28,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  stepLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 10,
  },
  body: {
    fontSize: 15,
    fontWeight: "500",
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 20,
  },
  dots: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 24,
    alignItems: "center",
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  buttons: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  btnPrimary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
  },
  btnPrimaryText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 15,
  },
  btnSecondary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  btnSecondaryText: {
    fontWeight: "700",
    fontSize: 15,
  },
  skip: {
    marginTop: 16,
    paddingVertical: 8,
  },
  skipText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
