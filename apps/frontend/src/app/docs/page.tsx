import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DOCS_URL } from "@/lib/marketing-data";
import { buildMetadata } from "@/lib/seo";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Developer documentation",
    description: "Explore Fauward setup guides, API documentation, and integration references.",
    path: "/docs"
  });
}

export default function DocsPage() {
  redirect(DOCS_URL);
}
