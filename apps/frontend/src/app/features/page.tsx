import type { Metadata } from "next";

import { buildMetadata } from "@/lib/seo";
import FeaturesIndexContent from "./FeaturesIndexContent";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Logistics features built for scale",
    description: "Explore Fauward shipment management, finance, white-label, and AI agent features — built for couriers, freight, and 3PLs.",
    path: "/features",
  });
}

export default function FeaturesOverviewPage() {
  return <FeaturesIndexContent />;
}
