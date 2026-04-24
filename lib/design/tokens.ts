/**
 * HEARST OS — Design Tokens v1
 * Accent: Turquoise #2ECFC2 (Pantone C)
 *
 * Usage: import { TOKENS, MONO, fmtUsd, fmtUsdCompact } from '@/lib/design/tokens'
 */

// Core accent color (Pantone C — turquoise from logo)
const ACCENT = "#2ECFC2" as const;
const ACCENT_RGB = "46, 207, 194" as const;

// Deep void backgrounds
const BG = {
  app: "#050505",
  page: "#141414",
  sidebar: "#050505",
  surface: "#0A0A0A",
  secondary: "#0F0F0F",
  tertiary: "#1A1A1A",
} as const;

// Text white opacity scale
const TEXT = {
  primary: "rgba(255, 255, 255, 0.92)",
  secondary: "rgba(255, 255, 255, 0.55)",
  ghost: "rgba(255, 255, 255, 0.35)",
} as const;

// Accent variations
const ACCENT_SCALE = {
  base: ACCENT,
  dim: `rgba(${ACCENT_RGB}, 0.05)`,
  subtle: `rgba(${ACCENT_RGB}, 0.12)`,
  glow: `rgba(${ACCENT_RGB}, 0.15)`,
  medium: `rgba(${ACCENT_RGB}, 0.3)`,
  strong: `rgba(${ACCENT_RGB}, 0.5)`,
} as const;

// Borders
const BORDER = {
  main: "rgba(255, 255, 255, 0.06)",
  subtle: "rgba(255, 255, 255, 0.08)",
  strong: "rgba(255, 255, 255, 0.14)",
} as const;

// Semantic colors
const SEMANTIC = {
  danger: "#EF4444",
  white: "#FFFFFF",
  black: "#000000",
} as const;

// Typography
const FONTS = {
  sans: "'Satoshi Variable', Inter, -apple-system, sans-serif",
  mono: "'IBM Plex Mono', 'SF Mono', ui-monospace, monospace",
} as const;

const FONT_SIZES = {
  micro: "11px",
  xs: "12px",
  sm: "14px",
  md: "16px",
  lg: "20px",
  xl: "24px",
  xxl: "40px",
  xxxl: "48px",
  display: "clamp(32px, 4vw, 48px)",
  figure: "clamp(28px, 4vh, 44px)",
} as const;

const FONT_WEIGHTS = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  black: 800,
} as const;

const LETTER_SPACING = {
  tight: "-0.06em",
  normal: "0",
  wide: "0.12em",
  display: "0.2em",
} as const;

const LINE_HEIGHT = {
  tight: 1.05,
  display: 1.1,
  title: 1.2,
  body: 1.45,
} as const;

// Spacing (8px grid)
const SPACING = {
  0: "0px",
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  5: "20px",
  6: "24px",
  8: "32px",
  10: "40px",
  12: "48px",
  16: "64px",
  18: "72px",
  20: "80px",
  24: "96px",
  32: "128px",
} as const;

// Radius
const RADIUS = {
  sm: "4px",
  md: "8px",
  lg: "12px",
  xl: "16px",
  full: "9999px",
} as const;

// Borders
const BORDERS = {
  none: "none",
  thin: "1px",
  thick: "2px",
  heavy: "6px",
} as const;

// Glow shadows (accent-based)
const GLOW = {
  sm: `0 0 4px rgba(${ACCENT_RGB}, 0.3)`,
  md: `0 0 8px rgba(${ACCENT_RGB}, 0.4)`,
  lg: `0 0 16px rgba(${ACCENT_RGB}, 0.5)`,
  xl: `0 0 24px rgba(${ACCENT_RGB}, 0.15)`,
} as const;

// Z-index scale
const Z_INDEX = {
  base: 0,
  nav: 30,
  chat: 40,
  overlay: 50,
  modal: 60,
} as const;

// Main export
export const TOKENS = {
  colors: {
    bg: BG,
    text: TEXT,
    accent: ACCENT_SCALE,
    border: BORDER,
    semantic: SEMANTIC,
  },
  fonts: FONTS,
  fontSizes: FONT_SIZES,
  fontWeights: FONT_WEIGHTS,
  letterSpacing: LETTER_SPACING,
  lineHeight: LINE_HEIGHT,
  spacing: SPACING,
  radius: RADIUS,
  borders: BORDERS,
  glow: GLOW,
  zIndex: Z_INDEX,
} as const;

// Font shorthand
export const MONO = FONTS.mono;

// Currency formatters
export function fmtUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function fmtUsdCompact(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

// Percentage formatter
export function fmtPercent(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    signDisplay: "exceptZero",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value / 100);
}
