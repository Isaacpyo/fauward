import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}", "../../packages/relay-ui/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        tenant: {
          primary: "var(--tenant-primary)",
          accent: "var(--tenant-accent)"
        },
        status: {
          success: "var(--color-success)",
          warning: "var(--color-warning)",
          error: "var(--color-error)",
          info: "var(--color-info)"
        }
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)"
      },
      spacing: {
        18: "4.5rem",
        22: "5.5rem"
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"]
      },
      // Subtle Dialog enter/exit. Paired with Radix's `data-state="open|closed"` on
      // Overlay + Content so the modal feels native, not snap-on. Quick (~150ms) and tasteful.
      keyframes: {
        fauwardFadeIn: { from: { opacity: "0" }, to: { opacity: "1" } },
        fauwardFadeOut: { from: { opacity: "1" }, to: { opacity: "0" } },
        fauwardZoomIn: {
          from: { opacity: "0", transform: "translate(-50%, -50%) scale(0.96)" },
          to: { opacity: "1", transform: "translate(-50%, -50%) scale(1)" }
        },
        fauwardZoomOut: {
          from: { opacity: "1", transform: "translate(-50%, -50%) scale(1)" },
          to: { opacity: "0", transform: "translate(-50%, -50%) scale(0.96)" }
        },
        // Inline pop-in for the success/failure icons inside a dialog body. No translate, so
        // it works on any element (unlike fauwardZoomIn, which is centered for the dialog
        // container).
        fauwardPopIn: {
          from: { opacity: "0", transform: "scale(0.6)" },
          to: { opacity: "1", transform: "scale(1)" }
        }
      },
      animation: {
        "fauward-fade-in": "fauwardFadeIn 140ms ease-out",
        "fauward-fade-out": "fauwardFadeOut 120ms ease-in",
        "fauward-zoom-in": "fauwardZoomIn 160ms cubic-bezier(0.16, 1, 0.3, 1)",
        "fauward-zoom-out": "fauwardZoomOut 120ms ease-in",
        "fauward-pop-in": "fauwardPopIn 200ms cubic-bezier(0.16, 1, 0.3, 1)"
      }
    }
  },
  plugins: []
};

export default config;
