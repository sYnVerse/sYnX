import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/{**,.client,.server}/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
          "Apple Color Emoji",
          "Segoe UI Emoji",
          "Segoe UI Symbol",
          "Noto Color Emoji",
        ],
        display: [
          "Outfit",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
      colors: {
        themeBg: "var(--bg-main)",
        themeSidebar: "var(--bg-sidebar)",
        themeCard: "var(--bg-card)",
        themeCardHover: "var(--bg-card-hover)",
        themeBorder: "var(--border-color)",
        themeBorderStrong: "var(--border-color-strong)",
        themeAccentFrom: "var(--color-accent-from)",
        themeAccentTo: "var(--color-accent-to)",
        themeAccentBg: "var(--color-accent-bg)",
        themeAccentText: "var(--color-accent-text)",
        themeAccentRing: "var(--color-accent-ring)",
      },
    },
  },
  plugins: [],
} satisfies Config;
