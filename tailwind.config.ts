import type { Config } from "tailwindcss";

/**
 * Arc Identity — engraved-credential material system.
 * Warm paper ground, graphite plates, bone panels, muted gold, verified green, limited amber.
 *
 * NOTE ON REMAPPED SCALES: this app was originally a dark theme, so legacy markup
 * uses `text-white`, `text-slate-200`, `text-emerald-100`, etc. as "light text on dark".
 * The scales below are intentionally inverted/remapped so that legacy utilities
 * resolve to sensible values on the new light paper theme:
 *   - white        -> ink (dark)  — `text-white` reads as primary text, `bg-white/[0.03]` is a faint ink tint
 *   - slate 50-300 -> dark warm neutrals (primary/secondary text), 700-950 -> paper tones
 *   - emerald      -> verified green ramp (low = deep green text, high = green tint bg)
 *   - cyan         -> muted gold ramp
 *   - amber        -> limited amber ramp
 */
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        white: "#252827",
        // Semantic material tokens (preferred for new/redesigned markup)
        paper: { DEFAULT: "#e9e5db", deep: "#ded9cb" },
        bone: "#f2eee3",
        ink: "#252827",
        graphite: { DEFAULT: "#303331", 2: "#3a3e3a" },
        linec: { DEFAULT: "#c9c7bc", dark: "#555a52" },
        mutedc: "#747a75",
        quiet: "#9b9d94",
        gold: { DEFAULT: "#a78345", bg: "#eee4cd" },
        verified: { DEFAULT: "#4d795f", bg: "#dce9dd" },
        limited: { DEFAULT: "#9a6e2b", bg: "#f0e3c8" },
        risk: { DEFAULT: "#8c4a3f", bg: "#ecdcd4" },
        // Legacy remapped ramps
        emerald: {
          50: "#2c4636",
          100: "#35543f",
          200: "#41694f",
          300: "#4d795f",
          400: "#57876a",
          500: "#4d795f",
          600: "#6f9b80",
          700: "#9dbfa7",
          800: "#c3d8c6",
          900: "#dce9dd",
          950: "#e9f0e4"
        },
        cyan: {
          50: "#5c4a20",
          100: "#6e5526",
          200: "#8a6c35",
          300: "#a78345",
          400: "#b3924f",
          500: "#a78345",
          600: "#c0a36a",
          700: "#d4bd8e",
          800: "#e4d5ae",
          900: "#eee4cd",
          950: "#f4ecd9"
        },
        amber: {
          50: "#805a1e",
          100: "#9a6e2b",
          200: "#a97c33",
          300: "#b98a3a",
          400: "#c49a51",
          500: "#9a6e2b",
          600: "#d3b077",
          700: "#e0c69a",
          800: "#ead6b3",
          900: "#f0e3c8",
          950: "#f6ecd8"
        },
        slate: {
          50: "#1f2220",
          100: "#252827",
          200: "#303331",
          300: "#3a3e3a",
          400: "#747a75",
          500: "#9b9d94",
          600: "#a9aba0",
          700: "#c9c7bc",
          800: "#ded9cb",
          900: "#e9e5db",
          950: "#f2eee3"
        }
      },
      fontFamily: {
        heading: ["var(--font-newsreader)", "Newsreader", "Georgia", "serif"],
        body: ["var(--font-jakarta)", "Plus Jakarta Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-dm-mono)", "DM Mono", "ui-monospace", "monospace"]
      },
      boxShadow: {
        glow: "0 2px 10px rgba(37, 40, 39, 0.10)",
        "glow-sm": "0 1px 6px rgba(37, 40, 39, 0.08)",
        "glow-lg": "0 4px 18px rgba(37, 40, 39, 0.12)",
        panel: "0 18px 40px rgba(37, 40, 39, 0.10)",
        surface: "0 14px 34px rgba(37, 40, 39, 0.08)",
        plate: "10px 12px 0 #c9c4b6"
      },
      animation: {
        "fade-in": "fade-in 300ms ease both",
        "slide-up": "slide-up 300ms ease both",
        "score-pulse": "score-pulse 5s cubic-bezier(0.4, 0, 0.2, 1) infinite",
        "status-dot": "status-dot 3s ease-in-out infinite"
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" }
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" }
        },
        "score-pulse": {
          "0%, 100%": { opacity: "0.55" },
          "50%": { opacity: "1" }
        },
        "status-dot": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.5", transform: "scale(0.8)" }
        }
      }
    }
  },
  plugins: []
};

export default config;
