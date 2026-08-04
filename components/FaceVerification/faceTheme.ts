/**
 * faceTheme.ts
 *
 * Central design token system for the Face Verification module.
 * Every color, spacing value, radius, type scale, and shadow used across
 * components/FaceVerification/* is derived from this file. Do not hardcode
 * raw hex values or magic numbers in components — extend this file instead.
 */

import { Platform, TextStyle, ViewStyle } from "react-native";

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

export const Colors = {
  // Base surface
  background: "#07111D",
  backgroundElevated: "#0B1826",
  backgroundDeep: "#040A12",

  // Glass surfaces
  glassFill: "rgba(255, 255, 255, 0.06)",
  glassFillStrong: "rgba(255, 255, 255, 0.10)",
  glassBorder: "rgba(255, 255, 255, 0.14)",
  glassBorderStrong: "rgba(255, 255, 255, 0.22)",
  glassHighlight: "rgba(255, 255, 255, 0.35)",

  // Brand accents
  primary: "#3B82F6", // Electric Blue
  primaryDim: "rgba(59, 130, 246, 0.35)",
  primaryGlow: "rgba(59, 130, 246, 0.55)",
  secondary: "#06B6D4", // Cyan
  secondaryDim: "rgba(6, 182, 212, 0.35)",

  // Semantic
  success: "#22C55E",
  successDim: "rgba(34, 197, 94, 0.18)",
  successBorder: "rgba(34, 197, 94, 0.4)",
  warning: "#F59E0B",
  warningDim: "rgba(245, 158, 11, 0.18)",
  warningBorder: "rgba(245, 158, 11, 0.4)",
  danger: "#EF4444",
  dangerDim: "rgba(239, 68, 68, 0.18)",

  // Text
  textPrimary: "#F8FAFC",
  textSecondary: "rgba(248, 250, 252, 0.64)",
  textTertiary: "rgba(248, 250, 252, 0.40)",
  textOnPrimary: "#FFFFFF",
  textInverse: "#07111D",

  // Gradients (stop arrays for expo-linear-gradient)
  gradientHero: ["#0E1E33", "#0A1524", "#07111D"] as const,
  gradientPrimaryAction: ["#3B82F6", "#2563EB"] as const,
  gradientPortraitRing: ["#3B82F6", "#06B6D4"] as const,
  gradientScrim: ["rgba(7,17,29,0)", "rgba(7,17,29,0.9)"] as const,
} as const;

// ---------------------------------------------------------------------------
// Spacing (4pt base scale)
// ---------------------------------------------------------------------------

export const Spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
  xxxl: 56,
} as const;

// ---------------------------------------------------------------------------
// Radius
// ---------------------------------------------------------------------------

export const Radius = {
  sm: 12,
  md: 18,
  lg: 22,
  xl: 28, // Standard card radius per spec
  pill: 999,
  portrait: 999,
} as const;

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

const fontFamily = Platform.select({
  ios: "System",
  android: "sans-serif",
  default: "System",
});

export const Typography: Record<string, TextStyle> = {
  display: {
    fontFamily,
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -0.6,
    color: Colors.textPrimary,
  },
  title: {
    fontFamily,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: Colors.textPrimary,
  },
  headline: {
    fontFamily,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.2,
    color: Colors.textPrimary,
  },
  body: {
    fontFamily,
    fontSize: 15,
    fontWeight: "500",
    color: Colors.textSecondary,
  },
  bodyStrong: {
    fontFamily,
    fontSize: 15,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  caption: {
    fontFamily,
    fontSize: 13,
    fontWeight: "600",
    color: Colors.textTertiary,
  },
  label: {
    fontFamily,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Colors.textTertiary,
  },
  mono: {
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.4,
    color: Colors.textSecondary,
  },
};

// ---------------------------------------------------------------------------
// Shadows
// ---------------------------------------------------------------------------

type ShadowStyle = Pick<
  ViewStyle,
  "shadowColor" | "shadowOffset" | "shadowOpacity" | "shadowRadius" | "elevation"
>;

export const Shadows: Record<string, ShadowStyle> = {
  card: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 10,
  },
  glow: {
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 30,
    elevation: 14,
  },
  glowSoft: {
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 18,
    elevation: 8,
  },
  portrait: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 12,
  },
};

// ---------------------------------------------------------------------------
// Misc layout constants
// ---------------------------------------------------------------------------

export const Layout = {
  portraitSize: 180,
  portraitRingPadding: 8,
  portraitOuterGlow: 220,
  blurIntensity: 40,
  screenHPadding: Spacing.lg,
} as const;

const faceTheme = { Colors, Spacing, Radius, Typography, Shadows, Layout };

export default faceTheme;
