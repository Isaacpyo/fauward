import type { Metadata } from "next";
import type { ReactNode } from "react";

import Footer from "@/components/marketing/Footer";
import Navbar from "@/components/marketing/Navbar";
import { SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/marketing-data";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} | ${SITE_TAGLINE}`,
    template: `%s | ${SITE_NAME}`
  },
  description: "Multi-tenant logistics SaaS for shipment operations, finance workflows, and white-label customer experiences."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-gray-900 antialiased">
        <Navbar />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
