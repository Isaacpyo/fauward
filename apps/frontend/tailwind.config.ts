import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}", "../../packages/relay-ui/src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: "#0D1F3C",
          amber: "#D97706",
          white: "#FFFFFF"
        },
        gray: {
          50: "#F9FAFB",
          100: "#F3F4F6",
          200: "#E5E7EB",
          500: "#6B7280",
          700: "#374151",
          900: "#111827"
        },
        success: "#16A34A",
        warning: "#D97706",
        error: "#DC2626",
        info: "#2563EB",
        dark: {
          bg:       "#070f1f",
          surface:  "#0a1628",
          card:     "#0f1f38",
          border:   "#1e3a5f",
          elevated: "#152a4a"
        },
        electric: {
          blue: "#3b82f6"
        }
      },
      borderRadius: {
        sm: "4px",
        md: "6px",
        lg: "8px",
        xl: "12px"
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"]
      },
      spacing: {
        18: "4.5rem",
        22: "5.5rem"
      },
      maxWidth: {
        content: "1280px"
      },
      keyframes: {
        pulseDot: {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.45", transform: "scale(0.8)" }
        },
        timelineFill: {
          "0%": { transform: "scaleX(0)" },
          "100%": { transform: "scaleX(1)" }
        },
        statusPulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" }
        },
        terminalLine: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        }
      },
      animation: {
        "pulse-dot":     "pulseDot 1.6s ease-in-out infinite",
        "timeline-fill": "timelineFill 0.8s ease forwards",
        "status-pulse":  "statusPulse 2s ease-in-out infinite",
        "terminal-line": "terminalLine 0.35s ease forwards"
      }
    }
  },
  plugins: []
};

export default config;
