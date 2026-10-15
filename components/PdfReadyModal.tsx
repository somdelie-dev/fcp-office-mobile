import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Alert, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { openPdf, sharePdf } from "@/lib/pdfFiles";

type Colors = {
  textPrimary: string;
  textSecondary: string;
  rowBorder: string;
  sheetBg: string;
};

/** Shown after a PDF download: where it was saved, plus Open and Share. */
export function PdfReadyModal({
  pdf,
  shareTitle,
  colors,
  onClose,
}: {
  pdf: { uri: string; filename: string; saved: boolean } | null;
  shareTitle: string;
  colors: Colors;
  onClose: () => void;
}) {
  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (e: any) {
      Alert.alert("Couldn't open the PDF", e?.message ?? "Please try again.");
    }
  };

  return (
    <Modal
      visible={!!pdf}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        {pdf && (
          <View style={[styles.card, { backgroundColor: colors.sheetBg }]}>
            <Ionicons name="checkmark-circle" size={44} color="#22c55e" />
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              PDF ready
            </Text>
            <Text
              style={[styles.text, { color: colors.textSecondary }]}
              numberOfLines={2}
            >
              {pdf.saved
                ? `Saved to your phone as ${pdf.filename}`
                : pdf.filename}
            </Text>
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              Open it to view or print, or share it to WhatsApp or email.
            </Text>
            <View style={styles.actions}>
              <Pressable
                style={[styles.btn, { backgroundColor: "#22c55e" }]}
                onPress={() => run(() => openPdf(pdf.uri))}
              >
                <Ionicons name="document-text-outline" size={18} color="#fff" />
                <Text style={[styles.btnText, { color: "#fff" }]}>Open</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.btn,
                  styles.outline,
                  { borderColor: colors.rowBorder },
                ]}
                onPress={() => run(() => sharePdf(pdf.uri, shareTitle))}
              >
                <Ionicons
                  name="share-outline"
                  size={18}
                  color={colors.textPrimary}
                />
                <Text style={[styles.btnText, { color: colors.textPrimary }]}>
                  Share
                </Text>
              </Pressable>
            </View>
            <Pressable onPress={onClose} style={styles.done} hitSlop={8}>
              <Text style={[styles.doneText, { color: colors.textSecondary }]}>
                Done
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    padding: 24,
  },
  card: { borderRadius: 14, padding: 20, alignItems: "center", gap: 6 },
  title: { fontSize: 18, fontWeight: "900" },
  text: { fontSize: 13, fontWeight: "700", textAlign: "center" },
  hint: { fontSize: 12, fontWeight: "500", textAlign: "center" },
  actions: {
    alignSelf: "stretch",
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  btn: {
    flex: 1,
    height: 48,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  outline: { borderWidth: 1, backgroundColor: "transparent" },
  btnText: { fontSize: 15, fontWeight: "900" },
  done: { marginTop: 10, padding: 6 },
  doneText: { fontSize: 14, fontWeight: "800" },
});
