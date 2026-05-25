import { useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Loader2,
  Package,
  ShieldCheck,
  Truck,
  Users,
  XCircle
} from "lucide-react";

import { api } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageShell } from "@/layouts/PageShell";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ActionRecord {
  tool: string;
  decision: "auto_approved" | "requires_approval" | "blocked";
  executed: boolean;
  durationMs?: number;
  error?: string;
}

interface AgentQueryResult {
  status: "completed" | "requires_approval" | "blocked" | "already_processed" | "failed";
  finalMessage?: string;
  actions: ActionRecord[];
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  durationMs?: number;
}

// ─── Content ─────────────────────────────────────────────────────────────────

const liveCapabilities = [
  {
    icon: AlertTriangle,
    title: "Failed-delivery response",
    body: "Failed deliveries from the portal, driver app, or field app wake the agent. It pulls the shipment, considers the next step, and queues a proposal for your approval."
  },
  {
    icon: ShieldCheck,
    title: "Human-approved actions",
    body: "Risky moves — reassigning a shipment, drafting a customer notification, flagging SLA risk — never run silently. They land on the Agent Actions screen for you to approve or reject."
  },
  {
    icon: Package,
    title: "Instant read-only lookups",
    body: "The agent can read shipment details, available drivers, and operational stats on its own. Anything read-only runs without bothering you."
  }
];

const comingSoonCapabilities = [
  {
    icon: Truck,
    title: "Auto-assignment",
    body: "Proximity, capacity, and workload-aware dispatch to Fauward Go operators — no dispatcher needed."
  },
  {
    icon: Clock,
    title: "SLA breach prediction",
    body: "Flagging shipments at risk before they breach so you can intervene early, instead of after."
  },
  {
    icon: BarChart3,
    title: "Carrier selection",
    body: "Surfacing the best carrier per route by cost, service tier, and estimated delivery time."
  }
];

const safetyPoints = [
  {
    icon: ShieldCheck,
    title: "Policy-controlled",
    body: "Every action is classified before it runs. Safe operations execute automatically. Risky ones — like rerouting an assigned shipment — require your approval. Blocked actions (like accessing another tenant's data) cannot execute at all."
  },
  {
    icon: Users,
    title: "Tenant-isolated",
    body: "The agent can only access data belonging to your workspace. Cross-tenant access is blocked at five independent layers — route, schema, policy, handler, and audit."
  },
  {
    icon: FileText,
    title: "Fully audited",
    body: "Every tool call is logged with decision, duration, and outcome. No action is taken silently. Every response shows which tools ran and how long they took. Coming soon: Agent Activity tab in your dashboard."
  }
];

const exampleQuestions = [
  "How many shipments failed this week?",
  "What are the top delay reasons this month?",
  "Show me SLA breach rate for the last 30 days"
];

// ─── Component ───────────────────────────────────────────────────────────────

