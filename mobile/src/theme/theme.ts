export type ThemeMode = "dark" | "light" | "system";

export interface ThemeColors {
  bg: string;
  surface: string;
  cardBg: string;
  cardBorder: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentLight: string;
  tabBarBg: string;
  tabBarBorder: string;
  inputBg: string;
  inputBorder: string;
  inputPlaceholder: string;
  danger: string;
  success: string;
  shadowColor: string;
  /** Version / status badge — WCAG AA on card surfaces */
  badgeSuccessBg: string;
  badgeSuccessFg: string;
  badgeSuccessBorder: string;
}

/** Readable type scale (pt). Prefer these over one-off magic numbers. */
export const typography = {
  xs: 12,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  display: 32,
} as const;

/** Spacing scale (pt). */
export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

/** Minimum touch target (Apple HIG / Material). */
export const MIN_TOUCH_TARGET = 44;

export const darkTheme: ThemeColors = {
  bg: "#0F172A",
  surface: "#1E293B",
  cardBg: "rgba(30, 41, 59, 0.85)",
  cardBorder: "rgba(255, 255, 255, 0.08)",
  textPrimary: "#F8FAFC",
  textSecondary: "#CBD5E1",
  // Was #64748B (~3.1:1 on surface). #94A3B8 ≈ 4.6:1 on #1E293B / ~5.2:1 on #0F172A.
  textMuted: "#94A3B8",
  accent: "#6366F1",
  accentLight: "rgba(99, 102, 241, 0.15)",
  tabBarBg: "rgba(15, 23, 42, 0.85)",
  tabBarBorder: "rgba(255, 255, 255, 0.12)",
  inputBg: "#1E293B",
  inputBorder: "rgba(255, 255, 255, 0.1)",
  inputPlaceholder: "#94A3B8",
  danger: "#F43F5E",
  success: "#34D399",
  shadowColor: "#000000",
  badgeSuccessBg: "rgba(16, 185, 129, 0.2)",
  badgeSuccessFg: "#6EE7B7",
  badgeSuccessBorder: "rgba(52, 211, 153, 0.45)",
};

export const lightTheme: ThemeColors = {
  bg: "#FAF7F2",
  surface: "#FFFFFF",
  cardBg: "#FFFFFF",
  cardBorder: "rgba(0, 0, 0, 0.06)",
  textPrimary: "#1E293B",
  textSecondary: "#475569",
  // Was #94A3B8 (~2.4:1 on cream). #64748B ≈ 4.6:1 on #FAF7F2 / #FFFFFF.
  textMuted: "#64748B",
  accent: "#4F46E5",
  accentLight: "rgba(79, 70, 229, 0.1)",
  tabBarBg: "rgba(255, 255, 255, 0.9)",
  tabBarBorder: "rgba(0, 0, 0, 0.08)",
  inputBg: "#F1F5F9",
  inputBorder: "rgba(0, 0, 0, 0.08)",
  inputPlaceholder: "#64748B",
  danger: "#E11D48",
  success: "#047857",
  shadowColor: "#64748B",
  badgeSuccessBg: "rgba(4, 120, 87, 0.12)",
  badgeSuccessFg: "#047857",
  badgeSuccessBorder: "rgba(4, 120, 87, 0.35)",
};

export interface CardThemePreset {
  id: string;
  name: string;
  bg: string;
  border: string;
  text: string;
  secondaryText: string;
  badgeBg: string;
  badgeText: string;
  accent: string;
}

export const cardThemePresets: CardThemePreset[] = [
  {
    id: "mint",
    name: "Pastel Mint",
    bg: "#E6F7F2",
    border: "#A7F3D0",
    text: "#064E3B",
    secondaryText: "#047857",
    badgeBg: "#059669",
    badgeText: "#FFFFFF",
    accent: "#10B981",
  },
  {
    id: "rose",
    name: "Soft Rose",
    bg: "#FDE8E9",
    border: "#FBCFE8",
    text: "#881337",
    secondaryText: "#BE123C",
    badgeBg: "#E11D48",
    badgeText: "#FFFFFF",
    accent: "#F43F5E",
  },
  {
    id: "cream",
    name: "Warm Cream",
    bg: "#FFFBEB",
    border: "#FDE68A",
    text: "#78350F",
    secondaryText: "#B45309",
    badgeBg: "#D97706",
    badgeText: "#FFFFFF",
    accent: "#F59E0B",
  },
  {
    id: "lavender",
    name: "Soft Lavender",
    bg: "#F3E8FF",
    border: "#DDD6FE",
    text: "#4C1D95",
    secondaryText: "#6D28D9",
    badgeBg: "#7C3AED",
    badgeText: "#FFFFFF",
    accent: "#8B5CF6",
  },
  {
    id: "slate",
    name: "Modern Slate",
    bg: "#1E293B",
    border: "rgba(255, 255, 255, 0.1)",
    text: "#F8FAFC",
    secondaryText: "#94A3B8",
    badgeBg: "#6366F1",
    badgeText: "#FFFFFF",
    accent: "#6366F1",
  },
];

/** Known SMS email-gateway carriers (matches web settings). */
export const PHONE_CARRIERS = [
  { value: "verizon", label: "Verizon" },
  { value: "att", label: "AT&T" },
  { value: "tmobile", label: "T-Mobile" },
] as const;

export type PhoneCarrierValue = (typeof PHONE_CARRIERS)[number]["value"];
