import type { Metadata } from "next";

import { buildMetadata } from "@/lib/seo";

import SignupPageContent from "./SignupPageContent";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Start your free trial",
    description: "Create your Fauward account and launch your tenant portal onboarding flow.",
    path: "/signup",
    noIndex: true,
  });
}

export default function SignupPage() {
  return <SignupPageContent />;
}
