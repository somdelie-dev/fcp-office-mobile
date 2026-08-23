import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as WebBrowser from "expo-web-browser";

import { useTheme } from "../lib/themeContext";
import { getToken, getApiBase } from "../lib/api";
import {
  getCurrentFortnight,
  getFortnightForDate,
  type Fortnight,
} from "../lib/fortnight";

type DownloadTimesheetsModalProps = {
  visible: boolean;
  onClose: () => void;
};

const themes = {
  dark: {
    bg: "#0b1220",
    bgSecondary: "#0f172a",
    border: "#1f2a44",
    textPrimary: "white",
    textSecondary: "#94a3b8",
    accent: "#22c55e",
    error: "#dc2626",
    modalOverlay: "rgba(0,0,0,0.6)",
    buttonBg: "rgba(148,163,184,0.2)",
    sheetBg: "#0f172a",
    sheetHandle: "rgba(148,163,184,0.35)",
  },
  light: {
    bg: "#f8fafc",
    bgSecondary: "#ffffff",
    border: "#e2e8f0",
    textPrimary: "#0f172a",
    textSecondary: "#64748b",
    accent: "#16A34A",
    error: "#ef4444",
    modalOverlay: "rgba(0,0,0,0.4)",
    buttonBg: "rgba(100,116,139,0.1)",
    sheetBg: "#ffffff",
    sheetHandle: "rgba(100,116,139,0.35)",
  },
};

function prettyRange(startISO: string, endISO: string) {
  const a = new Date(`${startISO}T00:00:00.000Z`);
  const b = new Date(`${endISO}T00:00:00.000Z`);
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return `${fmt(a)} – ${fmt(b)}`;
}

function safeFileName(value: string) {
  return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/-+/g, "-");
}

