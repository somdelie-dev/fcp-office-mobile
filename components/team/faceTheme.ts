/**
 * faceTheme.ts
 *
 * Central design token system for the Face Verification module.
 * Every color, spacing value, radius, type scale, and shadow used across
 * components/team/* is derived from this file. Do not hardcode raw hex
 * values or magic numbers in components — extend this file instead.
 *
 * The module supports both light and dark app themes (see lib/themeContext).
 * Colors, Typography, and Shadows are theme-dependent — use `useFaceTheme()`
 * inside components rather than importing a static palette.
 */

import { Platform, TextStyle, ViewStyle } from "react-native";
import { useTheme } from "../../lib/themeContext";

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

export interface FaceColorPalette {
  background: string;
  backgroundElevated: string;
  backgroundDeep: string;

  glassFill: string;
  glassFillStrong: string;
  glassBorder: string;
  glassBorderStrong: string;
  glassHighlight: string;

  primary: string;
  primaryDim: string;
  primaryGlow: string;
  secondary: string;
  secondaryDim: string;

  success: string;
  successDim: string;
  successBorder: string;
  warning: string;
  warningDim: string;
  warningBorder: string;
  danger: string;
  dangerDim: string;
  dangerBorder: string;

  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textOnPrimary: string;
  textInverse: string;

  gradientHero: readonly [string, string, string];
  gradientPrimaryAction: readonly [string, string];
  gradientPortraitRing: readonly [string, string];
  gradientScrim: readonly [string, string];
}

export const DarkColors: FaceColorPalette = {
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
  dangerBorder: "rgba(239, 68, 68, 0.4)",

  // Text
  textPrimary: "#F8FAFC",
  textSecondary: "rgba(248, 250, 252, 0.64)",
  textTertiary: "rgba(248, 250, 252, 0.40)",
  textOnPrimary: "#FFFFFF",
  textInverse: "#07111D",

  // Gradients (stop arrays for expo-linear-gradient)
  gradientHero: ["#0E1E33", "#0A1524", "#07111D"],
  gradientPrimaryAction: ["#3B82F6", "#2563EB"],
  gradientPortraitRing: ["#3B82F6", "#06B6D4"],
  gradientScrim: ["rgba(7,17,29,0)", "rgba(7,17,29,0.9)"],
};

export const LightColors: FaceColorPalette = {
  // Base surface
  background: "#EEF2F8",
  backgroundElevated: "#FFFFFF",
  backgroundDeep: "#E2E8F0",

  // Glass surfaces
  glassFill: "rgba(15, 23, 42, 0.04)",
  glassFillStrong: "rgba(15, 23, 42, 0.07)",
  glassBorder: "rgba(15, 23, 42, 0.09)",
  glassBorderStrong: "rgba(15, 23, 42, 0.16)",
  glassHighlight: "rgba(255, 255, 255, 0.7)",

  // Brand accents
  primary: "#2563EB",
  primaryDim: "rgba(37, 99, 235, 0.14)",
  primaryGlow: "rgba(37, 99, 235, 0.35)",
  secondary: "#0891B2",
  secondaryDim: "rgba(8, 145, 178, 0.14)",

  // Semantic
  success: "#16A34A",
  successDim: "rgba(22, 163, 74, 0.12)",
  successBorder: "rgba(22, 163, 74, 0.35)",
  warning: "#D97706",
  warningDim: "rgba(217, 119, 6, 0.12)",
  warningBorder: "rgba(217, 119, 6, 0.35)",
  danger: "#DC2626",
  dangerDim: "rgba(220, 38, 38, 0.12)",
  dangerBorder: "rgba(220, 38, 38, 0.35)",

  // Text
  textPrimary: "#0F172A",
  textSecondary: "rgba(15, 23, 42, 0.64)",
  textTertiary: "rgba(15, 23, 42, 0.45)",
  textOnPrimary: "#FFFFFF",
  textInverse: "#F8FAFC",

  // Gradients (stop arrays for expo-linear-gradient)
  gradientHero: ["#EAF1FF", "#F3F7FF", "#FFFFFF"],
  gradientPrimaryAction: ["#3B82F6", "#2563EB"],
  gradientPortraitRing: ["#3B82F6", "#0891B2"],
  gradientScrim: ["rgba(255,255,255,0)", "rgba(255,255,255,0.9)"],
};

