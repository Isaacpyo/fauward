import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ship a Package",
  // No robots indexing — widget is iframe-only
  robots: "noindex, nofollow",
};

export default function WidgetLayout({ children }: { children: React.ReactNode }) {
  const themeScript = `
    (() => {
      try {
        const allowed = new Set(["light", "dark", "system"]);
        const params = new URLSearchParams(window.location.search);
        const hinted = params.get("theme");
        const stored = window.localStorage.getItem("fauward.widget.theme");
        const choice = allowed.has(hinted || "") ? hinted : allowed.has(stored || "") ? stored : "system";
        const media = window.matchMedia("(prefers-color-scheme: dark)");
        document.documentElement.dataset.theme = choice === "dark" || (choice === "system" && media.matches) ? "dark" : "light";
        document.documentElement.dataset.themeChoice = choice || "system";
      } catch {
        document.documentElement.dataset.theme = "light";
        document.documentElement.dataset.themeChoice = "system";
      }
    })();
  `;
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      {/*
        No nav, no header, no footer.
        Frame ancestors set in next.config.ts to allow tenant domains.
      */}
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
