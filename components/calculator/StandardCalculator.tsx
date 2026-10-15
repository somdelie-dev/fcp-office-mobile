import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import {
  evaluate,
  formatExpression,
  formatNumber,
} from "@/lib/calculatorEngine";
import type { CatalogueColors } from "@/lib/paintsCatalogue";

type Key = { label: string; kind: "num" | "op" | "fn" | "eq" };

const KEYS: Key[][] = [
  [
    { label: "AC", kind: "fn" },
    { label: "( )", kind: "fn" },
    { label: "%", kind: "fn" },
    { label: "÷", kind: "op" },
  ],
  [
    { label: "7", kind: "num" },
    { label: "8", kind: "num" },
    { label: "9", kind: "num" },
    { label: "×", kind: "op" },
  ],
  [
    { label: "4", kind: "num" },
    { label: "5", kind: "num" },
    { label: "6", kind: "num" },
    { label: "−", kind: "op" },
  ],
  [
    { label: "1", kind: "num" },
    { label: "2", kind: "num" },
    { label: "3", kind: "num" },
    { label: "+", kind: "op" },
  ],
  [
    { label: "±", kind: "fn" },
    { label: "0", kind: "num" },
    { label: ".", kind: "num" },
    { label: "=", kind: "eq" },
  ],
];

const OPERATORS = ["+", "−", "×", "÷"];

const DEPTH = 6;
const SCREEN_TEXT = "#f8fafc";
const SCREEN_DIM = "#94a3b8";

type Palette = {
  face: [string, string];
  edge: string;
  text: string;
  light: boolean;
};

function paletteFor(kind: Key["kind"], isDark: boolean): Palette {
  if (kind === "eq") {
    return {
      face: ["#4ade80", "#16a34a"],
      edge: "#14532d",
      text: "#fff",
      light: false,
    };
  }
  if (kind === "op") {
    return {
      face: ["#34d399", "#059669"],
      edge: "#064e3b",
      text: "#fff",
      light: false,
    };
  }
  if (kind === "fn") {
    return isDark
      ? {
          face: ["#64748b", "#475569"],
          edge: "#1e293b",
          text: "#f8fafc",
          light: false,
        }
      : {
          face: ["#e2e8f0", "#cbd5e1"],
          edge: "#94a3b8",
          text: "#0f172a",
          light: true,
        };
  }
  return isDark
    ? {
        face: ["#475569", "#334155"],
        edge: "#0f172a",
        text: "#f8fafc",
        light: false,
      }
    : {
        face: ["#ffffff", "#e2e8f0"],
        edge: "#a8b3c4",
        text: "#0f172a",
        light: true,
      };
}

function tap() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Index where the trailing number of the expression starts, or -1. */
function lastNumberStart(expr: string) {
  const m = expr.match(/[0-9.]+$/);
  return m ? expr.length - m[0].length : -1;
}

/**
 * A raised key: a gradient cap sitting on a darker edge. Pressing drops the
 * cap onto the edge, so it reads as a physical button going down.
 */
function Key3D({
  label,
  palette,
  small,
  onPress,
}: {
  label: string;
  palette: Palette;
  small: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.keyOuter}
      accessibilityLabel={label}
    >
      {({ pressed }) => (
        <View
          style={[
            styles.keyEdge,
            {
              backgroundColor: palette.edge,
              marginTop: pressed ? DEPTH - 2 : 0,
              paddingBottom: pressed ? 2 : DEPTH,
              elevation: pressed ? 1 : 6,
              shadowOpacity: pressed ? 0.1 : 0.3,
            },
          ]}
        >
          <LinearGradient colors={palette.face} style={styles.keyFace}>
            <View style={styles.keyShine} />
            <Text
              style={[
                styles.keyText,
                small && styles.fnText,
                {
                  color: palette.text,
                  textShadowColor: palette.light
                    ? "rgba(255,255,255,0.9)"
                    : "rgba(0,0,0,0.35)",
                },
              ]}
            >
              {label}
            </Text>
          </LinearGradient>
        </View>
      )}
    </Pressable>
  );
}

