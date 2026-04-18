import type { Metadata } from "next";
import Link from "next/link";
import { Cpu, AlertTriangle, MessageSquare, TrendingUp, Bell, Link2, CheckCircle2, Zap } from "lucide-react";
import CTABanner from "@/components/marketing/CTABanner";
import FadeInOnScroll from "@/components/marketing/FadeInOnScroll";
import { AGENT_CAPABILITIES } from "@/lib/marketing-data";
import { buildMetadata } from "@/lib/seo";

const ICON_MAP: Record<string, React.ElementType> = {
  cpu: Cpu,
  "alert-triangle": AlertTriangle,
  "message-square": MessageSquare,
  "trending-up": TrendingUp,
  bell: Bell,
  link: Link2,
};

const WORKFLOW_STEPS = [
  { step: "01", title: "Shipment arrives", description: "A new booking comes in via the portal, API, or bulk import." },
  { step: "02", title: "Agent analyses the job", description: "Fauward Agent evaluates load, route, driver availability, and carrier cost in real time." },
  { step: "03", title: "Optimal assignment made", description: "The shipment is assigned to the best available driver and carrier — no dispatcher needed." },
  { step: "04", title: "Exceptions handled autonomously", description: "If a delay, failure, or SLA risk appears, the agent re-routes and notifies the customer automatically." },
  { step: "05", title: "Finance triggered on delivery", description: "POD confirmed — invoice generated and sent. No manual step." },
];

const COMPARISON_ROWS = [
  { task: "Assign shipments to drivers", without: "Manual, 2–5 min per job", with: "Automated, <1 second" },
  { task: "Handle failed delivery reattempts", without: "Phone call chain, 20+ min", with: "Agent re-routes in real time" },
  { task: "SLA breach detection", without: "After the fact — already breached", with: "Predicted 2h+ in advance" },
  { task: "Customer status updates", without: "Manual copy-paste or calls", with: "Automatic at every transition" },
  { task: "Carrier selection per shipment", without: "Default carrier — no optimisation", with: "Best price & reliability scored" },
  { task: "Ops reporting", without: "Weekly spreadsheet export", with: "Ask in plain English, instant" },
];

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Fauward Agent — AI-powered logistics operations",
    description: "Fauward Agent autonomously handles shipment dispatch, exception management, and demand forecasting — so your team can focus on growth.",
    path: "/agent",
  });
}

