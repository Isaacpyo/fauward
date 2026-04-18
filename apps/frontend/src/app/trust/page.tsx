import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import StructuredData from "@/components/seo/StructuredData";
import { buildBreadcrumbSchema } from "@/lib/seo";
import Link from "next/link";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Trust & Security",
    description: "How Fauward protects your data — encryption, access controls, UK GDPR compliance, and infrastructure security.",
    path: "/trust",
  });
}

const securityPillars = [
  {
    title: "Data encryption",
    icon: "🔒",
    points: [
      "All data encrypted in transit via TLS 1.2+",
      "Data at rest encrypted via AES-256",
      "Database backups encrypted before offsite storage",
      "Encryption keys managed per-tenant",
    ],
  },
  {
    title: "Authentication & access",
    icon: "🛡️",
    points: [
      "Multi-factor authentication (MFA) enforced on all staff accounts",
      "SAML/SSO available on Enterprise plans",
      "Role-based access control (RBAC) across all platform modules",
      "Principle of least privilege applied to all infrastructure access",
    ],
  },
  {
    title: "Infrastructure",
    icon: "🏗️",
    points: [
      "Hosted on ISO 27001-certified cloud infrastructure (Railway / AWS)",
      "Separate staging and production environments",
      "Automated vulnerability scanning on every deploy",
      "Dependency security updates applied within 72 hours of critical CVEs",
    ],
  },
  {
    title: "Data residency",
    icon: "🌍",
    points: [
      "UK/EU tenants: data processed and stored within UK/EU data centres",
      "Africa tenants: data processed within the region where available",
      "No cross-region data transfer without explicit tenant configuration",
      "Data residency region confirmed at signup",
    ],
  },
  {
    title: "Compliance",
    icon: "📋",
    points: [
      "UK GDPR and Data Protection Act 2018 compliant",
      "ICO-registered data controller",
      "Sub-processor list maintained and disclosed in Privacy Policy",
      "PECR-compliant cookie consent on all web properties",
    ],
  },
  {
    title: "Operational security",
    icon: "🔍",
    points: [
      "Audit logs for all admin and data-access actions",
      "Security incident response plan with defined RTO/RPO",
      "Annual internal security reviews",
      "Staff security training and background screening",
    ],
  },
];

const certifications = [
  { name: "UK GDPR", status: "Compliant", description: "Data processed lawfully under the Data Protection Act 2018 and UK GDPR." },
  { name: "ISO 27001", status: "Infrastructure", description: "Hosted on ISO 27001-certified cloud providers. Platform-level certification in roadmap." },
  { name: "SOC 2 Type II", status: "In roadmap", description: "Formal audit underway. Enterprise customers may request interim security questionnaire." },
  { name: "PCI DSS", status: "Delegated", description: "Card data handled exclusively by PCI-compliant payment processors (Stripe, GoCardless, Paystack). Fauward stores no card data." },
];

export default function TrustPage() {
  return (
    <>
      <StructuredData data={[buildBreadcrumbSchema([{ name: "Home", href: "/" }, { name: "Trust & Security", href: "/trust" }])]} />

      {/* Hero */}
      <section className="bg-[#0d1f3c] py-20 lg:py-28">
        <div className="marketing-container text-center">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-green-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-green-400">
            Security & compliance
          </p>
          <h1 className="text-4xl font-extrabold tracking-tight text-white md:text-5xl">
            Built with trust at the foundation
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-blue-200">
            Your logistics data is mission-critical. Here&apos;s how Fauward protects it — from infrastructure to compliance.
          </p>
        </div>
      </section>

      {/* Security pillars */}
      <section className="bg-white py-16 lg:py-24">
        <div className="marketing-container">
          <h2 className="text-2xl font-bold text-gray-900">Security architecture</h2>
          <p className="mt-2 text-sm text-gray-600">
            Multi-layered security across every part of the platform.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {securityPillars.map((p) => (
              <div key={p.title} className="card-lift rounded-2xl border border-gray-200 bg-white p-7 shadow-sm">
                <p className="text-3xl">{p.icon}</p>
                <h3 className="mt-3 text-base font-bold text-gray-900">{p.title}</h3>
                <ul className="mt-4 space-y-2">
                  {p.points.map((pt) => (
                    <li key={pt} className="flex items-start gap-2 text-sm text-gray-600">
                      <span className="mt-0.5 h-4 w-4 shrink-0 text-green-500">✓</span>
                      {pt}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Certifications */}
      <section className="bg-gray-50 py-16">
        <div className="marketing-container">
          <h2 className="text-2xl font-bold text-gray-900">Certifications & standards</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {certifications.map((c) => (
              <div key={c.name} className="rounded-xl border border-gray-200 bg-white p-6">
                <div className="flex items-start justify-between gap-4">
                  <h3 className="font-bold text-gray-900">{c.name}</h3>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                    c.status === "Compliant" ? "bg-green-100 text-green-700" :
                    c.status === "Infrastructure" ? "bg-blue-100 text-blue-700" :
                    c.status === "Delegated" ? "bg-purple-100 text-purple-700" :
                    "bg-gray-100 text-gray-600"
                  }`}>{c.status}</span>
                </div>
                <p className="mt-2 text-sm text-gray-600">{c.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Responsible disclosure */}
      <section className="bg-white py-16">
        <div className="marketing-container max-w-2xl">
          <h2 className="text-2xl font-bold text-gray-900">Responsible disclosure</h2>
          <p className="mt-3 text-sm leading-relaxed text-gray-600">
            We take security vulnerabilities seriously. If you believe you&apos;ve found a security issue in the Fauward platform, please disclose it responsibly by emailing{" "}
            <a href="mailto:security@fauward.com" className="text-amber-700 underline">security@fauward.com</a>.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-gray-600">
            We commit to acknowledging reports within 48 hours and providing a resolution timeline within 5 business days. We do not pursue legal action against researchers who disclose in good faith.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#0d1f3c] py-16">
        <div className="marketing-container max-w-2xl text-center">
          <h2 className="text-2xl font-bold text-white">Security questions?</h2>
          <p className="mt-3 text-sm text-blue-200">
            Enterprise customers can request our full security questionnaire, sub-processor list, and data processing agreement.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/support#contact"
              className="inline-flex h-11 items-center justify-center rounded-lg bg-amber-600 px-8 text-sm font-semibold text-white transition hover:bg-amber-700"
            >
              Talk to Sales
            </Link>
            <a
              href="mailto:security@fauward.com"
              className="inline-flex h-11 items-center justify-center rounded-lg border border-white/20 px-8 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              security@fauward.com
            </a>
          </div>
          <div className="mt-6 flex items-center justify-center gap-6 text-xs text-blue-300">
            <Link href="/legal/privacy" className="hover:text-amber-400 underline">Privacy Policy</Link>
            <Link href="/legal/terms" className="hover:text-amber-400 underline">Terms of Service</Link>
            <Link href="/legal/cookies" className="hover:text-amber-400 underline">Cookie Policy</Link>
          </div>
        </div>
      </section>
    </>
  );
}