export function AgentPage() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AgentQueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleQuery(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    setQuestion(trimmed);
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const res = await api.post<AgentQueryResult>(
        "/v1/agent/query",
        { question: trimmed },
        { timeout: 120_000 }
      );
      setResult(res.data);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "The agent could not complete this query. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageShell
      title="Fauward Agent"
      description="Built-in AI operations layer for Pro and Enterprise workspaces."
    >
      <div className="space-y-10">

        {/* ── Hero ── */}
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-600 text-white">
              <Bot size={24} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold text-gray-900">Built in, not bolted on</h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                  Live
                </span>
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-700">
                Fauward Agent runs inside your workspace. When a delivery fails — from your portal, the
                driver app, or a field agent — it wakes up, looks at the shipment, and proposes the next
                move for your approval. Read-only lookups run instantly; anything that changes data
                waits for a human.
              </p>
            </div>
          </div>
        </section>

        {/* ── Capabilities ── */}
        <section className="space-y-6">
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Available today
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {liveCapabilities.map((cap) => (
                <div
                  key={cap.title}
                  className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
                >
                  <cap.icon className="h-5 w-5 text-[var(--tenant-primary)]" />
                  <h4 className="mt-4 text-sm font-semibold text-gray-900">{cap.title}</h4>
                  <p className="mt-1.5 text-sm leading-6 text-gray-600">{cap.body}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Coming soon
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {comingSoonCapabilities.map((cap) => (
                <div
                  key={cap.title}
                  className="rounded-2xl border border-dashed border-gray-300 bg-gray-50/60 p-5"
                >
                  <div className="flex items-center justify-between">
                    <cap.icon className="h-5 w-5 text-gray-400" />
                    <Badge variant="neutral">Coming soon</Badge>
                  </div>
                  <h4 className="mt-4 text-sm font-semibold text-gray-700">{cap.title}</h4>
                  <p className="mt-1.5 text-sm leading-6 text-gray-500">{cap.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Query ── */}
        <section>
          <div className="mb-1 flex items-center gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Ask a question
            </h3>
            <Badge variant="warning">Experimental</Badge>
          </div>
          <p className="mb-4 text-sm text-gray-500">
            Early preview. Best at lookups about specific shipments, drivers, and recent operational
            stats. General ops questions may not work yet.
          </p>

          <div className="flex gap-2">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !loading && handleQuery(question)}
              placeholder="e.g. How many shipments failed this week?"
              className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[var(--tenant-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--tenant-primary)]"
              disabled={loading}
            />
            <Button
              onClick={() => handleQuery(question)}
              disabled={loading || !question.trim()}
              className="shrink-0"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Ask
                  <ChevronRight className="ml-1 h-4 w-4" />
                </>
              )}
            </Button>
          </div>

          {/* Example prompts */}
          {!result && !loading && (
            <div className="mt-3 flex flex-wrap gap-2">
              {exampleQuestions.map((q) => (
                <button
                  key={q}
                  onClick={() => handleQuery(q)}
                  className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600 hover:border-[var(--tenant-primary)] hover:text-[var(--tenant-primary)] transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 px-5 py-4">
              <div className="flex items-center gap-3 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin text-[var(--tenant-primary)]" />
                Agent is querying your data…
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-5 py-4">
              <div className="flex items-start gap-3">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          )}

          {/* Result */}
          {result && !loading && (
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <Bot className="h-4 w-4 text-[var(--tenant-primary)]" />
                  <span className="text-xs font-medium text-gray-500">Fauward Agent</span>
                  {result.status === "completed" && (
                    <span className="ml-auto flex items-center gap-1 text-xs text-green-600">
                      <CheckCircle2 className="h-3 w-3" />
                      Completed
                    </span>
                  )}
                  {result.status === "failed" && (
                    <span className="ml-auto flex items-center gap-1 text-xs text-red-500">
                      <XCircle className="h-3 w-3" />
                      Failed
                    </span>
                  )}
                </div>
                <p className="text-sm leading-6 text-gray-800 whitespace-pre-wrap">
                  {result.finalMessage ?? "No response."}
                </p>
              </div>

              {/* Tools called */}
              {result.actions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {result.actions.map((action, i) => (
                    <span
                      key={i}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        action.executed
                          ? "bg-gray-100 text-gray-600"
                          : "bg-amber-50 text-amber-700 border border-amber-200"
                      }`}
                    >
                      {action.executed ? (
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                      ) : (
                        <XCircle className="h-3 w-3 text-amber-500" />
                      )}
                      {action.tool.replaceAll("_", " ")}
                      {action.durationMs && (
                        <span className="text-gray-400">{action.durationMs}ms</span>
                      )}
                    </span>
                  ))}
                </div>
              )}

              {result.usage && (
                <p className="text-xs text-gray-400">
                  {result.usage.totalTokens.toLocaleString()} tokens · {result.durationMs ? `${(result.durationMs / 1000).toFixed(1)}s` : ""}
                </p>
              )}
            </div>
          )}
        </section>

        {/* ── Safety ── */}
        <section>
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Safe by design
          </h3>
          <div className="grid gap-4 sm:grid-cols-3">
            {safetyPoints.map((point) => (
              <div
                key={point.title}
                className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
              >
                <point.icon className="h-5 w-5 text-[var(--tenant-primary)]" />
                <h4 className="mt-4 text-sm font-semibold text-gray-900">{point.title}</h4>
                <p className="mt-1.5 text-sm leading-6 text-gray-600">{point.body}</p>
              </div>
            ))}
          </div>
        </section>

      </div>
    </PageShell>
  );
}
