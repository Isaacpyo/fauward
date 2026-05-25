import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import {
  BrandingValidationError,
  useUpdateBranding,
  type BrandingFieldErrors
} from "@/api/branding";
import { BrandPreview } from "@/components/onboarding/BrandPreview";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useAppStore } from "@/stores/useAppStore";
import { useTenantStore } from "@/stores/useTenantStore";

const HEX_RE = /^#([0-9a-fA-F]{6})$/;
const HTTPS_RE = /^https:\/\/\S+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DEFAULT_TRACKING_HEADLINE =
  "Real-time updates, branded proof of delivery, and customer messaging from one portal.";

type FormState = {
  companyName: string;
  supportEmail: string;
  logoUrl: string;
  primaryColor: string;
  accentColor: string;
  trackingHeadline: string;
};

function buildFormState(tenant: ReturnType<typeof useTenantStore.getState>["tenant"]): FormState {
  return {
    companyName: tenant?.brand_name ?? tenant?.name ?? "",
    supportEmail: tenant?.support_email ?? "",
    logoUrl: tenant?.logo_url ?? "",
    primaryColor: tenant?.primary_color ?? "#0D1F3C",
    accentColor: tenant?.accent_color ?? "#D97706",
    trackingHeadline: tenant?.tracking_headline ?? DEFAULT_TRACKING_HEADLINE
  };
}

function validateClient(form: FormState): BrandingFieldErrors {
  const errors: BrandingFieldErrors = {};
  if (form.companyName.trim().length < 2) errors.brandName = "Must be at least 2 characters";
  if (!HEX_RE.test(form.primaryColor)) errors.primaryColor = "Must be a 6-digit hex color (e.g. #2563EB)";
  if (form.accentColor.length > 0 && !HEX_RE.test(form.accentColor))
    errors.accentColor = "Must be a 6-digit hex color (e.g. #F59E0B)";
  if (form.logoUrl.length > 0 && !HTTPS_RE.test(form.logoUrl))
    errors.logoUrl = "Logo URL must start with https://";
  if (form.supportEmail.length > 0 && !EMAIL_RE.test(form.supportEmail))
    errors.supportEmail = "Must be a valid email address";
  if (form.trackingHeadline.length > 280)
    errors.trackingHeadline = "Keep under 280 characters";
  return errors;
}

