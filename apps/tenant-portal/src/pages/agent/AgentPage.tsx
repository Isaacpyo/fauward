import { Bot, MessageSquare, Settings2, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { PageShell } from "@/layouts/PageShell";

const agentCards = [
  {
    title: "Shipment answers",
    body: "Let operators ask questions about shipments, routes, exceptions, and customer updates.",
    icon: MessageSquare
  },
  {
    title: "Operations prompts",
    body: "Summarise active risks, delayed shipments, failed deliveries, and support issues from the dashboard.",
    icon: Sparkles
  },
  {
    title: "Controlled setup",
    body: "Switch it on from the dashboard. No separate API keys, billing, or third-party integrations.",
    icon: Settings2
  }
];

export function AgentPage() {
  return (
    <PageShell
      title="Fauward Agent"
      description="Built-in operational assistance for Pro and Enterprise workspaces."
      actions={
        <Button asChild>
          <Link to="/">Open dashboard</Link>
        </Button>
      }
    >
      <div className="space-y-6">
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-600 text-white">
              <Bot size={24} />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Built in, not bolted on</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-700">
                Fauward Agent is included on Pro and Enterprise plans. It uses your workspace context to help teams
                understand operational status, identify risks, and move faster without adding another integration.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {agentCards.map((card) => (
            <div key={card.title} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <card.icon className="h-5 w-5 text-[var(--tenant-primary)]" />
              <h3 className="mt-4 text-base font-semibold text-gray-900">{card.title}</h3>
              <p className="mt-2 text-sm leading-6 text-gray-600">{card.body}</p>
            </div>
          ))}
        </section>
      </div>
    </PageShell>
  );
}
