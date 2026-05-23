"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Cpu,
  AlertTriangle,
  MessageSquare,
  TrendingUp,
  Bell,
  Link2,
  CheckCircle2,
  Zap,
  Bot,
  Send,
  Sparkles,
  ShieldCheck,
  ArrowRight,
  Check,
  type LucideIcon,
} from "lucide-react";

import CTABanner from "@/components/marketing/CTABanner";
import { AGENT_CAPABILITIES } from "@/lib/marketing-data";

const MotionLink = motion(Link);
const EASE = [0.22, 1, 0.36, 1] as const;

const ICON_MAP: Record<string, LucideIcon> = {
  cpu: Cpu,
  "alert-triangle": AlertTriangle,
  "message-square": MessageSquare,
  "trending-up": TrendingUp,
  bell: Bell,
  link: Link2,
};

const WORKFLOW_STEPS = [
  { step: "01", title: "Shipment arrives",            description: "A new booking comes in via the portal, API, or bulk import." },
  { step: "02", title: "Agent analyses the job",      description: "Fauward Agent evaluates load, route, Fauward Go availability, and carrier cost in real time." },
  { step: "03", title: "Optimal assignment made",     description: "The shipment is assigned to the best available Fauward Go operator and carrier — no dispatcher needed." },
  { step: "04", title: "Exceptions flagged & escalated", description: "Delays, failures, or SLA risks notify the customer instantly. Reroutes are recommended and escalated for your team to approve." },
  { step: "05", title: "Finance triggered on delivery", description: "POD confirmed — invoice generated and sent. No manual step." },
];

const COMPARISON_ROWS = [
  { task: "Assign shipments to Fauward Go operators", without: "Manual, 2–5 min per job",                  with: "Automated, <1 second" },
  { task: "Handle failed delivery reattempts",         without: "Phone call chain, 20+ min",                with: "Agent flags risk instantly, team approves reroute" },
  { task: "SLA breach detection",                      without: "After the fact — already breached",        with: "Predicted 2h+ in advance" },
  { task: "Customer status updates",                   without: "Manual copy-paste or calls",               with: "Automatic at every transition" },
  { task: "Carrier selection per shipment",            without: "Default carrier — no optimisation",        with: "Best price & reliability scored" },
  { task: "Ops reporting",                             without: "Weekly spreadsheet export",                with: "Ask in plain English, instant" },
];

const STATS = [
  { value: "847",  label: "Shipments monitored per tenant, on average" },
  { value: "2h+",  label: "Average lead time on SLA risk detection" },
  { value: "60%",  label: "Reduction in dispatcher manual actions" },
  { value: "100%", label: "Approval-gated for risky actions" },
];

const headerContainer = {
  hidden: { opacity: 0 },
  show:   { opacity: 1, transition: { staggerChildren: 0.15, delayChildren: 0.05 } },
};

const headerItem = {
  hidden: { opacity: 0, y: 20, filter: "blur(8px)" },
  show:   { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.7, ease: EASE } },
};