/** @deprecated Use `useFaceTheme().colors` so the palette follows the app theme. */
export const Colors = DarkColors;

// ---------------------------------------------------------------------------
// Spacing (4pt base scale) — theme-independent
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
// Radius — theme-independent
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

export function getTypography(colors: FaceColorPalette): Record<string, TextStyle> {
  return {
    display: {
      fontFamily,
      fontSize: 34,
      fontWeight: "800",
      letterSpacing: -0.6,
      color: colors.textPrimary,
    },
    title: {
      fontFamily,
      fontSize: 24,
      fontWeight: "800",
      letterSpacing: -0.4,
      color: colors.textPrimary,
    },
    headline: {
      fontFamily,
      fontSize: 18,
      fontWeight: "700",
      letterSpacing: -0.2,
      color: colors.textPrimary,
    },
    body: {
      fontFamily,
      fontSize: 15,
      fontWeight: "500",
      color: colors.textSecondary,
    },
    bodyStrong: {
      fontFamily,
      fontSize: 15,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    caption: {
      fontFamily,
      fontSize: 13,
      fontWeight: "600",
      color: colors.textTertiary,
    },
    label: {
      fontFamily,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 0.6,
      textTransform: "uppercase",
      color: colors.textTertiary,
    },
    mono: {
      fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
      fontSize: 13,
      fontWeight: "600",
      letterSpacing: 0.4,
      color: colors.textSecondary,
    },
  };
}

/** @deprecated Use `useFaceTheme().typography` so text color follows the app theme. */
export const Typography = getTypography(DarkColors);

// ---------------------------------------------------------------------------
// Shadows
// ---------------------------------------------------------------------------

type ShadowStyle = Pick<
  ViewStyle,
  "shadowColor" | "shadowOffset" | "shadowOpacity" | "shadowRadius" | "elevation"
>;

export function getShadows(colors: FaceColorPalette): Record<string, ShadowStyle> {
  return {
    card: {
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.35,
      shadowRadius: 24,
      elevation: 10,
    },
    glow: {
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.55,
      shadowRadius: 30,
      elevation: 14,
    },
    glowSoft: {
      shadowColor: colors.primary,
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
}

/** @deprecated Use `useFaceTheme().shadows` so glow color follows the app theme. */
export const Shadows = getShadows(DarkColors);

// ---------------------------------------------------------------------------
// Misc layout constants — theme-independent
// ---------------------------------------------------------------------------

export const Layout = {
  portraitSize: 180,
  portraitRingPadding: 8,
  portraitOuterGlow: 220,
  blurIntensity: 40,
  screenHPadding: Spacing.lg,
} as const;

// ---------------------------------------------------------------------------
// useFaceTheme — the theme-aware entry point components should use
// ---------------------------------------------------------------------------

export interface FaceTheme {
  isDark: boolean;
  colors: FaceColorPalette;
  typography: Record<string, TextStyle>;
  shadows: Record<string, ShadowStyle>;
  spacing: typeof Spacing;
  radius: typeof Radius;
  layout: typeof Layout;
}

/**
 * Resolves the Face Verification module's design tokens against the
 * app-wide light/dark theme (lib/themeContext). Every component in this
 * module should call this instead of importing the static Colors/Typography
 * exports above, which only exist for backwards compatibility.
 */
export function useFaceTheme(): FaceTheme {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const colors = isDark ? DarkColors : LightColors;

  return {
    isDark,
    colors,
    typography: getTypography(colors),
    shadows: getShadows(colors),
    spacing: Spacing,
    radius: Radius,
    layout: Layout,
  };
}

const faceTheme = { DarkColors, LightColors, Spacing, Radius, Layout, getTypography, getShadows, useFaceTheme };

export default faceTheme;
