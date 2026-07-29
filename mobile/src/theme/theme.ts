export type ThemeMode = "dark" | "light";

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
}

export const darkTheme: ThemeColors = {
  bg: "#0F172A",
  surface: "#1E293B",
  cardBg: "rgba(30, 41, 59, 0.85)",
  cardBorder: "rgba(255, 255, 255, 0.08)",
  textPrimary: "#F8FAFC",
  textSecondary: "#94A3B8",
  textMuted: "#64748B",
  accent: "#6366F1",
  accentLight: "rgba(99, 102, 241, 0.15)",
  tabBarBg: "rgba(15, 23, 42, 0.85)",
  tabBarBorder: "rgba(255, 255, 255, 0.12)",
  inputBg: "#1E293B",
  inputBorder: "rgba(255, 255, 255, 0.1)",
  inputPlaceholder: "#64748B",
  danger: "#F43F5E",
  success: "#10B981",
  shadowColor: "#000000",
};

export const lightTheme: ThemeColors = {
  bg: "#FAF7F2", // warm soft cream background
  surface: "#FFFFFF",
  cardBg: "#FFFFFF",
  cardBorder: "rgba(0, 0, 0, 0.06)",
  textPrimary: "#1E293B",
  textSecondary: "#475569",
  textMuted: "#94A3B8",
  accent: "#4F46E5",
  accentLight: "rgba(79, 70, 229, 0.1)",
  tabBarBg: "rgba(255, 255, 255, 0.9)",
  tabBarBorder: "rgba(0, 0, 0, 0.08)",
  inputBg: "#F1F5F9",
  inputBorder: "rgba(0, 0, 0, 0.08)",
  inputPlaceholder: "#94A3B8",
  danger: "#E11D48",
  success: "#059669",
  shadowColor: "#64748B",
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
