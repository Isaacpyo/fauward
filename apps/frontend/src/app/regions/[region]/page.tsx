import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import CTABanner from "@/components/marketing/CTABanner";
import StructuredData from "@/components/seo/StructuredData";
import { REGIONS } from "@/lib/marketing-data";
import { buildBreadcrumbSchema, buildMetadata } from "@/lib/seo";

type RegionPageProps = {
  params: { region: string };
};

// Per-region rich content that replaces the boilerplate
const REGION_DETAIL: Record<string, {
  headline: string;
  intro: string;
  paymentMethods: Array<{ name: string; note: string }>;
  carriers: string[];
  regulatory: string[];
  operationalHighlights: Array<{ title: string; body: string }>;
  ctaNote: string;
}> = {
  uk: {
    headline: "Run UK courier and freight operations on software that understands the market",
    intro:
      "From multi-depot urban couriers to nationwide freight operators, Fauward handles the full UK logistics stack — VAT-ready invoicing, GoCardless direct debit, Royal Mail and DPD connectors, and a driver mobile app built for British roads.",
    paymentMethods: [
      { name: "Stripe", note: "Card-not-present payments for B2C and B2B invoices" },
      { name: "GoCardless", note: "Direct debit for recurring freight accounts" },
      { name: "BACS", note: "Bank transfer settlement for enterprise accounts" },
    ],
    carriers: ["Royal Mail", "DPD", "Evri", "DHL UK", "Parcelforce", "Yodel"],
    regulatory: [
      "VAT-ready invoice generation (Standard, Zero, and Exempt rate handling)",
      "UK GDPR–compliant data processing and audit trail",
      "Companies Act 2006 reporting-ready ledger exports",
      "IR35-aware driver payment controls for gig-economy fleets",
    ],
    operationalHighlights: [
      {
        title: "Multi-depot visibility",
        body: "Manage collections, transfers, and final-mile delivery across depots in London, Manchester, Birmingham, and beyond from a single dashboard.",
      },
      {
        title: "Named-day and timed delivery windows",
        body: "Offer customers specific delivery windows and let dispatchers manage booking density per zone — without spreadsheets.",
      },
      {
        title: "Rural and island routing",
        body: "Handle surcharge zones, restricted postcodes, and scheduled island services with route-level pricing and customer notification.",
      },
    ],
    ctaNote: "14-day free trial · No card required · Live in under 10 minutes",
  },
  africa: {
    headline: "Logistics software built for the realities of African operations",
    intro:
      "From Lagos to Nairobi, Fauward supports the payment methods, connectivity realities, and cross-border workflows that African logistics operators actually face — including offline driver mode, M-Pesa collections, and COD management.",
    paymentMethods: [
      { name: "M-Pesa", note: "Mobile money for Kenya, Tanzania, and DRC operations" },
      { name: "Paystack", note: "Card and bank transfers for Nigeria and Ghana" },
      { name: "Flutterwave", note: "Pan-African multi-currency payment routing" },
      { name: "MTN MoMo", note: "Mobile money for West and Central Africa" },
    ],
    carriers: ["GIG Logistics", "DHL Africa", "Courier Plus", "Speedaf", "G4S Logistics", "Aramex Africa"],
    regulatory: [
      "Nigeria Data Protection Act 2023 – compliant data handling",
      "Kenya Data Protection Act 2019 – tenant-scoped data isolation",
      "Multi-currency invoicing with automatic exchange rate logging",
      "Cross-border manifest and customs document generation",
    ],
    operationalHighlights: [
      {
        title: "Offline-first driver app",
        body: "Drivers capture signatures, photos, and barcodes without a data connection. Actions queue locally and sync the moment connectivity returns — no data is lost.",
      },
      {
        title: "Cash-on-delivery workflow",
        body: "Track COD collections per driver, reconcile cash at depot, and generate settlement statements automatically — eliminating end-of-day manual counting.",
      },
      {
        title: "Cross-border operations",
        body: "Manage shipments across Nigeria, Ghana, Kenya, and beyond with per-country tax handling, currency conversion, and border crossing documentation.",
      },
    ],
    ctaNote: "Serving Nigeria, Kenya, Ghana, Tanzania, Uganda, and South Africa",
  },
  mena: {
    headline: "Logistics platform for MENA operators — COD, Aramex, and regional compliance built in",
    intro:
      "Fauward's MENA coverage handles the payment flexibility, hub-and-spoke routing, and regional compliance requirements of Gulf, Levant, and North African logistics operations — without expensive custom development.",
    paymentMethods: [
      { name: "Checkout.com", note: "Card payments optimised for MENA card networks" },
      { name: "HyperPay", note: "GCC-region payment gateway with mada and KNET support" },
      { name: "COD workflows", note: "Structured cash-on-delivery reconciliation and settlement" },
      { name: "Tabby / Tamara", note: "BNPL for e-commerce delivery clients" },
    ],
    carriers: ["Aramex", "SMSA Express", "Fetchr", "Naqel", "Quiqup", "DHL MENA"],
    regulatory: [
      "UAE Federal Decree-Law No. 45/2021 (PDPL) – compliant data handling",
      "KSA PDPL – sensitive data handling with configurable localisation",
      "DIFC and ADGM compatible data architecture",
      "VAT/GST-ready invoice generation for UAE, KSA, Bahrain, and Jordan",
    ],
    operationalHighlights: [
      {
        title: "Hub-and-spoke routing",
        body: "Model your GCC hub network in Fauward — from central sorting facilities in Dubai or Riyadh to last-mile spokes across the UAE, KSA, Kuwait, and Bahrain.",
      },
      {
        title: "Arabic-locale customer notifications",
        body: "Send shipment status updates in Arabic or English — right-to-left rendering, localised SMS templates, and WhatsApp notification support.",
      },
      {
        title: "Ramadan and public holiday routing",
        body: "Configure operational calendars per country, so cut-off times, SLA calculations, and driver scheduling automatically account for public holidays.",
      },
    ],
    ctaNote: "Serving UAE, KSA, Qatar, Kuwait, Bahrain, Jordan, Egypt, and Morocco",
  },
  global: {
    headline: "One account. Three regions. Consistent operations across every market",
    intro:
      "For logistics businesses operating across the UK, Africa, and MENA simultaneously, Fauward provides one account, one dashboard, and one API — with tenant-level isolation, per-region compliance, and unified KPI reporting.",
    paymentMethods: [
      { name: "Multi-currency ledger", note: "GBP, USD, EUR, NGN, KES, AED, SAR and more" },
      { name: "Per-region gateways", note: "Each tenant routes through the correct regional payment processor" },
      { name: "Unified settlement reporting", note: "Cross-currency P&L at account and tenant level" },
    ],
    carriers: ["DHL Global", "Aramex", "FedEx", "UPS", "Regional specialist carriers per market"],
    regulatory: [
      "UK GDPR / EU GDPR – UK and European data processing",
      "Nigeria, Kenya, and Ghana data protection law compliance",
      "UAE PDPL and KSA PDPL – Gulf data handling",
      "Cross-border shipment documentation and customs manifest generation",
    ],
    operationalHighlights: [
      {
        title: "Multi-tenant architecture",
        body: "Each client or regional entity operates as an isolated tenant — their own branded portal, their own data, their own carrier configuration — managed from one top-level account.",
      },
      {
        title: "Unified reporting",
        body: "Aggregate shipment volume, revenue, and SLA performance across all regions and tenants. Compare markets, surface outliers, and report to leadership without CSV stitching.",
      },
      {
        title: "Governance with local execution",
        body: "Set global policies (roles, data retention, API access) at the top account level while allowing region managers to run day-to-day operations independently.",
      },
    ],
    ctaNote: "Multi-region deployments available on Pro and Enterprise plans",
  },
};