function AgentChatHero() {
  return (
    <motion.div
      className="relative mx-auto mt-16 max-w-md"
      initial={{ opacity: 0, scale: 0.95, y: 24 }}
      whileInView={{ opacity: 1, scale: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.8, ease: EASE }}
    >
      <motion.span
        aria-hidden
        className="pointer-events-none absolute -inset-px -z-10 rounded-3xl"
        style={{ background: "linear-gradient(135deg, rgba(245,158,11,0.4) 0%, transparent 50%, rgba(59,130,246,0.4) 100%)" }}
        animate={{ opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#060e1c] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-5 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400">
              <Bot size={14} />
            </span>
            <div>
              <div className="text-xs font-semibold text-white">Fauward Agent</div>
              <div className="flex items-center gap-1 text-[10px] text-blue-300">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-500" />
                </span>
                847 shipments monitored
              </div>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-400">
            <ShieldCheck size={10} /> Verified
          </span>
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-6">
          <motion.div
            className="flex justify-end"
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-blue-600 px-4 py-2.5 text-sm text-white shadow-lg shadow-blue-900/40">
              Anything risky in the next 4 hours?
            </div>
          </motion.div>

          <motion.div
            className="rounded-2xl rounded-tl-sm border border-white/10 bg-white/[0.04] p-4"
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.8, duration: 0.6 }}
          >
            <div className="mb-3 flex items-center gap-2 text-sm text-blue-100">
              <Sparkles size={14} className="text-amber-400" />
              <span>
                <span className="font-bold text-amber-400">3 risks</span> across 2 tenants. Suggested actions below.
              </span>
            </div>
            <div className="space-y-2">
              {[
                { ref: "FW-7821", action: "Reassign to Carrier B", risk: "+38 min", color: "text-red-400", pill: "bg-red-500/15 text-red-300" },
                { ref: "FW-7834", action: "Notify customer + flag", risk: "+22 min", color: "text-amber-400", pill: "bg-amber-500/15 text-amber-300" },
              ].map((s, i) => (
                <motion.div
                  key={s.ref}
                  className="rounded-lg border border-white/10 bg-[#0a1628] p-3"
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 1 + i * 0.15, duration: 0.5 }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-white">{s.ref}</div>
                      <div className="text-[10px] text-blue-300">Manchester → Leeds</div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.pill}`}>{s.risk}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5">
                    <span className="text-[11px] text-amber-200">
                      Suggested: <span className="font-semibold text-amber-300">{s.action}</span>
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-400">
                      Awaiting approval <Check size={10} />
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Prompt */}
        <div className="border-t border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#0a1628] px-3 py-2">
            <Sparkles size={14} className="text-amber-400" />
            <span className="flex-1 text-sm text-blue-300/60">Ask the agent…</span>
            <button className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500 text-gray-900" aria-label="Send">
              <Send size={12} />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function AgentPageContent() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-[#060e1c] py-20 lg:py-28">
        <div className="absolute inset-0 bg-grid opacity-20" aria-hidden />
        <motion.div
          className="pointer-events-none absolute left-1/4 top-0 h-96 w-96 rounded-full bg-amber-500/15 blur-3xl"
          animate={{ opacity: [0.4, 0.75, 0.4] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          aria-hidden
        />
        <motion.div
          className="pointer-events-none absolute right-0 bottom-0 h-80 w-80 rounded-full bg-blue-500/15 blur-3xl"
          animate={{ opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          aria-hidden
        />

        <div className="marketing-container relative">
          <motion.div
            className="mx-auto max-w-3xl text-center"
            variants={headerContainer}
            initial="hidden"
            animate="show"
          >
            <motion.div variants={headerItem} className="mb-5 inline-block">
              <span className="relative inline-flex items-center gap-2 overflow-hidden rounded-full border border-amber-500/40 bg-amber-500/10 px-5 py-2 text-xs font-bold uppercase tracking-widest text-amber-300">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
                </span>
                <span className="relative z-10">Fauward Agent — Generally Available</span>
                <motion.span
                  aria-hidden
                  className="absolute inset-0 -z-0"
                  initial={{ x: "-120%" }}
                  animate={{ x: "120%" }}
                  transition={{ duration: 3, repeat: Infinity, repeatDelay: 2.4, ease: "easeInOut" }}
                  style={{
                    background:
                      "linear-gradient(120deg, transparent 0%, transparent 35%, rgba(255,255,255,0.4) 50%, transparent 65%, transparent 100%)",
                  }}
                />
              </span>
            </motion.div>

            <motion.h1 variants={headerItem} className="text-4xl font-bold leading-tight text-white md:text-5xl lg:text-6xl">
              Your logistics ops on{" "}
              <span className="relative inline-block">
                <span className="bg-gradient-to-r from-amber-400 via-amber-500 to-orange-400 bg-clip-text text-transparent">
                  autopilot
                </span>
                <motion.span
                  aria-hidden
                  className="absolute -bottom-1 left-0 h-[3px] rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-orange-400"
                  initial={{ width: 0 }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 1, delay: 0.7, ease: EASE }}
                />
              </span>
            </motion.h1>

            <motion.p variants={headerItem} className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-blue-200/90">
              A policy-controlled AI operations layer built into your logistics platform. Fauward Agent automates safe actions, recommends risky ones for human approval, and always defers to your team as the source of truth.
            </motion.p>

            <motion.div variants={headerItem} className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <MotionLink
                href="/signup"
                whileHover={{ y: -2, scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: "spring", stiffness: 380, damping: 22 }}
                className="group relative inline-flex h-12 items-center gap-2 overflow-hidden rounded-lg bg-amber-500 px-8 text-base font-semibold text-gray-900 shadow-[0_8px_24px_-8px_rgba(245,158,11,0.55)]"
              >
                <span className="relative z-10 inline-flex items-center gap-2">
                  <Zap size={16} /> Start Free Trial
                  <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                </span>
                <motion.span
                  aria-hidden
                  className="absolute inset-0 -z-0"
                  initial={{ x: "-100%" }}
                  whileHover={{ x: "100%" }}
                  transition={{ duration: 0.7, ease: EASE }}
                  style={{ background: "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.55) 50%, transparent 70%)" }}
                />
              </MotionLink>
              <MotionLink
                href="/support#contact"
                whileHover={{ y: -2, scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: "spring", stiffness: 380, damping: 22 }}
                className="inline-flex h-12 items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-8 text-base font-semibold text-white backdrop-blur-sm hover:bg-white/10"
              >
                Talk to Sales
              </MotionLink>
            </motion.div>

            <motion.p variants={headerItem} className="mt-4 text-xs text-blue-400">
              Available on Pro and Enterprise plans · No extra setup · Enable from your dashboard
            </motion.p>
          </motion.div>

          <AgentChatHero />
        </div>
      </section>

      {/* Stats banner */}
      <section className="border-y border-gray-200 bg-white py-12">
        <div className="marketing-container">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STATS.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}
                whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ delay: i * 0.08, duration: 0.5, ease: EASE }}
                className="text-center"
              >
                <div className="text-4xl font-bold text-brand-navy lg:text-5xl">{s.value}</div>
                <div className="mt-2 text-sm text-gray-600">{s.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section className="bg-slate-50 py-20 lg:py-24">
        <div className="marketing-container">
          <motion.div
            className="mx-auto max-w-2xl text-center"
            variants={headerContainer}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.4 }}
          >
            <motion.div variants={headerItem} className="mb-4 inline-block">
              <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
                <Sparkles size={12} className="text-amber-500" /> Capabilities
              </span>
            </motion.div>
            <motion.h2 variants={headerItem} className="text-3xl font-bold leading-tight text-gray-900 md:text-4xl">
              Six core capabilities that{" "}
              <span className="relative inline-block">
                <span className="bg-gradient-to-r from-amber-500 via-amber-600 to-orange-500 bg-clip-text text-transparent">
                  eliminate manual work
                </span>
                <motion.span
                  aria-hidden
                  className="absolute -bottom-1 left-0 h-[3px] rounded-full bg-gradient-to-r from-amber-400 via-amber-600 to-orange-500"
                  initial={{ width: 0 }}
                  whileInView={{ width: "100%" }}
                  viewport={{ once: true, amount: 0.6 }}
                  transition={{ duration: 1, delay: 0.5, ease: EASE }}
                />
              </span>
            </motion.h2>
            <motion.p variants={headerItem} className="mt-4 text-lg text-gray-600">
              Approval-gated where it matters. Automatic where it doesn&apos;t.
            </motion.p>
          </motion.div>

          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {AGENT_CAPABILITIES.map((cap, i) => {
              const Icon = ICON_MAP[cap.icon] ?? Cpu;
              return (
                <motion.div
                  key={cap.title}
                  initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
                  whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ delay: i * 0.08, duration: 0.6, ease: EASE }}
                  whileHover={{ y: -4 }}
                  className="group rounded-2xl border border-gray-200 bg-white p-7 shadow-sm transition-colors hover:border-amber-200"
                >
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#0d1f3c] text-amber-400 transition group-hover:bg-amber-500 group-hover:text-white">
                    <Icon size={22} />
                  </div>
                  <h3 className="mb-2 text-lg font-bold text-gray-900">{cap.title}</h3>
                  <p className="text-sm leading-relaxed text-gray-600">{cap.description}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Workflow */}
      <section className="bg-[#0d1f3c] py-20 lg:py-24">
        <div className="marketing-container">
          <motion.div
            className="mx-auto max-w-2xl text-center"
            variants={headerContainer}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.4 }}
          >
            <motion.div variants={headerItem} className="mb-4 inline-block">
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">
                Workflow
              </span>
            </motion.div>
            <motion.h2 variants={headerItem} className="text-3xl font-bold text-white md:text-4xl">
              From booking to invoice —{" "}
              <span className="bg-gradient-to-r from-amber-400 via-amber-500 to-orange-400 bg-clip-text text-transparent">
                without interruptions
              </span>
            </motion.h2>
            <motion.p variants={headerItem} className="mt-4 text-lg text-blue-200/80">
              The agent handles every step. Your team stays in the loop where it matters.
            </motion.p>
          </motion.div>

          <div className="mx-auto mt-14 max-w-3xl">
            <div className="relative space-y-4">
              <div className="absolute left-6 top-2 bottom-2 w-px bg-gradient-to-b from-amber-500/0 via-amber-500/40 to-amber-500/0" aria-hidden />
              {WORKFLOW_STEPS.map((step, i) => (
                <motion.div
                  key={step.step}
                  initial={{ opacity: 0, x: -24, filter: "blur(8px)" }}
                  whileInView={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ delay: i * 0.12, duration: 0.6, ease: EASE }}
                  className="relative flex items-start gap-5 rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-sm"
                >
                  <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-amber-500/40 bg-amber-500/15 font-mono text-sm font-bold text-amber-400">
                    {step.step}
                  </div>
                  <div>
                    <h3 className="font-bold text-white">{step.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-blue-200/80">{step.description}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="bg-white py-20 lg:py-24">
        <div className="marketing-container">
          <motion.div
            className="mx-auto max-w-2xl text-center"
            variants={headerContainer}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.4 }}
          >
            <motion.h2 variants={headerItem} className="text-3xl font-bold leading-tight text-gray-900 md:text-4xl">
              With vs. without{" "}
              <span className="bg-gradient-to-r from-amber-500 via-amber-600 to-orange-500 bg-clip-text text-transparent">
                Fauward Agent
              </span>
            </motion.h2>
            <motion.p variants={headerItem} className="mt-3 text-lg text-gray-600">
              The difference in your operations team&apos;s daily workload.
            </motion.p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.7, ease: EASE }}
            className="mx-auto mt-12 max-w-4xl overflow-hidden rounded-2xl border border-gray-200 shadow-sm"
          >
            <div className="grid grid-cols-3 bg-gray-900 px-6 py-4 text-xs font-bold uppercase tracking-widest text-gray-300">
              <span>Task</span>
              <span className="text-red-400">Without Agent</span>
              <span className="text-green-400">With Fauward Agent</span>
            </div>
            {COMPARISON_ROWS.map((row, i) => (
              <motion.div
                key={row.task}
                initial={{ opacity: 0, x: -16 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ delay: i * 0.06, duration: 0.4, ease: EASE }}
                className={`grid grid-cols-3 items-start gap-4 px-6 py-4 text-sm ${i % 2 === 0 ? "bg-white" : "bg-gray-50"}`}
              >
                <span className="font-medium text-gray-900">{row.task}</span>
                <span className="text-red-600">{row.without}</span>
                <span className="flex items-start gap-1.5 text-gray-900">
                  <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-green-500" />
                  {row.with}
                </span>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Pricing note */}
      <section className="bg-slate-50 py-16">
        <div className="marketing-container">
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.7, ease: EASE }}
            className="relative mx-auto max-w-3xl overflow-hidden rounded-2xl bg-gradient-to-br from-[#0d1f3c] to-[#1a3a6e] px-8 py-10 text-center shadow-xl"
          >
            <motion.div
              aria-hidden
              className="pointer-events-none absolute -top-20 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-amber-400/30 blur-3xl"
              animate={{ opacity: [0.4, 0.7, 0.4] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            />
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-amber-400">Included in your plan</p>
            <h3 className="text-2xl font-bold text-white">Fauward Agent is built in — not bolted on</h3>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-blue-200">
              Available on Pro and Enterprise plans. No separate pricing, no API key setup, no integrations to configure. Switch it on from your dashboard.
            </p>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <MotionLink
                href="/signup"
                whileHover={{ y: -2, scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex h-11 items-center rounded-lg bg-amber-500 px-7 text-sm font-semibold text-gray-900 shadow-lg shadow-amber-500/30"
              >
                Start Free Trial
              </MotionLink>
              <MotionLink
                href="/pricing"
                whileHover={{ y: -2, scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex h-11 items-center rounded-lg border border-white/20 px-7 text-sm font-semibold text-white hover:bg-white/10"
              >
                See Pro &amp; Enterprise Plans
              </MotionLink>
            </div>
          </motion.div>
        </div>
      </section>

      <CTABanner
        title="Ready to put your operations on autopilot?"
        description="Fauward Agent handles the repetitive work so your team can focus on growing the business."
        ctaLabel="Start Free Trial"
        ctaHref="/signup"
      />
    </>
  );
}
