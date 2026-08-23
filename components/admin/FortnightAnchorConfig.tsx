import {
  formatFortnightAnchor,
  validateFortnightAnchor,
} from "@/lib/fortnightAdmin";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type ConfigResult = {
  valid: boolean;
  anchorISO: string;
  dayName: string;
  message: string;
  formattedDate?: string;
};

export function FortnightAnchorConfig() {
  const [dateInput, setDateInput] = useState("");
  const [result, setResult] = useState<ConfigResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleValidate = async () => {
    if (!dateInput) {
      setError("Please enter a date");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Validate the date
      const validation = validateFortnightAnchor(dateInput);

      if (!validation.valid) {
        setError(validation.message);
        setResult(null);
      } else {
        // Save to backend
        const res = await fetch("/api/admin/fortnight-config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dateISO: validation.anchorISO }),
        });

        const data = await res.json();

        if (data.success) {
          setResult({
            valid: true,
            anchorISO: validation.anchorISO,
            dayName: validation.dayName,
            message: validation.message,
            formattedDate: formatFortnightAnchor(validation.anchorISO),
          });
          setError(null);
          setDateInput("");
          Alert.alert(
            "Success",
            `Fortnight anchor set to ${data.formattedDate}`,
          );
        } else {
          setError(data.message);
          setResult(null);
        }
      }
    } catch (err: any) {
      setError(`Error: ${err.message}`);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Configure Fortnight Anchor</Text>
      <Text style={styles.subtitle}>
        Set the Saturday date that starts your pay fortnight
      </Text>

      <View style={styles.inputContainer}>
        <Text style={styles.label}>Select Date (YYYY-MM-DD):</Text>
        <TextInput
          style={styles.input}
          placeholder="2026-02-07"
          value={dateInput}
          onChangeText={setDateInput}
          editable={!loading}
          placeholderTextColor="#999"
        />
        <Text style={styles.hint}>
          📌 Tip: If not Saturday, system will auto-adjust to nearest Saturday
        </Text>
      </View>

      <Pressable
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleValidate}
        disabled={loading}
      >
        {loading ? (
          <>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={styles.buttonText}>Setting...</Text>
          </>
        ) : (
          <Text style={styles.buttonText}>Set Fortnight Anchor</Text>
        )}
      </Pressable>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>❌ {error}</Text>
        </View>
      )}

      {result && result.valid && (
        <View style={styles.successBox}>
          <Text style={styles.successTitle}>✅ Success!</Text>
          <Text style={styles.successText}>
            Fortnight Anchor: {result.formattedDate}
          </Text>
          <Text style={styles.successText}>Day: {result.dayName}</Text>
          <Text style={styles.successText}>ISO: {result.anchorISO}</Text>
          <Text style={styles.successNote}>{result.message}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginVertical: 12,
    marginHorizontal: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    fontSize: 18,
    fontWeight: "900",
    color: "#111",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    fontWeight: "600",
    marginBottom: 16,
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
    color: "#333",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    fontSize: 16,
    color: "#111",
    marginBottom: 8,
  },
  hint: {
    fontSize: 12,
    color: "#666",
    fontWeight: "500",
    fontStyle: "italic",
  },
  button: {
    backgroundColor: "#16A34A",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 14,
  },
  errorBox: {
    backgroundColor: "#fef5f5",
    borderLeftWidth: 4,
    borderLeftColor: "#b00020",
    borderRadius: 6,
    padding: 12,
    marginTop: 12,
  },
  errorText: {
    color: "#b00020",
    fontWeight: "700",
    fontSize: 14,
  },
  successBox: {
    backgroundColor: "#f0fdf4",
    borderLeftWidth: 4,
    borderLeftColor: "#1a7f37",
    borderRadius: 6,
    padding: 12,
    marginTop: 12,
  },
  successTitle: {
    color: "#1a7f37",
    fontWeight: "900",
    fontSize: 14,
    marginBottom: 8,
  },
  successText: {
    color: "#1a7f37",
    fontWeight: "600",
    fontSize: 13,
    marginBottom: 4,
  },
  successNote: {
    color: "#666",
    fontSize: 12,
    fontStyle: "italic",
    marginTop: 8,
  },
});
