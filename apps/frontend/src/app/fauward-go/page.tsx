import type { Metadata } from "next";

import CTABanner from "@/components/marketing/CTABanner";
import { buildMetadata } from "@/lib/seo";

import FauwardGoPageContent from "./FauwardGoPageContent";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Fauward Go — Field Operations PWA for Operators",
    description:
      "Fauward Go is the offline-first PWA for field operators across the shipment lifecycle — from creation and warehouse intake through dispatch, pickup, linehaul, delivery, and returns. QR scan, OTP confirmation, photo proof of delivery, signature capture, and automatic sync.",
    path: "/fauward-go",
    keywords: [
      "field operations app",
      "proof of delivery app",
      "courier operator app",
      "offline delivery app",
      "logistics operator PWA",
    ],
  });
}

export default function FauwardGoPage() {
  return (
    <>
      <FauwardGoPageContent />
      <CTABanner />
    </>
  );
}