function getRegion(regionSlug: string) {
  return REGIONS.find((region) => region.slug === regionSlug);
}

export function generateStaticParams() {
  return REGIONS.map((region) => ({ region: region.slug }));
}

export function generateMetadata({ params }: RegionPageProps): Metadata {
  const region = getRegion(params.region);

  if (!region) {
    return buildMetadata({
      title: "Region not found",
      description: "The requested regional page is unavailable.",
      path: `/regions/${params.region}`,
      noIndex: true,
    });
  }

  const detail = REGION_DETAIL[region.slug];

  return buildMetadata({
    title: `${region.name} logistics platform`,
    description: detail?.intro.slice(0, 160) ?? region.summary,
    path: `/regions/${region.slug}`,
  });
}

export default function RegionPage({ params }: RegionPageProps) {
  const region = getRegion(params.region);

  if (!region) notFound();

  const detail = REGION_DETAIL[region.slug];

  return (
    <>
      <StructuredData
        data={buildBreadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Regions", path: "/regions/uk" },
          { name: region.name, path: `/regions/${region.slug}` },
        ])}
      />

      {/* Hero */}
      <section className="relative overflow-hidden bg-[#0d1f3c] py-20 lg:py-28">
        <div className="absolute inset-0 bg-grid opacity-20" aria-hidden />
        <div className="pointer-events-none absolute right-0 top-0 h-80 w-80 translate-x-1/4 -translate-y-1/4 rounded-full bg-amber-500/10 blur-3xl" aria-hidden />
        <div className="marketing-container relative">
          <p className="mb-4 inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-amber-400">
            {region.name}
          </p>
          <h1 className="max-w-3xl text-4xl font-bold leading-tight text-white lg:text-5xl">
            {detail?.headline ?? region.summary}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-blue-200">{detail?.intro ?? region.summary}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/signup" className="inline-flex h-12 items-center justify-center rounded-lg bg-amber-600 px-8 text-base font-semibold text-white transition hover:bg-amber-700">
              Start Free Trial
            </Link>
            <Link href="/support#contact" className="inline-flex h-12 items-center justify-center rounded-lg border border-white/20 px-8 text-base font-semibold text-white transition hover:bg-white/10">
              Talk to sales
            </Link>
          </div>
          {detail && (
            <p className="mt-4 text-xs text-blue-400">{detail.ctaNote}</p>
          )}
        </div>
      </section>

      {/* Operational highlights */}
      {detail && (
        <section className="bg-white py-16 lg:py-20">
          <div className="marketing-container">
            <h2 className="mb-10 text-2xl font-bold text-gray-900">How Fauward works for {region.name}</h2>
            <div className="grid gap-6 md:grid-cols-3">
              {detail.operationalHighlights.map((h) => (
                <div key={h.title} className="card-lift rounded-2xl border border-gray-200 bg-white p-7 shadow-sm">
                  <h3 className="mb-3 font-bold text-gray-900">{h.title}</h3>
                  <p className="text-sm leading-relaxed text-gray-600">{h.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Payment methods + carriers */}
      {detail && (
        <section className="bg-gray-50 py-16 lg:py-20">
          <div className="marketing-container">
            <div className="grid gap-12 lg:grid-cols-2">
              {/* Payment methods */}
              <div>
                <h2 className="mb-6 text-xl font-bold text-gray-900">Payment methods</h2>
                <div className="space-y-3">
                  {detail.paymentMethods.map((pm) => (
                    <div key={pm.name} className="flex items-start gap-4 rounded-xl bg-white border border-gray-200 px-5 py-4">
                      <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                      <div>
                        <p className="text-sm font-bold text-gray-900">{pm.name}</p>
                        <p className="text-xs text-gray-500">{pm.note}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Carriers + Regulatory */}
              <div className="space-y-8">
                <div>
                  <h2 className="mb-4 text-xl font-bold text-gray-900">Carrier integrations</h2>
                  <div className="flex flex-wrap gap-2">
                    {detail.carriers.map((c) => (
                      <span key={c} className="inline-flex rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <h2 className="mb-4 text-xl font-bold text-gray-900">Compliance & regulatory</h2>
                  <ul className="space-y-2">
                    {detail.regulatory.map((r) => (
                      <li key={r} className="flex items-start gap-2 text-sm text-gray-700">
                        <svg className="mt-0.5 h-4 w-4 shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Highlights badges */}
      <section className="bg-white py-14">
        <div className="marketing-container">
          <h2 className="mb-6 text-xl font-bold text-gray-900">Key capabilities for {region.name}</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {region.highlights.map((highlight) => (
              <div key={highlight} className="rounded-xl border border-gray-200 bg-gray-50 px-6 py-5">
                <p className="text-sm font-semibold text-gray-900">{highlight}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CTABanner
        title={`Ready to launch in ${region.name}?`}
        description="Start a free trial or talk to our team about your region-specific workflows."
        ctaLabel="Start Free Trial"
        ctaHref="/signup"
        secondaryLabel="Talk to sales"
        secondaryHref="/support#contact"
      />
    </>
  );
}
