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
        info: "#2563EB"
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
        }
      },
      animation: {
        "pulse-dot": "pulseDot 1.6s ease-in-out infinite"
      }
    }
  },
  plugins: []
};

export default config;
