import type { Metadata } from "next";

import { buildMetadata } from "@/lib/seo";

import ForgotPasswordPageClient from "./ForgotPasswordPageClient";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Forgot password",
    description: "Request a Fauward password reset email.",
    path: "/forgot-password",
    noIndex: true,
  });
}

export default function ForgotPasswordPage() {
  return <ForgotPasswordPageClient />;
}
