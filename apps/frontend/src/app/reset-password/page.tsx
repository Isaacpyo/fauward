import type { Metadata } from "next";

import { buildMetadata } from "@/lib/seo";

import ResetPasswordPageClient from "./ResetPasswordPageClient";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Reset password",
    description: "Set a new password for your Fauward account.",
    path: "/reset-password",
    noIndex: true,
  });
}

export default function ResetPasswordPage() {
  return <ResetPasswordPageClient />;
}
