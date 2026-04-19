import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ship a Package",
  // No robots indexing — widget is iframe-only
  robots: "noindex, nofollow",
};

export default function WidgetLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/*
        No nav, no header, no footer.
        Frame ancestors set in next.config.ts to allow tenant domains.
      */}
      <body className="bg-white font-sans antialiased">{children}</body>
    </html>
  );
}
