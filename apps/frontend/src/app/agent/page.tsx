import type { Metadata } from "next";

import { buildMetadata } from "@/lib/seo";
import AgentPageContent from "./AgentPageContent";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Fauward Agent — AI-powered logistics operations",
    description:
      "Fauward Agent is a policy-controlled AI layer that automates safe operations, escalates risky ones for approval, and keeps your logistics running 24/7.",
    path: "/agent",
  });
}

export default function AgentPage() {
  return <AgentPageContent />;
}
