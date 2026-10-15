import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { AuthStyleBackground } from "@/components/AuthStyleBackground";
import { PaintCalculator } from "@/components/calculator/PaintCalculator";
import { StandardCalculator } from "@/components/calculator/StandardCalculator";
import { CATALOGUE_ACCENT, catalogueThemes } from "@/lib/paintsCatalogue";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/themeContext";

type Tab = "PAINT" | "STANDARD";

const TABS: {
  key: Tab;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
}[] = [
  { key: "PAINT", label: "Paint", icon: "color-fill-outline" },
  { key: "STANDARD", label: "Standard", icon: "calculator-outline" },
];

export default function CalculatorScreen() {
  const { theme } = useTheme();
  const colors = catalogueThemes[theme];
  const isDark = theme === "dark";
  const { user } = useAuth();
  // The paint catalogue is admin/office only; everyone else gets the
  // standard calculator.
  const role = String(user?.role ?? "");
  const canUsePaint = role === "ADMIN" || role === "OFFICE";
  const [tab, setTab] = useState<Tab>(canUsePaint ? "PAINT" : "STANDARD");
  const tabs = canUsePaint ? TABS : TABS.filter((t) => t.key === "STANDARD");

  return (
    <AuthStyleBackground>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Calculator
          </Text>
          <View
            style={[
              styles.tabs,
              {
                backgroundColor: colors.inputBg,
                borderColor: colors.rowBorder,
              },
            ]}
          >
            {tabs.map((t) => {
              const active = tab === t.key;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => setTab(t.key)}
                  style={[
                    styles.tab,
                    active && { backgroundColor: CATALOGUE_ACCENT },
                  ]}
                >
                  <Ionicons
                    name={t.icon}
                    size={16}
                    color={active ? "#fff" : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.tabText,
                      { color: active ? "#fff" : colors.textSecondary },
                    ]}
                  >
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Both stay mounted so switching tabs keeps what was typed. */}
        {canUsePaint && (
          <View style={[styles.body, tab !== "PAINT" && styles.hidden]}>
            <PaintCalculator colors={colors} isDark={isDark} />
          </View>
        )}
        <View style={[styles.body, tab !== "STANDARD" && styles.hidden]}>
          <StandardCalculator colors={colors} isDark={isDark} />
        </View>
      </KeyboardAvoidingView>
    </AuthStyleBackground>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, gap: 12 },
  title: { fontSize: 18, fontWeight: "900" },
  tabs: { flexDirection: "row", borderRadius: 12, borderWidth: 1, padding: 4 },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 38,
    borderRadius: 9,
  },
  tabText: { fontSize: 14, fontWeight: "800" },
  body: { flex: 1 },
  hidden: { display: "none" },
});