export function BrandingTab() {
  const tenant = useTenantStore((state) => state.tenant);
  const addToast = useAppStore((state) => state.addToast);
  const updateBranding = useUpdateBranding();

  const savedRef = useRef<FormState>(buildFormState(tenant));
  const [form, setForm] = useState<FormState>(savedRef.current);
  const [errors, setErrors] = useState<BrandingFieldErrors>({});

  // Re-sync the "last saved" baseline whenever the tenant config from the
  // server changes (initial load or refetch after a save elsewhere).
  useEffect(() => {
    const next = buildFormState(tenant);
    savedRef.current = next;
    setForm(next);
  }, [tenant]);

  const isDirty = useMemo(() => {
    const s = savedRef.current;
    return (
      form.companyName !== s.companyName ||
      form.supportEmail !== s.supportEmail ||
      form.logoUrl !== s.logoUrl ||
      form.primaryColor !== s.primaryColor ||
      form.accentColor !== s.accentColor ||
      form.trackingHeadline !== s.trackingHeadline
    );
  }, [form]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[fieldErrorKey(key)]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[fieldErrorKey(key)];
        return next;
      });
    }
  };

  const onReset = () => {
    setForm(savedRef.current);
    setErrors({});
  };

  const onSave = async () => {
    const clientErrors = validateClient(form);
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      return;
    }
    setErrors({});
    try {
      await updateBranding.mutateAsync({
        primaryColor: form.primaryColor,
        accentColor: form.accentColor || undefined,
        brandName: form.companyName.trim(),
        logoUrl: form.logoUrl,
        supportEmail: form.supportEmail,
        trackingHeadline: form.trackingHeadline
      });
      savedRef.current = form;
      addToast({
        title: "Branding saved",
        description: "Your widget and tracking surfaces will pick up the changes shortly.",
        variant: "success"
      });
    } catch (err) {
      if (err instanceof BrandingValidationError) {
        setErrors(err.fieldErrors);
        addToast({
          title: "Couldn't save branding",
          description: "Please fix the highlighted fields and try again.",
          variant: "error"
        });
        return;
      }
      addToast({
        title: "Couldn't save branding",
        description: err instanceof Error ? err.message : "Unexpected error",
        variant: "error"
      });
    }
  };

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
              <Input
                value={form.companyName}
                onChange={(event) => setField("companyName", event.target.value)}
                placeholder="Your company name"
                error={errors.brandName}
              />
            </label>
            <label className="text-sm font-medium text-gray-700">
              Support email
              <Input
                value={form.supportEmail}
                onChange={(event) => setField("supportEmail", event.target.value)}
                placeholder="support@company.com"
                error={errors.supportEmail}
              />
            </label>
            <label className="text-sm font-medium text-gray-700">
              Logo URL
              <Input
                value={form.logoUrl}
                onChange={(event) => setField("logoUrl", event.target.value)}
                placeholder="https://cdn.example.com/logo.png"
                error={errors.logoUrl}
              />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium text-gray-700">
                Primary color
                <Input
                  value={form.primaryColor}
                  onChange={(event) => setField("primaryColor", event.target.value)}
                  placeholder="#0D1F3C"
                  error={errors.primaryColor}
                />
              </label>
              <label className="text-sm font-medium text-gray-700">
                Accent color
                <Input
                  value={form.accentColor}
                  onChange={(event) => setField("accentColor", event.target.value)}
                  placeholder="#D97706"
                  error={errors.accentColor}
                />
              </label>
            </div>
          </div>

          <label className="text-sm font-medium text-gray-700">
            Tracking headline
            <Textarea
              value={form.trackingHeadline}
              onChange={(event) => setField("trackingHeadline", event.target.value)}
              placeholder="Short customer-facing reassurance message"
              error={errors.trackingHeadline}
            />
          </label>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Branding checklist</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {[
                form.companyName.trim().length > 1 ? "Company name set" : "Add a company name",
                form.primaryColor.trim().length > 0 ? "Primary color chosen" : "Choose a primary color",
                form.supportEmail.trim().length > 0 ? "Support contact ready" : "Add support contact",
                form.logoUrl.trim().length > 0 ? "Logo linked" : "Optional logo not added"
              ].map((item) => (
                <div key={item} className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={onReset} disabled={!isDirty || updateBranding.isPending}>
              Reset draft
            </Button>
            <Button onClick={onSave} disabled={!isDirty || updateBranding.isPending}>
              {updateBranding.isPending ? "Saving…" : "Save branding"}
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <BrandPreview
            companyName={form.companyName}
            logoUrl={form.logoUrl || undefined}
            primaryColor={form.primaryColor}
          />

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-sm font-semibold text-gray-900">Notification preview</p>
            </div>
            <div className="space-y-3 p-4">
              <div className="rounded-lg border border-gray-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Delivery update email</p>
                <p className="mt-2 text-base font-semibold text-gray-900">{form.companyName}: shipment out for delivery</p>
                <p className="mt-1 text-sm text-gray-600">{form.trackingHeadline}</p>
                <div
                  className="mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold text-white"
                  style={{ backgroundColor: form.primaryColor }}
                >
                  Track live delivery
                </div>
              </div>
              <div
                className="rounded-lg p-4 text-white"
                style={{ background: `linear-gradient(135deg, ${form.primaryColor}, ${form.accentColor})` }}
              >
                <p className="text-xs uppercase tracking-[0.16em] text-white/70">Customer support</p>
                <p className="mt-2 text-lg font-semibold">{form.supportEmail}</p>
                <p className="mt-1 text-sm text-white/80">Displayed on tracking, return flows, and delivery support surfaces.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function fieldErrorKey(key: keyof FormState): keyof BrandingFieldErrors {
  switch (key) {
    case "companyName":
      return "brandName";
    case "supportEmail":
      return "supportEmail";
    case "logoUrl":
      return "logoUrl";
    case "primaryColor":
      return "primaryColor";
    case "accentColor":
      return "accentColor";
    case "trackingHeadline":
      return "trackingHeadline";
  }
}