export default function DownloadTimesheetsModal({
  visible,
  onClose,
}: DownloadTimesheetsModalProps) {
  const { theme } = useTheme();
  const colors = themes[theme];
  const insets = useSafeAreaInsets();

  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [loadingPeriods, setLoadingPeriods] = useState(true);
  const [periodsError, setPeriodsError] = useState<string | null>(null);
  const [pdfUri, setPdfUri] = useState<string | null>(null);
  const [pdfFilename, setPdfFilename] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [sharingPdf, setSharingPdf] = useState(false);

  const periods = useMemo(() => {
    // Current + previous 5 fortnights (enough for a supervisor UI)
    const current = getCurrentFortnight();
    const out: Fortnight[] = [];
    let cursorStart = new Date(`${current.startISO}T00:00:00.000Z`);
    for (let i = 0; i < 6; i++) {
      const dateISO = cursorStart.toISOString().slice(0, 10);
      const f = getFortnightForDate(dateISO);
      out.push(f);
      cursorStart = new Date(cursorStart.getTime() - 14 * 24 * 60 * 60 * 1000);
    }
    return out;
  }, []);

  useEffect(() => {
    console.log("DownloadTimesheetsModal periods:", periods);
    if (!visible) return;
    setLoadingPeriods(true);
    setPeriodsError(null);
    setSelectedPeriodId(periods[0]?.id ?? null);
    setPdfUri(null);
    setPdfFilename(null);
    setLoadingPeriods(false);
  }, [visible, periods]);

  const generatePdf = useCallback(async () => {
    if (!selectedPeriodId) {
      Alert.alert(
        "Selection Required",
        "Please select a fortnight to preview.",
      );
      return null;
    }

    setGeneratingPdf(true);
    try {
      const token = await getToken();
      if (!token) {
        Alert.alert("Unauthorized", "Please sign in again.");
        return null;
      }

      const base = getApiBase();
      const url = `${base}/api/app/supervisor/timesheets/periods?layout=quick-view&periodId=${encodeURIComponent(
        selectedPeriodId,
      )}`;

      const p = periods.find((x) => x.id === selectedPeriodId);
      const stamp = new Date()
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "");
      const filename = safeFileName(
        p
          ? `supervisor-timesheet-${p.startISO}-${p.endISO}-${stamp}.pdf`
          : `supervisor-timesheet-${selectedPeriodId}-${stamp}.pdf`,
      );
      const destination = new File(Paths.cache, filename);

      const result = await File.downloadFileAsync(url, destination, {
        headers: { Authorization: `Bearer ${token}` },
        idempotent: true,
      });

      setPdfUri(result.uri);
      setPdfFilename(filename);
      return { uri: result.uri, filename };
    } catch (e: any) {
      Alert.alert(
        "Preview Failed",
        e?.message ?? "Failed to generate the PDF preview.",
      );
      return null;
    } finally {
      setGeneratingPdf(false);
    }
  }, [selectedPeriodId, periods]);

  const ensurePdf = useCallback(async () => {
    if (pdfUri && pdfFilename) return { uri: pdfUri, filename: pdfFilename };
    return generatePdf();
  }, [pdfUri, pdfFilename, generatePdf]);

  const handlePreviewPdf = useCallback(async () => {
    try {
      if (!selectedPeriodId) {
        Alert.alert(
          "Selection Required",
          "Please select a fortnight to preview.",
        );
        return;
      }

      const token = await getToken();
      if (!token) {
        Alert.alert("Unauthorized", "Please sign in again.");
        return;
      }

      const base = getApiBase();
      const url = `${base}/api/app/supervisor/timesheets/periods?layout=quick-view&periodId=${encodeURIComponent(
        selectedPeriodId,
      )}&token=${encodeURIComponent(token)}`;
      await WebBrowser.openBrowserAsync(url);
    } catch (e: any) {
      Alert.alert("Preview Failed", e?.message ?? "Failed to open preview.");
    }
  }, [selectedPeriodId]);

  const handleSharePdf = useCallback(async () => {
    const pdf = await ensurePdf();
    if (!pdf) return;

    setSharingPdf(true);
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert("Share Unavailable", "Sharing is not available here.");
        return;
      }

      await Sharing.shareAsync(pdf.uri, {
        mimeType: "application/pdf",
        UTI: "com.adobe.pdf",
        dialogTitle: "Share supervisor timesheet",
      });
    } catch (e: any) {
      Alert.alert("Share Failed", e?.message ?? "Failed to share the PDF.");
    } finally {
      setSharingPdf(false);
    }
  }, [ensurePdf]);

  const handlePrintPdf = useCallback(async () => {
    const pdf = await ensurePdf();
    if (!pdf) return;

    setSharingPdf(true);
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert("PDF Ready", `Saved in app storage: ${pdf.uri}`);
        return;
      }

      await Sharing.shareAsync(pdf.uri, {
        mimeType: "application/pdf",
        UTI: "com.adobe.pdf",
        dialogTitle: "Print supervisor timesheet",
      });
    } catch (e: any) {
      Alert.alert("Print Failed", e?.message ?? "Failed to print the PDF.");
    } finally {
      setSharingPdf(false);
    }
  }, [ensurePdf]);

  const resetGeneratedPdf = useCallback(() => {
    setPdfUri(null);
    setPdfFilename(null);
  }, []);

  const currentPeriodLabel = useMemo(() => {
    const p = periods.find((x) => x.id === selectedPeriodId);
    return p ? prettyRange(p.startISO, p.endISO) : "Select Fortnight";
  }, [periods, selectedPeriodId]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        style={[styles.modalOverlay, { backgroundColor: colors.modalOverlay }]}
      >
        <Pressable
          onPress={() => {}}
          style={[
            styles.modalContent,
            {
              backgroundColor: colors.sheetBg,
              borderColor: colors.border,
              paddingBottom: insets.bottom + 14,
            },
          ]}
        >
          <View
            style={[
              styles.sheetHandle,
              { backgroundColor: colors.sheetHandle },
            ]}
          />

          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
              Download Timesheet
            </Text>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>

          <Text
            style={[styles.modalDescription, { color: colors.textSecondary }]}
          >
            Select a fortnight to download the supervisor timesheet.
          </Text>

          {loadingPeriods ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={{ color: colors.textSecondary, marginLeft: 10 }}>
                Loading periods...
              </Text>
            </View>
          ) : periodsError ? (
            <View style={styles.errorContainer}>
              <Text style={{ color: colors.error }}>{periodsError}</Text>
              <Pressable onPress={onClose} style={styles.retryButton}>
                <Text style={{ color: colors.textPrimary }}>Close</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.periodSelectorContainer}>
              <Text
                style={[styles.periodLabel, { color: colors.textSecondary }]}
              >
                Fortnight:
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.periodPillsContainer}
              >
                {periods.map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => {
                      setSelectedPeriodId(p.id);
                      resetGeneratedPdf();
                    }}
                    style={[
                      styles.periodPill,
                      {
                        borderColor:
                          p.id === selectedPeriodId
                            ? colors.accent
                            : colors.border,
                        backgroundColor:
                          p.id === selectedPeriodId
                            ? `${colors.accent}15`
                            : colors.bgSecondary,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color:
                          p.id === selectedPeriodId
                            ? colors.accent
                            : colors.textPrimary,
                      }}
                    >
                      {prettyRange(p.startISO, p.endISO)}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          <Pressable
            onPress={handlePreviewPdf}
            disabled={generatingPdf || sharingPdf || !selectedPeriodId}
            style={[
              styles.downloadButton,
              {
                backgroundColor:
                  generatingPdf || sharingPdf || !selectedPeriodId
                    ? colors.buttonBg
                    : colors.accent,
              },
            ]}
          >
            {generatingPdf ? (
              <ActivityIndicator color={colors.textPrimary} />
            ) : (
              <Ionicons
                name="eye-outline"
                size={20}
                color={colors.textPrimary}
              />
            )}
            <Text
              style={[styles.downloadButtonText, { color: colors.textPrimary }]}
            >
              {generatingPdf
                ? "Preparing..."
                : `View Timesheet (${currentPeriodLabel})`}
            </Text>
          </Pressable>

          <View style={styles.secondaryActions}>
              <Pressable
                onPress={handlePrintPdf}
                disabled={sharingPdf || generatingPdf || !selectedPeriodId}
                style={[
                  styles.secondaryButton,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.bgSecondary,
                  },
                ]}
              >
                <Ionicons
                  name="print-outline"
                  size={18}
                  color={colors.accent}
                />
                <Text
                  style={[styles.secondaryButtonText, { color: colors.accent }]}
                >
                  Print
                </Text>
              </Pressable>

              <Pressable
                onPress={handleSharePdf}
                disabled={sharingPdf || generatingPdf || !selectedPeriodId}
                style={[
                  styles.secondaryButton,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.bgSecondary,
                  },
                ]}
              >
                <Ionicons
                  name="share-social-outline"
                  size={18}
                  color={colors.accent}
                />
                <Text
                  style={[styles.secondaryButtonText, { color: colors.accent }]}
                >
                  Share
                </Text>
              </Pressable>
            </View>
        </Pressable>
      </Pressable>

    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 8,
    borderWidth: 1,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 48,
    height: 5,
    borderRadius: 999,
    marginBottom: 10,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  closeButton: {
    padding: 5,
  },
  modalDescription: {
    fontSize: 13,
    marginBottom: 15,
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
  },
  errorContainer: {
    paddingVertical: 20,
    alignItems: "center",
  },
  retryButton: {
    marginTop: 10,
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#16A34A",
  },
  periodSelectorContainer: {
    marginBottom: 20,
  },
  periodLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  periodPillsContainer: {
    flexDirection: "row",
    gap: 8,
    paddingBottom: 5,
  },
  periodPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  downloadButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 10,
  },
  secondaryActions: {
    marginTop: 10,
    flexDirection: "row",
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: "700",
  },
  downloadButtonText: {
    fontSize: 16,
    fontWeight: "700",
  },
});
