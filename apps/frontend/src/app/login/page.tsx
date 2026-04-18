import type { Metadata } from "next";

import { buildMetadata } from "@/lib/seo";

import LoginPageClient from "./LoginPageClient";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Sign in",
    description: "Access your Fauward account and tenant dashboard.",
    path: "/login",
    noIndex: true,
  });
}

export default function LoginPage() {
  return <LoginPageClient />;
}
