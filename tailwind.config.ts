import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        emerald: {
          50: '#FDFBF7',
          100: '#FBF5EB',
          200: '#F3E5C8',
          300: '#EBD2A0',
          400: '#E1BC73',
          500: '#D4AF37',
          600: '#B59024',
          700: '#8C6D15',
          800: '#664E0D',
          900: '#453307',
          950: '#2B1E02',
        },
        cyan: {
          50: '#F8F6FA',
          100: '#F0EAF5',
          200: '#E0CEEB',
          300: '#CDAEE0',
          400: '#B88CD3',
          500: '#A169C5',
          600: '#844CA4',
          700: '#65387F',
          800: '#48265C',
          900: '#2D163B',
          950: '#1A0A24',
        },
        slate: {
          50: '#F7F7F8',
          100: '#EBEBEF',
          200: '#D1D2D9',
          300: '#B5B7C1',
          400: '#8A8C9A',
          500: '#636676',
          600: '#4C4F5D',
          700: '#3A3C47',
          800: '#282A33',
          900: '#17181D',
          950: '#0B0C0E',
        }
      },
      fontFamily: {
        heading: ["var(--font-outfit)", "Outfit", "ui-sans-serif", "system-ui", "sans-serif"],
        body: ["var(--font-jakarta)", "Plus Jakarta Sans", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      boxShadow: {
        glow: "0 0 50px rgba(235, 210, 160, 0.2)",
        "glow-sm": "0 0 30px rgba(235, 210, 160, 0.12)",
        "glow-lg": "0 0 80px rgba(235, 210, 160, 0.28)",
        panel: "0 30px 90px rgba(0, 0, 0, 0.5)",
        surface: "0 40px 100px rgba(0, 0, 0, 0.5), 0 1px 0 rgba(255, 255, 255, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.12)"
      },
      animation: {
        "fade-in": "fade-in 800ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "slide-up": "slide-up 700ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "score-pulse": "score-pulse 5s cubic-bezier(0.4, 0, 0.2, 1) infinite",
        "status-dot": "status-dot 3s ease-in-out infinite"
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", filter: "blur(4px)", transform: "translateY(15px)" },
          to: { opacity: "1", filter: "blur(0)", transform: "translateY(0)" }
        },
        "slide-up": {
          from: { opacity: "0", filter: "blur(6px)", transform: "translateY(25px)" },
          to: { opacity: "1", filter: "blur(0)", transform: "translateY(0)" }
        },
        "score-pulse": {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "0.9" }
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
