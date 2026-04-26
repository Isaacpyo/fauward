"use client";

import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";

import { getFirebaseAuthErrorMessage, signInWithGoogle } from "@/lib/firebase";
import { PRICING_PLANS, type PricingPlan } from "@/lib/marketing-data";

type PlanId = PricingPlan["id"];
type BusinessType = "courier" | "freight" | "last_mile" | "ecommerce" | "third_party_logistics" | "other";
type RegionId = "uk" | "west_africa" | "east_africa" | "mena" | "global";

type FormValues = {
  name: string;
  email: string;
  company: string;
  plan: PlanId;
  password: string;
  acceptedTerms: boolean;
};

type FormErrors = Partial<Record<keyof FormValues, string>> & { form?: string };
type WelcomeState = { tenantUrl: string };
type OnboardingStep = "details" | "payment";

const BUSINESS_TYPES: Array<{ id: BusinessType; label: string; description: string }> = [
  { id: "courier", label: "Courier / parcel delivery", description: "Local and regional collection, sorting, and delivery." },
  { id: "freight", label: "Freight forwarding", description: "Air, sea, road, and cross-border shipment operations." },
  { id: "last_mile", label: "Last-mile delivery", description: "Driver routes, proof-of-delivery, and recipient updates." },
  { id: "ecommerce", label: "E-commerce fulfilment", description: "Store orders, branded tracking, returns, and customer updates." },
  { id: "third_party_logistics", label: "3PL / logistics provider", description: "Multi-client warehousing and delivery workflows." },
  { id: "other", label: "Other logistics business", description: "A different logistics operating model." }
];

const REGIONS: Array<{ id: RegionId; label: string; note: string }> = [
  { id: "uk", label: "United Kingdom", note: "GBP, VAT-ready invoicing, GoCardless support." },
  { id: "west_africa", label: "West Africa", note: "Nigeria, Ghana, COD and Paystack-ready workflows." },
  { id: "east_africa", label: "East Africa", note: "Kenya and regional delivery with M-Pesa-aware operations." },
  { id: "mena", label: "MENA", note: "GCC, Egypt, COD, HyperPay and Checkout.com coverage." },
  { id: "global", label: "Global / multi-region", note: "Run distributed tenant operations across markets." }
];

const initialValues: FormValues = {
  name: "",
  email: "",
  company: "",
  plan: "starter",
  password: "",
  acceptedTerms: false
};

function validate(values: FormValues): FormErrors {
  const errors: FormErrors = {};

  if (values.name.trim().length < 2) {
    errors.name = "Please enter your full name.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
    errors.email = "Enter a valid email address.";
  }
  if (values.company.trim().length < 2) {
    errors.company = "Company name is required.";
  }
  if (!PRICING_PLANS.some((plan) => plan.id === values.plan)) {
    errors.plan = "Select a pricing plan.";
  }
  if (values.password.length < 8) {
    errors.password = "Password must be at least 8 characters.";
  }
  if (!values.acceptedTerms) {
    errors.acceptedTerms = "You must accept the terms.";
  }

  return errors;
}

