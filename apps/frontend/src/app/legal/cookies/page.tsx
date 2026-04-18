import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Cookie Policy",
    description: "How Fauward uses cookies and similar technologies, and how you can manage your preferences.",
    path: "/legal/cookies",
  });
}

const LAST_UPDATED = "18 April 2026";

export default function CookiePolicyPage() {
  return (
    <section className="bg-white py-16 lg:py-24">
      <div className="marketing-container max-w-3xl">
        <h1 className="text-3xl font-bold text-gray-900 md:text-4xl">Cookie Policy</h1>
        <p className="mt-2 text-sm text-gray-500">Last updated: {LAST_UPDATED}</p>
        <p className="mt-5 text-lg text-gray-600">
          This Cookie Policy explains what cookies are, which cookies Fauward uses, and how you can control them.
        </p>

        <div className="mt-10 space-y-10 text-sm leading-relaxed text-gray-700">

          <div>
            <h2 className="mb-3 text-xl font-bold text-gray-900">What are cookies?</h2>
            <p>Cookies are small text files stored on your device when you visit a website. They allow websites to remember your preferences, keep you logged in, and measure how the site is used.</p>
          </div>

          <div>
            <h2 className="mb-3 text-xl font-bold text-gray-900">Cookies we use</h2>
            <div className="overflow-hidden rounded-xl border border-gray-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-gray-700">Category</th>
                    <th className="px-4 py-3 font-semibold text-gray-700">Purpose</th>
                    <th className="px-4 py-3 font-semibold text-gray-700">Consent required?</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[
                    { category: "Strictly necessary", purpose: "Login sessions, security tokens, CSRF protection. The platform cannot function without these.", consent: "No" },
                    { category: "Functional", purpose: "Remember your preferences (language, region, display settings).", consent: "No" },
                    { category: "Analytics", purpose: "Measure page views, traffic sources, and feature usage to improve the product. We use privacy-friendly analytics (no fingerprinting).", consent: "Yes" },
                    { category: "Marketing", purpose: "If we run paid advertising, conversion tracking pixels may be set after consent is granted.", consent: "Yes" },
                  ].map((row) => (
                    <tr key={row.category}>
                      <td className="px-4 py-3 font-medium text-gray-900">{row.category}</td>
                      <td className="px-4 py-3 text-gray-600">{row.purpose}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${row.consent === "No" ? "bg-gray-100 text-gray-600" : "bg-amber-50 text-amber-700"}`}>
                          {row.consent}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-xl font-bold text-gray-900">Managing your preferences</h2>
            <p>When you first visit Fauward, you will be shown a consent banner allowing you to accept or decline non-essential cookies. You can change your preferences at any time by clicking &quot;Cookie preferences&quot; in the site footer.</p>
            <p className="mt-3">You can also control cookies at the browser level:</p>
            <ul className="mt-2 space-y-1 list-disc pl-5">
              <li><a href="https://support.google.com/chrome/answer/95647" target="_blank" rel="noreferrer" className="text-amber-700 underline">Chrome</a></li>
              <li><a href="https://support.mozilla.org/en-US/kb/enhanced-tracking-protection-firefox-desktop" target="_blank" rel="noreferrer" className="text-amber-700 underline">Firefox</a></li>
              <li><a href="https://support.apple.com/en-gb/guide/safari/sfri11471/mac" target="_blank" rel="noreferrer" className="text-amber-700 underline">Safari</a></li>
              <li><a href="https://support.microsoft.com/en-us/windows/manage-cookies-in-microsoft-edge-168dab11-0753-043d-7c16-ede5947fc64d" target="_blank" rel="noreferrer" className="text-amber-700 underline">Edge</a></li>
            </ul>
            <p className="mt-3">Blocking all cookies will prevent you from logging in to the Fauward platform.</p>
          </div>

          <div>
            <h2 className="mb-3 text-xl font-bold text-gray-900">Third-party cookies</h2>
            <p>Analytics and marketing tools we use may set their own cookies. We only activate these where you have given consent. A full list of third-party tools is included in our <a href="/legal/privacy" className="text-amber-700 underline">Privacy Policy</a>.</p>
          </div>

          <div>
            <h2 className="mb-3 text-xl font-bold text-gray-900">Contact</h2>
            <p>Questions about cookies? Email <a href="mailto:privacy@fauward.com" className="text-amber-700 underline">privacy@fauward.com</a>.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
