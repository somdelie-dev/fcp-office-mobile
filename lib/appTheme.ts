/**
 * appTheme.ts
 *
 * Central design-token system for the whole mobile app. The source of truth
 * for every colour here is the Face Scan module's palette
 * (components/team/faceTheme.ts) — the green accent and dark background used
 * on the face verification screens. Screens should import `useAppTheme()`
 * instead of hand-rolling their own light/dark colour maps, so Login, Home,
 * Timesheets, Assistant, Settings, etc. all read as one product.
 *
 * This intentionally reuses the light/dark toggle already wired through
 * lib/themeContext instead of replacing it — dark mode is the Face Scan
 * palette itself, light mode is its light counterpart, both already defined
 * in faceTheme.ts.
 */

import { useTheme } from "./themeContext";
import { DarkColors, LightColors, type FaceColorPalette } from "../components/team/faceTheme";

export interface AppColorTokens {
  background: string;
  backgroundElevated: string;
  surface: string;
  surfaceElevated: string;
  card: string;
  border: string;
  borderStrong: string;

  primaryGreen: string;
  primaryGreenPressed: string;
  primaryGreenDim: string;

  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textOnPrimary: string;

  success: string;
  successDim: string;
  warning: string;
  warningDim: string;
  danger: string;
  dangerDim: string;
  info: string;
}

function tokensFrom(p: FaceColorPalette, isDark: boolean): AppColorTokens {
  return {
    background: p.background,
    backgroundElevated: p.backgroundElevated,
    surface: p.backgroundElevated,
    // A step brighter than `surface` so stacked cards stay legible against
    // the Face Scan dark background without a hardcoded one-off hex per screen.
    surfaceElevated: isDark ? "#101F30" : "#F1F5F9",
    card: p.glassFill,
    border: p.glassBorder,
    borderStrong: p.glassBorderStrong,

    primaryGreen: p.success,
    primaryGreenPressed: isDark ? "#16A34A" : "#15803D",
    primaryGreenDim: p.successDim,

    textPrimary: p.textPrimary,
    textSecondary: p.textSecondary,
    textTertiary: p.textTertiary,
    textOnPrimary: p.textOnPrimary,

    success: p.success,
    successDim: p.successDim,
    warning: p.warning,
    warningDim: p.warningDim,
    danger: p.danger,
    dangerDim: p.dangerDim,
    info: p.primary,
  };
}

export const AppDarkColors: AppColorTokens = tokensFrom(DarkColors, true);
export const AppLightColors: AppColorTokens = tokensFrom(LightColors, false);

export function useAppTheme(): { isDark: boolean; colors: AppColorTokens } {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  return { isDark, colors: isDark ? AppDarkColors : AppLightColors };
}