export default function SignupForm() {
  const [values, setValues] = useState<FormValues>(initialValues);
  const [touched, setTouched] = useState<Partial<Record<keyof FormValues, boolean>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [formError, setFormError] = useState<string>("");
  const [formNotice, setFormNotice] = useState<string>("");
  const [welcome, setWelcome] = useState<WelcomeState | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>("details");
  const [businessType, setBusinessType] = useState<BusinessType>("courier");
  const [region, setRegion] = useState<RegionId>("uk");
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);

  const errors = useMemo(() => validate(values), [values]);
  const isValid = Object.keys(errors).length === 0;

  const fieldError = (field: keyof FormValues) => (touched[field] ? errors[field] : undefined);
  const selectedPlan = PRICING_PLANS.find((plan) => plan.id === values.plan) ?? PRICING_PLANS[0];
  const selectedBusinessType = BUSINESS_TYPES.find((item) => item.id === businessType) ?? BUSINESS_TYPES[0];
  const selectedRegion = REGIONS.find((item) => item.id === region) ?? REGIONS[0];
  const trialAmountLabel = selectedPlan.monthlyPrice === null ? "custom plan amount" : `£${selectedPlan.monthlyPrice}`;

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = event.target;
    setValues((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value
    }));
  };

  async function createTrialAccount(input: FormValues) {
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    });

    const payload = (await response.json().catch(() => null)) as
      | {
          message?: string;
          tenantUrl?: string;
          accessToken?: string;
          refreshToken?: string;
          tenantSlug?: string;
        }
      | null;

    if (!response.ok) {
      throw new Error(payload?.message || "Unable to start your trial right now.");
    }

    if (payload?.accessToken && payload.refreshToken) {
      localStorage.setItem("fauward_access_token", payload.accessToken);
      localStorage.setItem("fauward_refresh_token", payload.refreshToken);
    }

    return payload?.tenantUrl || "http://localhost:3000";
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched({
      name: true,
      email: true,
      company: true,
      plan: true,
      password: true,
      acceptedTerms: true
    });

    if (!isValid) {
      return;
    }

    setSubmitting(true);
    setFormError("");
    setFormNotice("");

    try {
      const tenantUrl = await createTrialAccount(values);
      setWelcome({ tenantUrl });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to start your trial right now.";
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignup = async () => {
    setTouched((current) => ({
      ...current,
      company: true,
      acceptedTerms: true
    }));

    if (values.company.trim().length < 2 || !values.acceptedTerms) {
      setFormError("Enter your company name and accept the terms before continuing with Google.");
      return;
    }

    setGoogleSubmitting(true);
    setFormError("");
    setFormNotice("");

    try {
      const result = await signInWithGoogle();
      const email = result.user.email ?? "";
      if (!email) {
        throw new Error("Google did not return an email address.");
      }

      const tenantUrl = await createTrialAccount({
        name: result.user.displayName || email,
        email,
        company: values.company,
        plan: values.plan,
        password: `Google-${crypto.randomUUID()}Aa1!`,
        acceptedTerms: values.acceptedTerms
      });
      setWelcome({ tenantUrl });
    } catch (error) {
      setFormError(getFirebaseAuthErrorMessage(error));
    } finally {
      setGoogleSubmitting(false);
    }
  };

  function openOnboardingDetails() {
    setShowOnboarding(true);
    setOnboardingStep("details");
  }

  function completeOnboarding() {
    if (!welcome) return;
    localStorage.setItem(
      "fw_signup_onboarding",
      JSON.stringify({
        plan: selectedPlan.id,
        planName: selectedPlan.name,
        businessType,
        businessTypeLabel: selectedBusinessType.label,
        region,
        regionLabel: selectedRegion.label,
        trialStartsAt: new Date().toISOString(),
        trialDays: 14,
        dueToday: 0,
        amountAfterTrial: selectedPlan.monthlyPrice
      })
    );
    window.location.assign(welcome.tenantUrl);
  }

  return (
    <div className="space-y-5">
      {welcome ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 px-4">
          <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
            <h2 className="text-xl font-bold text-gray-900">Welcome to Fauward</h2>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              Your 14-day free trial is ready and your account has been set up.
            </p>
            <button
              type="button"
              onClick={openOnboardingDetails}
              className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-lg bg-amber-600 px-4 text-sm font-semibold text-white transition hover:bg-amber-700"
            >
              Proceed
            </button>
          </div>
        </div>
      ) : null}
      {showOnboarding && welcome ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-950/50 px-4 py-6">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-2xl">
            <div className="border-b border-gray-200 px-6 py-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-600">Tenant onboarding</p>
              <h2 className="mt-1 text-xl font-bold text-gray-900">
                {onboardingStep === "details" ? "Confirm your launch details" : "Set up payment"}
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                {onboardingStep === "details"
                  ? "We will tailor your workspace, templates, and regional defaults before you enter the portal."
                  : "Your trial starts today. You pay nothing now and your selected plan is billed after 14 days."}
              </p>
            </div>

            {onboardingStep === "details" ? (
              <div className="space-y-5 px-6 py-5">
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Selected plan</p>
                  <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <p className="text-lg font-bold text-gray-900">{selectedPlan.name}</p>
                      <p className="mt-1 text-sm text-gray-700">{selectedPlan.shipmentLimit} · {selectedPlan.staffLimit}</p>
                    </div>
                    <p className="text-sm font-semibold text-gray-900">
                      {selectedPlan.monthlyPrice === null ? "Custom pricing" : `£${selectedPlan.monthlyPrice}/month`}
                    </p>
                  </div>
                </div>

                <fieldset>
                  <legend className="text-sm font-semibold text-gray-900">Business type</legend>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {BUSINESS_TYPES.map((item) => {
                      const selected = businessType === item.id;
                      return (
                        <label
                          key={item.id}
                          className={`cursor-pointer rounded-lg border p-4 transition ${
                            selected ? "border-amber-600 bg-amber-50 ring-2 ring-amber-600/20" : "border-gray-200 hover:bg-gray-50"
                          }`}
                        >
                          <input
                            type="radio"
                            name="businessType"
                            value={item.id}
                            checked={selected}
                            onChange={() => setBusinessType(item.id)}
                            className="sr-only"
                          />
                          <span className="block text-sm font-semibold text-gray-900">{item.label}</span>
                          <span className="mt-1 block text-xs leading-5 text-gray-600">{item.description}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                <fieldset>
                  <legend className="text-sm font-semibold text-gray-900">Operating region</legend>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {REGIONS.map((item) => {
                      const selected = region === item.id;
                      return (
                        <label
                          key={item.id}
                          className={`cursor-pointer rounded-lg border p-4 transition ${
                            selected ? "border-amber-600 bg-amber-50 ring-2 ring-amber-600/20" : "border-gray-200 hover:bg-gray-50"
                          }`}
                        >
                          <input
                            type="radio"
                            name="region"
                            value={item.id}
                            checked={selected}
                            onChange={() => setRegion(item.id)}
                            className="sr-only"
                          />
                          <span className="block text-sm font-semibold text-gray-900">{item.label}</span>
                          <span className="mt-1 block text-xs leading-5 text-gray-600">{item.note}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                <div className="flex justify-end border-t border-gray-200 pt-5">
                  <button
                    type="button"
                    onClick={() => setOnboardingStep("payment")}
                    className="inline-flex h-11 items-center justify-center rounded-lg bg-amber-600 px-5 text-sm font-semibold text-white transition hover:bg-amber-700"
                  >
                    Proceed to payment
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-5 px-6 py-5">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <p className="text-xs font-semibold uppercase text-gray-500">Due today</p>
                    <p className="mt-2 text-3xl font-bold text-gray-900">£0</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <p className="text-xs font-semibold uppercase text-gray-500">Trial period</p>
                    <p className="mt-2 text-3xl font-bold text-gray-900">14 days</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <p className="text-xs font-semibold uppercase text-gray-500">After trial</p>
                    <p className="mt-2 text-2xl font-bold text-gray-900">{trialAmountLabel}</p>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 p-4">
                  <p className="text-sm font-semibold text-gray-900">Subscription summary</p>
                  <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                    <div>
                      <dt className="text-gray-500">Plan</dt>
                      <dd className="font-medium text-gray-900">{selectedPlan.name}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">Business type</dt>
                      <dd className="font-medium text-gray-900">{selectedBusinessType.label}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">Region</dt>
                      <dd className="font-medium text-gray-900">{selectedRegion.label}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">First charge</dt>
                      <dd className="font-medium text-gray-900">
                        {selectedPlan.monthlyPrice === null ? "After your sales agreement is confirmed" : `£${selectedPlan.monthlyPrice} after 14 days`}
                      </dd>
                    </div>
                  </dl>
                </div>

                <label className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <input
                    type="checkbox"
                    checked={paymentConfirmed}
                    onChange={(event) => setPaymentConfirmed(event.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-gray-300"
                  />
                  <span className="text-sm leading-6 text-gray-700">
                    I understand today&apos;s charge is £0 and Fauward will debit the selected plan amount after the 14-day trial unless I cancel before the trial ends.
                  </span>
                </label>

                <div className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-5 sm:flex-row sm:justify-between">
                  <button
                    type="button"
                    onClick={() => setOnboardingStep("details")}
                    className="inline-flex h-11 items-center justify-center rounded-lg border border-gray-300 px-5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={!paymentConfirmed}
                    onClick={completeOnboarding}
                    className="inline-flex h-11 items-center justify-center rounded-lg bg-amber-600 px-5 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-amber-300"
                  >
                    Continue to portal
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
      <button
        type="button"
        onClick={handleGoogleSignup}
        disabled={submitting || googleSubmitting}
        className="inline-flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="inline-flex h-5 w-5 items-center justify-center">
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
        </span>
        {googleSubmitting ? "Connecting..." : "Continue with Google"}
      </button>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-xs text-gray-400">or</span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>

      <form className="space-y-5" onSubmit={handleSubmit} noValidate>
      <div>
        <label htmlFor="name" className="mb-2 block text-sm font-semibold text-gray-700">
          Name
        </label>
        <input
          id="name"
          name="name"
          value={values.name}
          onChange={handleChange}
          onBlur={() => setTouched((prev) => ({ ...prev, name: true }))}
          className="h-11 w-full rounded-lg border border-gray-200 px-4 text-sm outline-none ring-amber-600/20 focus:ring"
          autoComplete="name"
          required
        />
        {fieldError("name") ? <p className="mt-1 text-sm text-red-600">{fieldError("name")}</p> : null}
      </div>

      <div>
        <label htmlFor="email" className="mb-2 block text-sm font-semibold text-gray-700">
          Work email
        </label>
        <input
          id="email"
          type="email"
          name="email"
          value={values.email}
          onChange={handleChange}
          onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
          className="h-11 w-full rounded-lg border border-gray-200 px-4 text-sm outline-none ring-amber-600/20 focus:ring"
          autoComplete="email"
          required
        />
        {fieldError("email") ? <p className="mt-1 text-sm text-red-600">{fieldError("email")}</p> : null}
      </div>

      <div>
        <label htmlFor="company" className="mb-2 block text-sm font-semibold text-gray-700">
          Company
        </label>
        <input
          id="company"
          name="company"
          value={values.company}
          onChange={handleChange}
          onBlur={() => setTouched((prev) => ({ ...prev, company: true }))}
          className="h-11 w-full rounded-lg border border-gray-200 px-4 text-sm outline-none ring-amber-600/20 focus:ring"
          autoComplete="organization"
          required
        />
        {fieldError("company") ? <p className="mt-1 text-sm text-red-600">{fieldError("company")}</p> : null}
      </div>

      <div>
        <label htmlFor="password" className="mb-2 block text-sm font-semibold text-gray-700">
          Password
        </label>
        <input
          id="password"
          type="password"
          name="password"
          value={values.password}
          onChange={handleChange}
          onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
          className="h-11 w-full rounded-lg border border-gray-200 px-4 text-sm outline-none ring-amber-600/20 focus:ring"
          autoComplete="new-password"
          required
        />
        {fieldError("password") ? <p className="mt-1 text-sm text-red-600">{fieldError("password")}</p> : null}
      </div>

      <fieldset>
        <legend className="mb-2 block text-sm font-semibold text-gray-700">Plan</legend>
        <div className="grid gap-3 md:grid-cols-3">
          {PRICING_PLANS.map((plan) => {
            const isSelected = values.plan === plan.id;
            const includesAgent = plan.id === "pro" || plan.id === "enterprise";
            const priceLabel = plan.monthlyPrice === null ? "Custom" : `£${plan.monthlyPrice}/mo`;

            return (
              <label
                key={plan.id}
                className={`flex min-h-[132px] cursor-pointer flex-col justify-between gap-4 rounded-lg border px-4 py-3 transition ${
                  isSelected
                    ? "border-amber-600 bg-amber-50 ring-2 ring-amber-600/20"
                    : "border-gray-200 bg-white hover:border-amber-300"
                }`}
              >
                <input
                  type="radio"
                  name="plan"
                  value={plan.id}
                  checked={isSelected}
                  onChange={handleChange}
                  onBlur={() => setTouched((prev) => ({ ...prev, plan: true }))}
                  className="sr-only"
                />
                <span>
                  <span className="block text-sm font-semibold text-gray-900">{plan.name}</span>
                  <span className="mt-1 block text-xs leading-5 text-gray-600">{plan.shipmentLimit}</span>
                  <span
                    className={`mt-2 inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${
                      includesAgent ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {includesAgent ? "Fauward Agent included" : "Agent on Pro+"}
                  </span>
                </span>
                <span className="text-sm font-semibold text-gray-900">{priceLabel}</span>
              </label>
            );
          })}
        </div>
        {fieldError("plan") ? <p className="mt-1 text-sm text-red-600">{fieldError("plan")}</p> : null}
      </fieldset>

      <div>
        <label className="flex min-h-[44px] items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
          <input
            type="checkbox"
            name="acceptedTerms"
            checked={values.acceptedTerms}
            onChange={handleChange}
            onBlur={() => setTouched((prev) => ({ ...prev, acceptedTerms: true }))}
            className="mt-1 h-4 w-4 rounded border-gray-300"
          />
          <span className="text-sm text-gray-700">I agree to the terms and privacy policy.</span>
        </label>
        {fieldError("acceptedTerms") ? <p className="mt-1 text-sm text-red-600">{fieldError("acceptedTerms")}</p> : null}
      </div>

      {formError ? <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</p> : null}
      {formNotice ? <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{formNotice}</p> : null}

      <button
        type="submit"
        disabled={!isValid || submitting}
        className="inline-flex h-12 w-full items-center justify-center rounded-lg bg-amber-600 px-6 text-base font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-amber-300"
      >
        {submitting ? "Creating account..." : "Start Free Trial"}
      </button>
      </form>
    </div>
  );
}
