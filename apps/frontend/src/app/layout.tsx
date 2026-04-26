import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import CookieConsent from "@/components/marketing/CookieConsent";
import Footer from "@/components/marketing/Footer";
import Navbar from "@/components/marketing/Navbar";
import StructuredData from "@/components/seo/StructuredData";
import { SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/marketing-data";
import {
  MARKETING_KEYWORDS,
  buildOrganizationSchema,
  buildWebsiteSchema,
} from "@/lib/seo";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} | ${SITE_TAGLINE}`,
    template: `%s | ${SITE_NAME}`,
  },
  description:
    "Multi-tenant logistics software for shipment operations, invoicing, branded tracking, and white-label customer experiences.",
  applicationName: SITE_NAME,
  creator: SITE_NAME,
  publisher: SITE_NAME,
  keywords: MARKETING_KEYWORDS,
  category: "Logistics software",
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    title: `${SITE_NAME} | ${SITE_TAGLINE}`,
    description:
      "Multi-tenant logistics software for shipment operations, invoicing, branded tracking, and white-label customer experiences.",
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    locale: "en_GB",
    images: [
      {
        url: "/images/og/marketing-og.svg",
        width: 1200,
        height: 630,
        alt: `${SITE_NAME} marketing`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} | ${SITE_TAGLINE}`,
    description:
      "Multi-tenant logistics software for shipment operations, invoicing, branded tracking, and white-label customer experiences.",
    images: ["/images/og/marketing-og.svg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  formatDetection: {
    address: false,
    email: false,
    telephone: false,
  },
  icons: {
    icon: "/brand/logo-mark.png",
    apple: "/brand/logo-mark.png",
    shortcut: "/brand/logo-mark.png",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-gray-900 antialiased">
        <StructuredData data={[buildOrganizationSchema(), buildWebsiteSchema()]} />
        <Navbar />
        <main>{children}</main>
        <Footer />
        <CookieConsent />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