export function StandardCalculator({
  isDark,
}: {
  colors: CatalogueColors;
  isDark: boolean;
}) {
  const [expr, setExpr] = useState("");
  const [justEvaluated, setJustEvaluated] = useState(false);
  const [history, setHistory] = useState<{ expr: string; result: number }[]>(
    [],
  );
  const [showHistory, setShowHistory] = useState(false);

  const preview = useMemo(() => evaluate(expr), [expr]);
  const last = expr.slice(-1);

  const press = (key: Key) => {
    tap();
    const { label } = key;

    if (label === "AC") {
      setExpr("");
      setJustEvaluated(false);
      return;
    }

    if (label === "=") {
      if (preview == null) return;
      setHistory((h) => [{ expr, result: preview }, ...h].slice(0, 30));
      setExpr(String(preview));
      setJustEvaluated(true);
      return;
    }

    // Typing a digit straight after "=" starts a fresh sum.
    const base = justEvaluated && key.kind === "num" ? "" : expr;
    setJustEvaluated(false);

    if (key.kind === "num") {
      if (label === ".") {
        const start = lastNumberStart(base);
        if (start >= 0 && base.slice(start).includes(".")) return;
        setExpr(base + (start < 0 ? "0." : "."));
        return;
      }
      if (last === ")" || last === "%") {
        setExpr(base + "×" + label);
        return;
      }
      setExpr(base + label);
      return;
    }

    if (key.kind === "op") {
      if (base === "" || last === "(") {
        // Only a minus can start a number.
        if (label === "−") setExpr(base + "−");
        return;
      }
      // Replace a trailing operator instead of stacking them.
      if (OPERATORS.includes(last)) {
        setExpr(base.slice(0, -1) + label);
        return;
      }
      setExpr(base + label);
      return;
    }

    if (label === "%") {
      if (/[0-9)]$/.test(base)) setExpr(base + "%");
      return;
    }

    if (label === "( )") {
      const open = (base.match(/\(/g) ?? []).length;
      const close = (base.match(/\)/g) ?? []).length;
      const canClose = open > close && /[0-9)%]$/.test(base);
      if (canClose) setExpr(base + ")");
      else setExpr(base + (/[0-9)%]$/.test(base) ? "×(" : "("));
      return;
    }

    if (label === "±") {
      const start = lastNumberStart(base);
      if (start < 0) {
        setExpr(base + "−");
        return;
      }
      const before = base.slice(0, start);
      const isNegated =
        before.endsWith("−") &&
        (before.length === 1 || /[+−×÷(]$/.test(before.slice(0, -1)));
      setExpr(
        isNegated
          ? before.slice(0, -1) + base.slice(start)
          : before + "−" + base.slice(start),
      );
    }
  };

  const backspace = () => {
    tap();
    setJustEvaluated(false);
    setExpr((e) => e.slice(0, -1));
  };

  const chassis: [string, string] = isDark
    ? ["#1e293b", "#0b1220"]
    : ["#f1f5f9", "#cbd5e1"];

  return (
    <View style={styles.container}>
      <LinearGradient colors={chassis} style={styles.bezel}>
        <LinearGradient
          colors={["#020617", "#0f172a", "#1e293b"]}
          style={styles.display}
        >
          <View style={styles.displayTop}>
            <Pressable
              onPress={() => setShowHistory((v) => !v)}
              hitSlop={8}
              style={styles.iconBtn}
              accessibilityLabel="History"
            >
              <Ionicons
                name={showHistory ? "calculator-outline" : "time-outline"}
                size={20}
                color={SCREEN_DIM}
              />
            </Pressable>
            <Pressable
              onPress={backspace}
              onLongPress={() => setExpr("")}
              hitSlop={8}
              style={styles.iconBtn}
              accessibilityLabel="Delete"
            >
              <Ionicons name="backspace-outline" size={22} color={SCREEN_DIM} />
            </Pressable>
          </View>

          {showHistory ? (
            <FlatList
              data={history}
              keyExtractor={(_, i) => String(i)}
              style={styles.history}
              ListEmptyComponent={
                <Text style={styles.historyEmpty}>No calculations yet</Text>
              }
              ListFooterComponent={
                history.length > 0 ? (
                  <Pressable
                    onPress={() => setHistory([])}
                    style={styles.clearHistory}
                  >
                    <Text style={styles.clearHistoryText}>Clear history</Text>
                  </Pressable>
                ) : null
              }
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    setExpr(String(item.result));
                    setJustEvaluated(true);
                    setShowHistory(false);
                  }}
                  style={styles.historyRow}
                >
                  <Text style={styles.historyExpr} numberOfLines={1}>
                    {formatExpression(item.expr)} =
                  </Text>
                  <Text style={styles.historyResult} numberOfLines={1}>
                    {formatNumber(item.result)}
                  </Text>
                </Pressable>
              )}
            />
          ) : (
            <View style={styles.screen}>
              <Text
                style={justEvaluated ? styles.resultBig : styles.exprText}
                numberOfLines={2}
                adjustsFontSizeToFit
              >
                {expr ? formatExpression(expr) : "0"}
              </Text>
              {!justEvaluated && (
                <Text
                  style={styles.previewText}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {preview != null && expr !== String(preview)
                    ? `= ${formatNumber(preview)}`
                    : " "}
                </Text>
              )}
            </View>
          )}
        </LinearGradient>
      </LinearGradient>

      <LinearGradient colors={chassis} style={styles.keypad}>
        {KEYS.map((row, r) => (
          <View key={r} style={styles.keyRow}>
            {row.map((key) => (
              <Key3D
                key={key.label}
                label={key.label}
                palette={paletteFor(key.kind, isDark)}
                small={key.kind === "fn"}
                onPress={() => press(key)}
              />
            ))}
          </View>
        ))}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, paddingBottom: 16, gap: 14 },
  bezel: {
    flex: 1,
    minHeight: 180,
    borderRadius: 22,
    padding: 8,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  display: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    // Darker top/left edges make the screen look sunk into the bezel.
    borderTopWidth: 3,
    borderLeftWidth: 2,
    borderTopColor: "rgba(0,0,0,0.6)",
    borderLeftColor: "rgba(0,0,0,0.45)",
    borderBottomWidth: 1,
    borderRightWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
    borderRightColor: "rgba(255,255,255,0.06)",
  },
  displayTop: { flexDirection: "row", justifyContent: "space-between" },
  iconBtn: { padding: 4 },
  screen: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "flex-end",
    gap: 6,
  },
  exprText: {
    color: SCREEN_TEXT,
    fontSize: 34,
    fontWeight: "600",
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  resultBig: {
    color: SCREEN_TEXT,
    fontSize: 48,
    fontWeight: "800",
    textAlign: "right",
    fontVariant: ["tabular-nums"],
    textShadowColor: "rgba(74,222,128,0.35)",
    textShadowRadius: 12,
  },
  previewText: {
    color: "#4ade80",
    fontSize: 22,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  history: { flex: 1, marginTop: 6 },
  historyEmpty: {
    color: SCREEN_DIM,
    textAlign: "center",
    marginTop: 24,
    fontSize: 14,
  },
  historyRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(148,163,184,0.2)",
    alignItems: "flex-end",
  },
  historyExpr: {
    color: SCREEN_DIM,
    fontSize: 13,
    fontVariant: ["tabular-nums"],
  },
  historyResult: {
    color: SCREEN_TEXT,
    fontSize: 20,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  clearHistory: { alignSelf: "center", padding: 12 },
  clearHistoryText: { color: "#f87171", fontWeight: "800", fontSize: 13 },
  keypad: {
    gap: 12,
    padding: 12,
    borderRadius: 22,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  keyRow: { flexDirection: "row", gap: 10 },
  keyOuter: { flex: 1, aspectRatio: 1.15 },
  keyEdge: {
    flex: 1,
    borderRadius: 18,
    shadowColor: "#000",
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 3 },
  },
  keyFace: {
    flex: 1,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  // Soft gloss on the top half of each key.
  keyShine: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "48%",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  keyText: {
    fontSize: 26,
    fontWeight: "800",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  fnText: { fontSize: 20 },
});
