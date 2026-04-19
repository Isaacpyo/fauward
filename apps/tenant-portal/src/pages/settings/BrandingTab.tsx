import { useState } from "react";
import { Link } from "react-router-dom";

import { BrandPreview } from "@/components/onboarding/BrandPreview";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useAppStore } from "@/stores/useAppStore";
import { useTenantStore } from "@/stores/useTenantStore";

export function BrandingTab() {
  const tenant = useTenantStore((state) => state.tenant);
  const addToast = useAppStore((state) => state.addToast);

  const [companyName, setCompanyName] = useState(tenant?.name ?? "Fauward Demo Tenant");
  const [logoUrl, setLogoUrl] = useState(tenant?.logo_url ?? "");
  const [primaryColor, setPrimaryColor] = useState(tenant?.primary_color ?? "#0D1F3C");
  const [accentColor, setAccentColor] = useState(tenant?.accent_color ?? "#D97706");
  const [trackingHeadline, setTrackingHeadline] = useState(
    "Real-time updates, branded proof of delivery, and customer messaging from one portal."
  );
  const [supportEmail, setSupportEmail] = useState(tenant?.support_email ?? "support@fauward.com");

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Brand studio</h3>
          <p className="text-sm text-gray-600">Configure the customer-facing identity for tracking, notifications, and portal surfaces.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild size="sm">
            <Link to="/track">Tracking page</Link>
          </Button>
          <Button asChild size="sm" variant="secondary">
            <Link to="/settings?tab=email">Email templates</Link>
          </Button>
          <Button asChild size="sm" variant="secondary">
            <Link to="/shipments">POD proof</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr,0.9fr]">
        <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-gray-700">
              Company name
              <Input value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="Your company name" />
            </label>
            <label className="text-sm font-medium text-gray-700">
              Support email
              <Input value={supportEmail} onChange={(event) => setSupportEmail(event.target.value)} placeholder="support@company.com" />
            </label>
            <label className="text-sm font-medium text-gray-700">
              Logo URL
              <Input value={logoUrl} onChange={(event) => setLogoUrl(event.target.value)} placeholder="https://cdn.example.com/logo.png" />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium text-gray-700">
                Primary color
                <Input value={primaryColor} onChange={(event) => setPrimaryColor(event.target.value)} placeholder="#0D1F3C" />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Accent color
                <Input value={accentColor} onChange={(event) => setAccentColor(event.target.value)} placeholder="#D97706" />
              </label>
            </div>
          </div>

          <label className="text-sm font-medium text-gray-700">
            Tracking headline
            <Textarea
              value={trackingHeadline}
              onChange={(event) => setTrackingHeadline(event.target.value)}
              placeholder="Short customer-facing reassurance message"
            />
          </label>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Branding checklist</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {[
                companyName.trim().length > 1 ? "Company name set" : "Add a company name",
                primaryColor.trim().length > 0 ? "Primary color chosen" : "Choose a primary color",
                supportEmail.trim().length > 0 ? "Support contact ready" : "Add support contact",
                logoUrl.trim().length > 0 ? "Logo linked" : "Optional logo not added"
              ].map((item) => (
                <div key={item} className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary">Reset draft</Button>
            <Button
              onClick={() =>
                addToast({
                  title: "Branding draft saved",
                  description: "Preview settings were stored locally for this session.",
                  variant: "success"
                })
              }
            >
              Save branding
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <BrandPreview companyName={companyName} logoUrl={logoUrl || undefined} primaryColor={primaryColor} />

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-sm font-semibold text-gray-900">Notification preview</p>
            </div>
            <div className="space-y-3 p-4">
              <div className="rounded-lg border border-gray-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Delivery update email</p>
                <p className="mt-2 text-base font-semibold text-gray-900">{companyName}: shipment out for delivery</p>
                <p className="mt-1 text-sm text-gray-600">{trackingHeadline}</p>
                <div className="mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold text-white" style={{ backgroundColor: primaryColor }}>
                  Track live delivery
                </div>
              </div>
              <div className="rounded-lg p-4 text-white" style={{ background: `linear-gradient(135deg, ${primaryColor}, ${accentColor})` }}>
                <p className="text-xs uppercase tracking-[0.16em] text-white/70">Customer support</p>
                <p className="mt-2 text-lg font-semibold">{supportEmail}</p>
                <p className="mt-1 text-sm text-white/80">Displayed on tracking, return flows, and delivery support surfaces.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
