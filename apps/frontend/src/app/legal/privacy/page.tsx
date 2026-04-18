import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Privacy Policy",
    description: "How Fauward collects, processes, and protects personal data under UK GDPR and applicable data protection laws.",
    path: "/legal/privacy",
    noIndex: false,
  });
}

const LAST_UPDATED = "18 April 2026";
const CONTROLLER = "Fauward Ltd";
const CONTACT_EMAIL = "privacy@fauward.com";

export default function PrivacyPolicyPage() {
  return (
    <section className="bg-white py-16 lg:py-24">
      <div className="marketing-container max-w-3xl">
        <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800">
          <strong>Last updated:</strong> {LAST_UPDATED}. This is a summary notice. A full legally-reviewed privacy policy will be published before public launch.
        </div>

        <h1 className="text-3xl font-bold text-gray-900 md:text-4xl">Privacy Policy</h1>
        <p className="mt-4 text-lg text-gray-600">
          This Privacy Policy explains how {CONTROLLER} (&quot;Fauward&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) collects, uses, and protects personal data when you use our website, platform, and services.
        </p>

        <div className="mt-10 space-y-10 text-sm leading-relaxed text-gray-700">

          <div>
            <h2 className="mb-3 text-xl font-bold text-gray-900">1. Data controller</h2>
            <p>{CONTROLLER} is the data controller for personal data processed through this website and the Fauward platform. We are registered in England and Wales.</p>
            <p className="mt-2">Contact us regarding data protection at: <a href={`mailto:${CONTACT_EMAIL}`} className="text-amber-700 underline">{CONTACT_EMAIL}</a></p>
          </div>

          <div>
            <h2 className="mb-3 text-xl font-bold text-gray-900">2. What data we collect</h2>
            <ul className="space-y-2 list-disc pl-5">
              <li><strong>Account data:</strong> Name, email address, company name, and password when you create a Fauward account.</li>
              <li><strong>Usage data:</strong> Pages visited, features used, browser type, device type, and IP address — collected via analytics tools.</li>
              <li><strong>Shipment and operational data:</strong> Shipment details, delivery addresses, recipient contact information, proof-of-delivery photos and signatures — collected by tenants using the platform.</li>
              <li><strong>Payment data:</strong> Billing information processed by our payment partners (Stripe, GoCardless, Paystack, M-Pesa). We do not store full card numbers.</li>
              <li><strong>Communications:</strong> Messages sent to support@fauward.com or through in-platform chat.</li>
            </ul>
          </div>

          <div>
            <h2 className="mb-3 text-xl font-bold text-gray-900">3. Legal bases for processing</h2>
            <ul className="space-y-2 list-disc pl-5">
              <li><strong>Contract performance:</strong> To provide the Fauward service you have signed up for.</li>
              <li><strong>Legitimate interests:</strong> To improve the platform, prevent fraud, and respond to enquiries.</li>
              <li><strong>Legal obligation:</strong> To comply with applicable tax, accounting, and data protection law.</li>
              <li><strong>Consent:</strong> For marketing emails and non-essential cookies (where we request it separately).</li>
            </ul>
          </div>

          <div>
            <h2 className="mb-3 text-xl font-bold text-gray-900">4. How we use your data</h2>
            <ul className="space-y-2 list-disc pl-5">
              <li>Providing, operating, and improving the Fauward platform</li>
              <li>Processing payments and sending invoices</li>
              <li>Sending transactional emails (account confirmations, password resets, shipment notifications)</li>
              <li>Responding to support enquiries</li>
              <li>Sending product updates and newsletters (with your consent)</li>
              <li>Complying with legal obligations (tax records, data subject requests)</li>
            </ul>
          </div>

          <div>
            <h2 className="mb-3 text-xl font-bold text-gray-900">5. Data sharing and sub-processors</h2>
            <p>We share data with the following categories of third parties to operate the platform:</p>
            <ul className="mt-2 space-y-1 list-disc pl-5">
              <li>Cloud infrastructure providers (hosting and storage)</li>
              <li>Payment processors (Stripe, GoCardless, Paystack, M-Pesa, Checkout.com)</li>
              <li>Email delivery providers (transactional and marketing email)</li>
              <li>Analytics providers (website and product analytics)</li>
              <li>Customer support tooling</li>
            </ul>
            <p className="mt-3">A full subprocessor list is available on request at <a href={`mailto:${CONTACT_EMAIL}`} className="text-amber-700 underline">{CONTACT_EMAIL}</a>.</p>
          </div>

          <div>
            <h2 className="mb-3 text-xl font-bold text-gray-900">6. International transfers</h2>
            <p>Fauward operates across the UK, Africa, and MENA. Where personal data is transferred outside the UK or European Economic Area, we rely on UK International Data Transfer Agreements (IDTAs) or EU Standard Contractual Clauses (SCCs), or we transfer to countries with an adequacy decision.</p>
          </div>

          <div>
            <h2 className="mb-3 text-xl font-bold text-gray-900">7. Data retention</h2>
            <p>We retain account data for as long as your account is active, plus up to 7 years for tax and accounting records. Shipment operational data is retained for the duration of your subscription plus 3 years. You can request deletion at any time (subject to legal retention obligations).</p>
          </div>

          <div>
            <h2 className="mb-3 text-xl font-bold text-gray-900">8. Your rights</h2>
            <p>Under UK GDPR and applicable data protection laws, you have the right to:</p>
            <ul className="mt-2 space-y-1 list-disc pl-5">
              <li>Access the personal data we hold about you</li>
              <li>Correct inaccurate data</li>
              <li>Request deletion of your data (right to erasure)</li>
              <li>Object to or restrict certain processing</li>
              <li>Data portability (receive your data in a machine-readable format)</li>
              <li>Withdraw consent at any time (where processing is based on consent)</li>
            </ul>
            <p className="mt-3">To exercise any right, contact <a href={`mailto:${CONTACT_EMAIL}`} className="text-amber-700 underline">{CONTACT_EMAIL}</a>. We will respond within 30 days.</p>
          </div>

          <div>
            <h2 className="mb-3 text-xl font-bold text-gray-900">9. Complaints</h2>
            <p>If you believe we have not handled your personal data correctly, you have the right to lodge a complaint with the UK Information Commissioner&apos;s Office (ICO) at <a href="https://ico.org.uk" target="_blank" rel="noreferrer" className="text-amber-700 underline">ico.org.uk</a> or by calling 0303 123 1113.</p>
          </div>

          <div>
            <h2 className="mb-3 text-xl font-bold text-gray-900">10. Cookies</h2>
            <p>We use essential cookies to operate the platform and optional analytics cookies to understand usage. You can manage cookie preferences via the consent banner shown on first visit. See our <a href="/legal/cookies" className="text-amber-700 underline">Cookie Policy</a> for full details.</p>
          </div>

          <div>
            <h2 className="mb-3 text-xl font-bold text-gray-900">11. Changes to this policy</h2>
            <p>We will update this policy as our practices evolve. Material changes will be communicated by email to registered users and via a notice on this page. Continued use of the platform after changes constitutes acceptance.</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
            <p className="font-semibold text-gray-900">Contact us</p>
            <p className="mt-1">Data protection enquiries: <a href={`mailto:${CONTACT_EMAIL}`} className="text-amber-700 underline">{CONTACT_EMAIL}</a></p>
            <p className="mt-1">General enquiries: <a href="mailto:support@fauward.com" className="text-amber-700 underline">support@fauward.com</a></p>
          </div>
        </div>
      </div>
    </section>
  );
}
