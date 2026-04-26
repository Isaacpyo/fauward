"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";

type Step = "account" | "company" | "slug" | "branding" | "done";

const STEPS: Step[] = ["account", "company", "slug", "branding", "done"];
const STEP_LABELS: Record<Step, string> = {
  account: "Account",
  company: "Company",
  slug: "Your URL",
  branding: "Branding",
  done: "Done",
};

const PLANS = [
  { id: "starter", label: "Starter", price: "£49/mo", desc: "Up to 500 shipments/month · 5 staff seats" },
  { id: "pro", label: "Pro", price: "£129/mo", desc: "Up to 2,000 shipments/month · Unlimited staff seats" },
  { id: "enterprise", label: "Enterprise", price: "Custom", desc: "Unlimited · SSO · SLA · Dedicated support" },
];

const BRAND_COLORS = [
  "#2563eb", "#D97706", "#0D1F3C", "#16a34a", "#dc2626", "#7c3aed", "#0891b2", "#111827",
];

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>("account");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Account
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Company
  const [companyName, setCompanyName] = useState("");
  const [country, setCountry] = useState("GB");
  const [plan, setPlan] = useState("starter");

  // Slug
  const [slug, setSlug] = useState("");
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [slugChecking, setSlugChecking] = useState(false);

  // Branding
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [primaryColor, setPrimaryColor] = useState("#2563eb");

  // Done
  const [tenantUrl, setTenantUrl] = useState("");

  const stepIndex = STEPS.indexOf(step);

  function autoSlug(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  }

  async function checkSlugAvailability(s: string) {
    if (!s || s.length < 3) return;
    setSlugChecking(true);
    setSlugAvailable(null);
    try {
      const res = await fetch(`/api/onboarding/check-slug?slug=${encodeURIComponent(s)}`);
      const json = await res.json() as { available: boolean };
      setSlugAvailable(json.available);
    } catch {
      setSlugAvailable(null);
    } finally {
      setSlugChecking(false);
    }
  }

  async function handleSubmit() {
    if (step === "account") {
      if (!email || !password || password.length < 8) {
        setError("Enter a valid email and a password with at least 8 characters.");
        return;
      }
      setError(null);
      setStep("company");
    } else if (step === "company") {
      if (!companyName.trim()) { setError("Enter your company name."); return; }
      setError(null);
      const proposed = autoSlug(companyName);
      setSlug(proposed);
      setStep("slug");
    } else if (step === "slug") {
      if (!slug || slug.length < 3) { setError("Slug must be at least 3 characters."); return; }
      if (slugAvailable === false) { setError("That URL is already taken."); return; }
      setError(null);
      setStep("branding");
    } else if (step === "branding") {
      setBusy(true);
      setError(null);
      try {
        const form = new FormData();
        form.append("email", email);
        form.append("password", password);
        form.append("companyName", companyName);
        form.append("country", country);
        form.append("plan", plan);
        form.append("slug", slug);
        form.append("primaryColor", primaryColor);
        if (logoFile) form.append("logo", logoFile);

        const res = await fetch("/api/onboarding/create-tenant", { method: "POST", body: form });
        const json = await res.json() as { tenantUrl?: string; error?: string };

        if (!res.ok) throw new Error(json.error ?? "Failed to create account");
        setTenantUrl(json.tenantUrl ?? `https://${slug}.fauward.com`);
        setStep("done");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        setBusy(false);
      }
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-2xl px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-sm font-bold text-gray-900">Fauward</Link>
          <p className="text-xs text-gray-500">Already have an account? <Link href={`${process.env.NEXT_PUBLIC_TENANT_APP_URL ?? "https://app.fauward.com"}/sign-in`} className="text-amber-700 underline">Sign in</Link></p>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-12">
        {/* Step indicator */}
        {step !== "done" && (
          <div className="mb-10 flex items-center justify-center gap-2">
            {STEPS.filter(s => s !== "done").map((s, i) => {
              const isCompleted = stepIndex > i;
              const isCurrent = step === s;
              return (
                <div key={s} className="flex items-center gap-2">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                    isCompleted ? "bg-amber-600 text-white" : isCurrent ? "bg-[#0d1f3c] text-white" : "bg-gray-200 text-gray-500"
                  }`}>
                    {isCompleted ? <Check size={14} /> : i + 1}
                  </div>
                  <span className={`hidden sm:block text-xs font-medium ${isCurrent ? "text-gray-900" : "text-gray-400"}`}>
                    {STEP_LABELS[s]}
                  </span>
                  {i < STEPS.length - 2 && <div className="h-px w-8 bg-gray-200" />}
                </div>
              );
            })}
          </div>
        )}

        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          {/* ── Account ── */}
          {step === "account" && (
            <>
              <h1 className="text-2xl font-bold text-gray-900">Create your account</h1>
              <p className="mt-1 text-sm text-gray-500">Start your 14-day free trial — no card required.</p>
              <div className="mt-6 space-y-4">
                <div>
                  <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1">Work email</label>
                  <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com"
                    className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500" />
                </div>
                <div>
                  <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1">Password</label>
                  <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters"
                    className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500" />
                </div>
              </div>
            </>
          )}

          {/* ── Company ── */}
          {step === "company" && (
            <>
              <h1 className="text-2xl font-bold text-gray-900">Tell us about your business</h1>
              <p className="mt-1 text-sm text-gray-500">This sets up your logistics platform.</p>
              <div className="mt-6 space-y-4">
                <div>
                  <label htmlFor="company-name" className="block text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1">Company name</label>
                  <input id="company-name" type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Acme Logistics Ltd"
                    className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500" />
                </div>
                <div>
                  <label htmlFor="country" className="block text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1">Country</label>
                  <select id="country" value={country} onChange={e => setCountry(e.target.value)}
                    className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-amber-500">
                    <option value="GB">🇬🇧 United Kingdom</option>
                    <option value="NG">🇳🇬 Nigeria</option>
                    <option value="GH">🇬🇭 Ghana</option>
                    <option value="KE">🇰🇪 Kenya</option>
                    <option value="AE">🇦🇪 UAE</option>
                    <option value="SA">🇸🇦 Saudi Arabia</option>
                    <option value="EG">🇪🇬 Egypt</option>
                    <option value="ZA">🇿🇦 South Africa</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2">Plan</label>
                  <div className="space-y-2">
                    {PLANS.map(p => (
                      <label key={p.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition ${plan === p.id ? "border-amber-500 bg-amber-50" : "border-gray-200 hover:bg-gray-50"}`}>
                        <input type="radio" name="plan" value={p.id} checked={plan === p.id} onChange={() => setPlan(p.id)} className="accent-amber-600" />
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-gray-900">{p.label} <span className="ml-2 text-amber-700">{p.price}</span></p>
                          <p className="text-xs text-gray-500">{p.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── Slug ── */}
          {step === "slug" && (
            <>
              <h1 className="text-2xl font-bold text-gray-900">Choose your platform URL</h1>
              <p className="mt-1 text-sm text-gray-500">Your team and customers will access your platform at this address.</p>
              <div className="mt-6">
                <label htmlFor="slug" className="block text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1">Subdomain</label>
                <div className="flex items-center rounded-lg border border-gray-300 focus-within:border-amber-500 focus-within:ring-2 focus-within:ring-amber-500">
                  <input id="slug" type="text" value={slug}
                    onChange={e => {
                      const v = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
                      setSlug(v);
                      setSlugAvailable(null);
                    }}
                    onBlur={() => checkSlugAvailability(slug)}
                    placeholder="acme"
                    className="h-11 flex-1 rounded-l-lg bg-transparent px-3 text-sm outline-none" />
                  <span className="rounded-r-lg bg-gray-50 px-3 py-3 text-sm text-gray-500 border-l border-gray-200">.fauward.com</span>
                </div>
                {slugChecking && <p className="mt-1.5 text-xs text-gray-400">Checking availability…</p>}
                {!slugChecking && slugAvailable === true && <p className="mt-1.5 text-xs text-green-600 font-medium">✓ Available</p>}
                {!slugChecking && slugAvailable === false && <p className="mt-1.5 text-xs text-red-600">✗ Already taken — try another</p>}
              </div>
              <div className="mt-4 rounded-xl bg-blue-50 border border-blue-200 p-4 text-xs text-blue-800">
                Your dashboard will be at <strong>https://{slug || "yourcompany"}.fauward.com</strong>
              </div>
            </>
          )}

          {/* ── Branding ── */}
          {step === "branding" && (
            <>
              <h1 className="text-2xl font-bold text-gray-900">Brand your platform</h1>
              <p className="mt-1 text-sm text-gray-500">Your logo and colours appear in the tenant dashboard, widget, and customer tracking pages.</p>
              <div className="mt-6 space-y-5">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1">Logo</label>
                  <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    onChange={e => setLogoFile(e.target.files?.[0] ?? null)}
                    className="block w-full text-sm text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-amber-600 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-amber-700" />
                  <p className="mt-1 text-xs text-gray-400">PNG, SVG, or JPEG. Max 2MB.</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2">Primary colour</label>
                  <div className="flex flex-wrap gap-2">
                    {BRAND_COLORS.map(c => (
                      <button key={c} type="button" onClick={() => setPrimaryColor(c)}
                        className={`h-9 w-9 rounded-lg border-2 transition ${primaryColor === c ? "border-gray-900 scale-110" : "border-transparent"}`}
                        style={{ background: c }} aria-label={c} />
                    ))}
                    <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)}
                      className="h-9 w-9 cursor-pointer rounded-lg border border-gray-300 p-0.5" title="Custom colour" />
                  </div>
                </div>
              </div>
              <div className="mt-5 rounded-xl bg-gray-50 border border-gray-200 p-4">
                <p className="text-xs font-semibold text-gray-600 mb-2">Preview</p>
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg flex items-center justify-center text-white text-xs font-bold" style={{ background: primaryColor }}>
                    {companyName[0]?.toUpperCase() ?? "A"}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{companyName || "Your Company"}</p>
                    <p className="text-xs text-gray-500">{slug || "yourcompany"}.fauward.com</p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── Done ── */}
          {step === "done" && (
            <div className="text-center py-4">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <Check className="text-green-600" size={32} />
              </div>
              <h1 className="text-2xl font-bold text-gray-900">You&apos;re live! 🚀</h1>
              <p className="mt-2 text-sm text-gray-600">Your logistics platform is ready. Head to your dashboard to create your first shipment.</p>

              <div className="mt-6 rounded-xl bg-amber-50 border border-amber-200 p-5 text-left">
                <p className="text-xs font-semibold uppercase tracking-widest text-amber-700 mb-1">Your platform URL</p>
                <p className="text-base font-bold text-gray-900 break-all">{tenantUrl}</p>
              </div>

              <div className="mt-6 space-y-3">
                <a href={tenantUrl}
                  className="flex h-12 w-full items-center justify-center rounded-lg bg-amber-600 text-sm font-semibold text-white transition hover:bg-amber-700">
                  Open dashboard →
                </a>
                <Link href="/features/white-label"
                  className="flex h-11 w-full items-center justify-center rounded-lg border border-gray-200 text-sm font-medium text-gray-700 transition hover:bg-gray-50">
                  See how to embed the widget
                </Link>
              </div>

              <div className="mt-6 rounded-xl bg-gray-50 border border-gray-200 p-4 text-left">
                <p className="text-xs font-semibold text-gray-700 mb-2">Quick start</p>
                <ol className="space-y-1.5 text-xs text-gray-600 list-decimal pl-4">
                  <li>Invite your team from Settings → Team</li>
                  <li>Configure your service zones in Pricing → Zones</li>
                  <li>Embed the shipment widget on your website</li>
                  <li>Create your first shipment from the dashboard</li>
                </ol>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</p>
          )}

          {/* Nav buttons */}
          {step !== "done" && (
            <div className="mt-8 flex items-center justify-between gap-4">
              {stepIndex > 0 ? (
                <button type="button" onClick={() => setStep(STEPS[stepIndex - 1])}
                  className="h-11 rounded-lg border border-gray-300 px-6 text-sm font-medium text-gray-700 transition hover:bg-gray-50">
                  Back
                </button>
              ) : <div />}
              <button type="button" onClick={handleSubmit} disabled={busy}
                className="h-11 flex items-center gap-2 rounded-lg bg-amber-600 px-8 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:opacity-60">
                {busy ? "Creating your platform…" : step === "branding" ? "Launch my platform" : "Continue →"}
              </button>
            </div>
          )}
        </div>

        {step !== "done" && (
          <p className="mt-4 text-center text-xs text-gray-400">
            By continuing you agree to our{" "}
            <Link href="/legal/terms" className="underline hover:text-amber-700">Terms of Service</Link>{" "}
            and{" "}
            <Link href="/legal/privacy" className="underline hover:text-amber-700">Privacy Policy</Link>.
          </p>
        )}
      </div>
    </div>
  );
}
