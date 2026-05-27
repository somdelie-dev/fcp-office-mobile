import { useTheme } from "@/lib/themeContext";
import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

export interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: "default" | "cancel" | "destructive";
}

interface CustomAlertProps {
  visible: boolean;
  title: string;
  message: string;
  buttons: AlertButton[];
  onDismiss: () => void;
}

const themes = {
  dark: {
    bg: "#0b1220",
    bgSecondary: "#0f172a",
    border: "#1f2a44",
    textPrimary: "white",
    textSecondary: "#94a3b8",
    cardBg: "rgba(15,23,42,0.95)",
  },
  light: {
    bg: "#f8fafc",
    bgSecondary: "#ffffff",
    border: "#e2e8f0",
    textPrimary: "#0f172a",
    textSecondary: "#64748b",
    cardBg: "rgba(255,255,255,0.98)",
  },
};

export function CustomAlert({
  visible,
  title,
  message,
  buttons,
  onDismiss,
}: CustomAlertProps) {
  const { theme } = useTheme();
  const colors = themes[theme];

  const handleButtonPress = (button: AlertButton) => {
    if (button.onPress) {
      button.onPress();
    }
    onDismiss();
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <Pressable
        style={[styles.overlay, { backgroundColor: "rgba(0,0,0,0.5)" }]}
        onPress={onDismiss}
      >
        <Pressable
          style={[
            styles.alertBox,
            { backgroundColor: colors.cardBg, borderColor: colors.border },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            {title}
          </Text>
          <Text style={[styles.message, { color: colors.textSecondary }]}>
            {message}
          </Text>

          <View style={styles.buttonContainer}>
            {buttons.map((button, index) => (
              <Pressable
                key={index}
                style={[
                  styles.button,
                  {
                    borderTopColor: colors.border,
                    backgroundColor:
                      button.style === "cancel"
                        ? "transparent"
                        : button.style === "destructive"
                          ? "rgba(239, 68, 68, 0.08)"
                          : "transparent",
                  },
                ]}
                onPress={() => handleButtonPress(button)}
              >
                <View style={styles.buttonContent}>
                  <Text
                    style={[
                      styles.buttonText,
                      {
                        color:
                          button.style === "destructive"
                            ? "#ef4444"
                            : colors.textPrimary,
                        fontWeight: button.style === "cancel" ? "600" : "700",
                      },
                    ]}
                  >
                    {button.text}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  alertBox: {
    minWidth: 280,
    maxWidth: 320,
    borderRadius: 5,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 20,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    textAlign: "center",
  },
  message: {
    fontSize: 13,
    fontWeight: "500",
    paddingHorizontal: 20,
    paddingBottom: 16,
    textAlign: "center",
    lineHeight: 18,
  },
  buttonContainer: {
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.1)",
  },
  button: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  buttonContent: {
    justifyContent: "center",
    alignItems: "center",
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
});
