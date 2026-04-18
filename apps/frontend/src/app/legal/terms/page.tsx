import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Terms of Service",
    description: "Terms governing access to the Fauward platform, billing, acceptable use, and support.",
    path: "/legal/terms",
  });
}

const LAST_UPDATED = "18 April 2026";
const COMPANY = "Fauward Ltd";

export default function TermsPage() {
  return (
    <section className="bg-white py-16 lg:py-24">
      <div className="marketing-container max-w-3xl">
        <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800">
          <strong>Last updated:</strong> {LAST_UPDATED}. A full legally-reviewed Terms of Service will be published before public launch.
        </div>

        <h1 className="text-3xl font-bold text-gray-900 md:text-4xl">Terms of Service</h1>
        <p className="mt-4 text-lg text-gray-600">
          These Terms of Service (&quot;Terms&quot;) govern your access to and use of the Fauward platform and services provided by {COMPANY} (&quot;Fauward&quot;, &quot;we&quot;, &quot;us&quot;). By creating an account or using the platform, you agree to these Terms.
        </p>

        <div className="mt-10 space-y-10 text-sm leading-relaxed text-gray-700">

          <div>
            <h2 className="mb-3 text-xl font-bold text-gray-900">1. The service</h2>
            <p>Fauward provides a multi-tenant logistics SaaS platform including shipment management, finance and invoicing tools, driver mobile applications, customer tracking portals, and associated APIs. Features available to you depend on your subscription plan.</p>
          </div>

          <div>
            <h2 className="mb-3 text-xl font-bold text-gray-900">2. Account registration</h2>
            <p>You must provide accurate account information. You are responsible for maintaining the security of your credentials. You may not share login access. You must be at least 18 years old and authorised to enter contracts on behalf of any company you register.</p>
          </div>

          <div>
            <h2 className="mb-3 text-xl font-bold text-gray-900">3. Subscriptions and billing</h2>
            <ul className="space-y-2 list-disc pl-5">
              <li>Subscriptions begin immediately on signup. Free trials last 14 days with full feature access.</li>
              <li>Monthly plans are billed monthly in advance. Annual plans are billed annually.</li>
              <li>You may cancel at any time. Cancellations take effect at the end of the current billing period — no partial-period refunds.</li>
              <li>Fauward reserves the right to change pricing with 30 days&apos; notice. Enterprise pricing is set by contract.</li>
              <li>Payments are processed by our payment partners (Stripe, GoCardless, Paystack, etc.). Fauward does not store card data.</li>
            </ul>
          </div>

          <div>
            <h2 className="mb-3 text-xl font-bold text-gray-900">4. Plan limits</h2>
            <p>Each plan includes a stated monthly shipment allowance and staff seat limit. Exceeding the shipment allowance in a billing period may result in a prompt to upgrade. Fauward will not automatically charge overages without notice.</p>
          </div>

          <div>
            <h2 className="mb-3 text-xl font-bold text-gray-900">5. Acceptable use</h2>
            <p>You may not use Fauward to:</p>
            <ul className="mt-2 space-y-1 list-disc pl-5">
              <li>Process illegal shipments or facilitate illegal activities</li>
              <li>Infringe third-party intellectual property rights</li>
              <li>Transmit malware or attempt to compromise platform security</li>
              <li>Scrape or extract data at scale without written permission</li>
              <li>Resell access to the platform without our written agreement</li>
            </ul>
          </div>

          <div>
            <h2 className="mb-3 text-xl font-bold text-gray-900">6. Your data</h2>
            <p>You own your data. Fauward processes it to deliver the service. We will not sell your data or use it to train AI models without your consent. On termination you may export your data for 30 days. After that, data is deleted per our Privacy Policy.</p>
          </div>

          <div>
            <h2 className="mb-3 text-xl font-bold text-gray-900">7. Intellectual property</h2>
            <p>The Fauward platform, brand, and all associated software are owned by {COMPANY}. Your use of the platform grants you a limited, non-exclusive, non-transferable licence to use the software as a service. No rights in the underlying codebase are transferred to you.</p>
          </div>

          <div>
            <h2 className="mb-3 text-xl font-bold text-gray-900">8. Uptime and service levels</h2>
            <p>Fauward targets 99.9% monthly uptime for Enterprise customers (as defined in enterprise contracts). Starter and Pro plans are provided on a best-effort basis. Scheduled maintenance will be communicated in advance where possible.</p>
            <p className="mt-2">Service status is published at <a href="https://status.fauward.com" target="_blank" rel="noreferrer" className="text-amber-700 underline">status.fauward.com</a> (coming soon).</p>
          </div>

          <div>
            <h2 className="mb-3 text-xl font-bold text-gray-900">9. Limitation of liability</h2>
            <p>To the maximum extent permitted by law, Fauward&apos;s aggregate liability for any claim arising from use of the platform is limited to the fees paid by you in the 12 months preceding the claim. Fauward is not liable for indirect, consequential, or incidental losses.</p>
          </div>

          <div>
            <h2 className="mb-3 text-xl font-bold text-gray-900">10. Termination</h2>
            <p>Either party may terminate at any time. We may suspend or terminate accounts that violate these Terms, with notice where practical. On termination, your access ends immediately and your data enters the 30-day export window.</p>
          </div>

          <div>
            <h2 className="mb-3 text-xl font-bold text-gray-900">11. Governing law</h2>
            <p>These Terms are governed by the laws of England and Wales. Disputes will be resolved in the courts of England and Wales, unless an enterprise agreement specifies alternative dispute resolution.</p>
          </div>

          <div>
            <h2 className="mb-3 text-xl font-bold text-gray-900">12. Changes</h2>
            <p>We may update these Terms. Material changes will be communicated by email at least 30 days in advance. Continued use after the effective date constitutes acceptance of updated terms.</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
            <p className="font-semibold text-gray-900">Questions about these Terms?</p>
            <p className="mt-1">Email <a href="mailto:legal@fauward.com" className="text-amber-700 underline">legal@fauward.com</a> or contact support at <a href="mailto:support@fauward.com" className="text-amber-700 underline">support@fauward.com</a>.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