export default function AgentPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-[#060e1c] py-20 lg:py-32">
        <div className="absolute inset-0 bg-grid opacity-20" aria-hidden />
        <div className="pointer-events-none absolute left-1/4 top-0 h-96 w-96 rounded-full bg-amber-500/10 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute right-0 bottom-0 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" aria-hidden />

        <div className="marketing-container relative">
          <div className="mx-auto max-w-4xl text-center">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-5 py-2 text-xs font-bold uppercase tracking-widest text-amber-400">
              <span className="relative flex h-2 w-2">
                <span className="ping-slow absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
              </span>
              Fauward Agent — Generally Available
            </p>
            <h1 className="text-4xl font-bold leading-tight text-white lg:text-6xl">
              Your logistics ops on{" "}
              <span className="gradient-text">autopilot</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-blue-200">
              Fauward Agent is an AI layer built into your logistics platform that handles shipment assignment, exception management, SLA monitoring, and customer communication — autonomously, in real time.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="inline-flex h-13 items-center gap-2 rounded-lg bg-amber-600 px-8 text-base font-semibold text-white transition hover:bg-amber-700"
              >
                <Zap size={18} />
                Start Free Trial
              </Link>
              <Link
                href="/support#contact"
                className="inline-flex h-13 items-center rounded-lg border border-white/20 px-8 text-base font-semibold text-white transition hover:bg-white/10"
              >
                Talk to Sales
              </Link>
            </div>
            <p className="mt-4 text-xs text-blue-400">Available on Pro and Enterprise plans · No extra setup · Enable from your dashboard</p>
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <FadeInOnScroll>
        <section className="bg-white py-20 lg:py-24">
          <div className="marketing-container">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold text-gray-900 lg:text-4xl">What Fauward Agent does</h2>
              <p className="mt-4 text-lg text-gray-600">
                Six core capabilities that eliminate the manual work from logistics operations.
              </p>
            </div>
            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {AGENT_CAPABILITIES.map((cap, i) => {
                const Icon = ICON_MAP[cap.icon] ?? Cpu;
                return (
                  <div
                    key={cap.title}
                    className="card-lift group rounded-2xl border border-gray-200 bg-white p-7 shadow-sm"
                    style={{ animationDelay: `${i * 80}ms` }}
                  >
                    <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#0d1f3c] text-amber-400">
                      <Icon size={22} />
                    </div>
                    <h3 className="mb-2 text-lg font-bold text-gray-900">{cap.title}</h3>
                    <p className="text-sm leading-relaxed text-gray-600">{cap.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </FadeInOnScroll>

      {/* Workflow */}
      <FadeInOnScroll>
        <section className="bg-[#0d1f3c] py-20 lg:py-24">
          <div className="marketing-container">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold text-white lg:text-4xl">How it works</h2>
              <p className="mt-4 text-lg text-blue-200">From booking to invoice — the agent handles every step without interrupting your team.</p>
            </div>
            <div className="mx-auto mt-14 max-w-3xl space-y-4">
              {WORKFLOW_STEPS.map((step, i) => (
                <div
                  key={step.step}
                  className="flex items-start gap-5 rounded-2xl border border-white/10 bg-white/5 p-6"
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 font-mono text-sm font-bold">
                    {step.step}
                  </div>
                  <div>
                    <h3 className="font-bold text-white">{step.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-blue-200">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </FadeInOnScroll>

      {/* Before / After comparison */}
      <FadeInOnScroll>
        <section className="bg-gray-50 py-20 lg:py-24">
          <div className="marketing-container">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold text-gray-900">With vs. without Fauward Agent</h2>
              <p className="mt-3 text-lg text-gray-600">The difference in your operations team&apos;s daily workload.</p>
            </div>
            <div className="mx-auto mt-12 max-w-4xl overflow-hidden rounded-2xl border border-gray-200 shadow-sm">
              <div className="grid grid-cols-3 bg-gray-900 px-6 py-4 text-xs font-bold uppercase tracking-widest text-gray-300">
                <span>Task</span>
                <span className="text-red-400">Without Agent</span>
                <span className="text-green-400">With Fauward Agent</span>
              </div>
              {COMPARISON_ROWS.map((row, i) => (
                <div
                  key={row.task}
                  className={`grid grid-cols-3 items-start gap-4 px-6 py-4 text-sm ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}
                >
                  <span className="font-medium text-gray-900">{row.task}</span>
                  <span className="text-red-600">{row.without}</span>
                  <span className="flex items-start gap-1.5 text-gray-900">
                    <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-green-500" />
                    {row.with}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </FadeInOnScroll>

      {/* Pricing note */}
      <FadeInOnScroll>
        <section className="bg-white py-16">
          <div className="marketing-container">
            <div className="mx-auto max-w-3xl rounded-2xl bg-gradient-to-r from-[#0d1f3c] to-[#1a3a6e] px-8 py-10 text-center">
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-amber-400">Included in your plan</p>
              <h3 className="text-2xl font-bold text-white">Fauward Agent is built in — not bolted on</h3>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-blue-200">
                Available on Pro and Enterprise plans. No separate pricing, no API key setup, no integrations to configure. Switch it on from your dashboard.
              </p>
              <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  href="/signup"
                  className="inline-flex h-11 items-center rounded-lg bg-amber-600 px-7 text-sm font-semibold text-white transition hover:bg-amber-700"
                >
                  Start Free Trial
                </Link>
                <Link
                  href="/pricing"
                  className="inline-flex h-11 items-center rounded-lg border border-white/20 px-7 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  See Pro & Enterprise Plans
                </Link>
              </div>
            </div>
          </div>
        </section>
      </FadeInOnScroll>

      <FadeInOnScroll>
        <CTABanner
          title="Ready to put your operations on autopilot?"
          description="Fauward Agent handles the repetitive work so your team can focus on growing the business."
          ctaLabel="Start Free Trial"
          ctaHref="/signup"
        />
      </FadeInOnScroll>
    </>
  );
}
