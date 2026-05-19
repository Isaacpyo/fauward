import { EmptyState, HealthPill } from "@fauward/internal-ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, ShieldCheck } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { internalApi } from "@/lib/internal-api";

type WorkflowOpsPageProps = {
  title: string;
  description: string;
  endpoint: string;
  primaryAction?: string;
  related?: Array<{ label: string; to: string }>;
};

type WorkflowField = {
  name: string;
  label: string;
  type?: "text" | "number" | "date" | "textarea" | "select";
  placeholder?: string;
  options?: string[];
  defaultValue?: string;
  required?: boolean;
};

type WorkflowAction = {
  id: string;
  label: string;
  description: string;
  method: "post" | "patch";
  path: (values: Record<string, string>, resolvedEndpoint: string) => string;
  fields: WorkflowField[];
  payload: (values: Record<string, string>) => Record<string, unknown>;
};

const WORKFLOW_PREFIXES = [
  "/dunning",
  "/incidents",
  "/support",
  "/announcements",
  "/success",
  "/jit",
  "/compliance",
  "/safety",
  "/flags",
  "/security",
  "/kyc",
  "/contracts",
  "/qbr",
  "/trials",
  "/demos",
  "/commissions"
];

export function hasWorkflowSurface(endpoint: string) {
  return WORKFLOW_PREFIXES.some((prefix) => endpoint.startsWith(prefix));
}

function normalizeRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.data)) return record.data;
    for (const value of Object.values(record)) {
      if (Array.isArray(value)) return value;
    }
  }
  return [];
}

function valueLabel(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object" && "name" in value && typeof (value as { name?: unknown }).name === "string") return String((value as { name: string }).name);
  return JSON.stringify(value);
}

function rowTitle(row: unknown): string {
  if (!row || typeof row !== "object") return valueLabel(row);
  const record = row as Record<string, unknown>;
  return valueLabel(record.name ?? record.title ?? record.subject ?? record.quoteNumber ?? record.provider ?? record.region ?? record.eventType ?? record.id);
}

function rowStatus(row: unknown): string | null {
  if (!row || typeof row !== "object") return null;
  const status = (row as Record<string, unknown>).status ?? (row as Record<string, unknown>).decision;
  return typeof status === "string" ? status : null;
}

function statusColor(status: string): "green" | "amber" | "red" {
  const normalized = status.toLowerCase();
  if (["active", "approved", "paid", "verified", "operational", "won", "completed", "signed"].some((term) => normalized.includes(term))) return "green";
  if (["pending", "draft", "open", "queued", "trial", "review", "required"].some((term) => normalized.includes(term))) return "amber";
  if (["failed", "suspended", "rejected", "denied", "down", "lost", "expired", "blocked"].some((term) => normalized.includes(term))) return "red";
  return "amber";
}

function compactFields(row: unknown): Array<[string, string]> {
  if (!row || typeof row !== "object") return [];
  const record = row as Record<string, unknown>;
  return Object.entries(record)
    .filter(([key, value]) => !["id", "payload", "terms", "metadata", "before", "after", "steps", "scope"].includes(key) && value !== null && value !== undefined && typeof value !== "object")
    .slice(0, 6)
    .map(([key, value]) => [key, valueLabel(value)]);
}

function numeric(value: string) {
  return value.trim() === "" ? undefined : Number(value);
}

function actionPresets(endpoint: string, title: string): WorkflowAction[] {
  if (endpoint.startsWith("/dunning")) {
    return [
      {
        id: "retry",
        label: "Queue Manual Retry",
        description: "Retry a failed invoice. The backend suspends the tenant after the retry ceiling.",
        method: "post",
        path: (values) => `/dunning/retry/${encodeURIComponent(values.invoiceId)}`,
        fields: [
          { name: "invoiceId", label: "Invoice ID", required: true },
          { name: "reason", label: "Reason", type: "textarea", defaultValue: "Manual dunning retry" }
        ],
        payload: (values) => ({ reason: values.reason })
      },
      {
        id: "save-offer",
        label: "Issue Save Offer",
        description: "Create an approved save-the-customer offer for a tenant.",
        method: "post",
        path: () => "/dunning/save-offers",
        fields: [
          { name: "tenantId", label: "Tenant ID", required: true },
          { name: "discount", label: "Discount GBP", type: "number", required: true },
          { name: "expiresAt", label: "Expires At", type: "date" },
          { name: "reason", label: "Reason", type: "textarea", defaultValue: "Save offer" }
        ],
        payload: (values) => ({ tenantId: values.tenantId, discount: numeric(values.discount), expiresAt: values.expiresAt || undefined, reason: values.reason })
      }
    ];
  }

  if (endpoint.startsWith("/incidents")) {
    return [
      {
        id: "impact",
        label: "Tag Tenant Impact",
        description: "Map a PagerDuty incident to affected Fauward tenants.",
        method: "post",
        path: (values, resolved) => `/incidents/${encodeURIComponent(values.incidentId || resolved.split("/")[2] || "")}/impacts`,
        fields: [
          { name: "incidentId", label: "Incident ID", required: true },
          { name: "tenantId", label: "Tenant ID", required: true },
          { name: "impactLevel", label: "Impact", type: "select", options: ["AFFECTED", "DEGRADED", "OUTAGE"], defaultValue: "AFFECTED" },
          { name: "notes", label: "Notes", type: "textarea" }
        ],
        payload: (values) => ({ tenantId: values.tenantId, impactLevel: values.impactLevel, notes: values.notes })
      }
    ];
  }

  if (endpoint.startsWith("/support")) {
    return [
      {
        id: "ticket",
        label: "Create Linked Ticket",
        description: "Create a tenant-linked Zendesk ticket record from the console.",
        method: "post",
        path: () => "/support/tickets",
        fields: [
          { name: "tenantId", label: "Tenant ID", required: true },
          { name: "subject", label: "Subject", required: true },
          { name: "priority", label: "Priority", type: "select", options: ["normal", "high", "urgent"], defaultValue: "normal" },
          { name: "requesterEmail", label: "Requester Email" }
        ],
        payload: (values) => ({ tenantId: values.tenantId, subject: values.subject, priority: values.priority, requesterEmail: values.requesterEmail })
      }
    ];
  }

  if (endpoint.startsWith("/announcements")) {
    return [
      {
        id: "announcement",
        label: "Publish Announcement",
        description: "Create a tenant portal announcement targeted to all tenants, plans, or specific tenant IDs.",
        method: "post",
        path: () => "/announcements",
        fields: [
          { name: "type", label: "Type", type: "select", options: ["INFO", "WARNING", "MAINTENANCE"], defaultValue: "INFO" },
          { name: "title", label: "Title", required: true },
          { name: "body", label: "Body", type: "textarea", required: true },
          { name: "tenantIds", label: "Tenant IDs (comma-separated)" },
          { name: "planTiers", label: "Plan tiers (comma-separated)" },
          { name: "expiresAt", label: "Expires At", type: "date" }
        ],
        payload: (values) => ({
          type: values.type,
          title: values.title,
          body: values.body,
          targetAll: !values.tenantIds && !values.planTiers,
          tenantIds: values.tenantIds.split(",").map((item) => item.trim()).filter(Boolean),
          planTiers: values.planTiers.split(",").map((item) => item.trim()).filter(Boolean),
          expiresAt: values.expiresAt || undefined,
          dismissible: true
        })
      }
    ];
  }

  if (endpoint.startsWith("/success")) {
    return [
      {
        id: "health",
        label: "Queue Health Scoring",
        description: "Run the weighted health score computation through BullMQ.",
        method: "post",
        path: () => "/success/health-scoring/run",
        fields: [{ name: "reason", label: "Reason", type: "textarea", defaultValue: "Manual health scoring run" }],
        payload: (values) => ({ reason: values.reason })
      },
      {
        id: "playbook",
        label: "Create Playbook",
        description: "Create a threshold-triggered CS playbook definition.",
        method: "post",
        path: () => "/success/playbooks",
        fields: [
          { name: "name", label: "Name", required: true },
          { name: "trigger", label: "Trigger", type: "select", options: ["health_below_45", "health_above_80"], defaultValue: "health_below_45" },
          { name: "reason", label: "Reason", type: "textarea", defaultValue: "CS playbook" }
        ],
        payload: (values) => ({ name: values.name, trigger: values.trigger, steps: [{ type: "notify_csm", status: "PENDING" }], reason: values.reason })
      }
    ];
  }

  if (endpoint.startsWith("/jit")) {
    return [
      {
        id: "request",
        label: "Request Elevated Access",
        description: "Create a JIT request with reason and bounded duration.",
        method: "post",
        path: () => "/jit/requests",
        fields: [
          { name: "permission", label: "Permission", required: true },
          { name: "durationMinutes", label: "Duration Minutes", type: "number", defaultValue: "60" },
          { name: "hardwareKeyAssertion", label: "Hardware Key Assertion" },
          { name: "reason", label: "Reason", type: "textarea", required: true }
        ],
        payload: (values) => ({ permission: values.permission, durationMinutes: numeric(values.durationMinutes), hardwareKeyAssertion: values.hardwareKeyAssertion || undefined, reason: values.reason })
      },
      {
        id: "approve",
        label: "Approve Request",
        description: "Approve a pending JIT request. Self-approval is blocked by the backend.",
        method: "post",
        path: (values) => `/jit/requests/${encodeURIComponent(values.requestId)}/approve`,
        fields: [
          { name: "requestId", label: "Request ID", required: true },
          { name: "notes", label: "Notes", type: "textarea" }
        ],
        payload: (values) => ({ notes: values.notes })
      },
      {
        id: "revoke",
        label: "Revoke Session",
        description: "Revoke an active elevated session immediately.",
        method: "post",
        path: (values) => `/jit/sessions/${encodeURIComponent(values.requestId)}/revoke`,
        fields: [
          { name: "requestId", label: "Session ID", required: true },
          { name: "reason", label: "Reason", type: "textarea", defaultValue: "JIT revoked" }
        ],
        payload: (values) => ({ reason: values.reason })
      }
    ];
  }

  if (endpoint.startsWith("/compliance")) {
    return [
      {
        id: "transition",
        label: "Advance DSAR",
        description: "Move a DSAR through the audited workflow state machine.",
        method: "patch",
        path: (values) => `/compliance/dsar/${encodeURIComponent(values.dsarId)}`,
        fields: [
          { name: "dsarId", label: "DSAR ID", required: true },
          { name: "status", label: "Next Status", type: "select", options: ["IDENTITY_VERIFIED", "DATA_GATHERED", "REVIEWED", "RESPONSE_DRAFTED", "APPROVED", "DELIVERED", "CLOSED"], defaultValue: "IDENTITY_VERIFIED" },
          { name: "notes", label: "Notes", type: "textarea" }
        ],
        payload: (values) => ({ status: values.status, notes: values.notes })
      },
      {
        id: "hold",
        label: "Create Legal Hold",
        description: "Create a hold that blocks tenant deletion and erasure completion.",
        method: "post",
        path: () => "/compliance/legal-hold",
        fields: [
          { name: "tenantId", label: "Tenant ID" },
          { name: "reason", label: "Reason", type: "textarea", required: true }
        ],
        payload: (values) => ({ tenantId: values.tenantId || null, reason: values.reason, scope: { source: "console" } })
      }
    ];
  }

  if (endpoint.startsWith("/safety")) {
    return [
      {
        id: "flag",
        label: "Flag Tenant",
        description: "Create a manual trust and safety fraud signal.",
        method: "post",
        path: () => "/safety/fraud",
        fields: [
          { name: "tenantId", label: "Tenant ID", required: true },
          { name: "severity", label: "Severity", type: "select", options: ["LOW", "MEDIUM", "HIGH"], defaultValue: "MEDIUM" },
          { name: "reason", label: "Reason", type: "textarea", required: true }
        ],
        payload: (values) => ({ tenantId: values.tenantId, severity: values.severity, reason: values.reason, signalType: "manual_flag" })
      },
      {
        id: "decision",
        label: "Resolve Signal",
        description: "Suspend, dismiss, or escalate a fraud signal.",
        method: "post",
        path: (values) => `/safety/fraud/${encodeURIComponent(values.signalId)}/decision`,
        fields: [
          { name: "signalId", label: "Signal ID", required: true },
          { name: "decision", label: "Decision", type: "select", options: ["suspend", "dismiss", "escalate"], defaultValue: "dismiss" },
          { name: "reason", label: "Reason", type: "textarea" }
        ],
        payload: (values) => ({ decision: values.decision, reason: values.reason })
      },
      {
        id: "appeal",
        label: "Review Appeal",
        description: "Approve or reject a tenant suspension appeal.",
        method: "patch",
        path: (values) => `/safety/appeals/${encodeURIComponent(values.appealId)}`,
        fields: [
          { name: "appealId", label: "Appeal ID", required: true },
          { name: "status", label: "Decision", type: "select", options: ["APPROVED", "REJECTED"], defaultValue: "APPROVED" },
          { name: "reason", label: "Reason", type: "textarea", required: true }
        ],
        payload: (values) => ({ status: values.status, reason: values.reason, reviewNote: values.reason })
      }
    ];
  }

  if (endpoint.startsWith("/flags")) {
    return [
      {
        id: "override",
        label: "Set Tenant Override",
        description: "Write a LaunchDarkly tenant override and Fauward audit entry.",
        method: "post",
        path: (values, resolved) => `/flags/${encodeURIComponent(values.flagKey || resolved.split("/")[2] || "")}/overrides`,
        fields: [
          { name: "flagKey", label: "Flag Key", required: true },
          { name: "tenantId", label: "Tenant ID", required: true },
          { name: "value", label: "Value", defaultValue: "true" },
          { name: "reason", label: "Reason", type: "textarea", defaultValue: "Tenant override" }
        ],
        payload: (values) => ({ tenantId: values.tenantId, value: values.value === "true" ? true : values.value === "false" ? false : values.value, reason: values.reason })
      }
    ];
  }

  if (endpoint.startsWith("/security")) {
    return [
      {
        id: "block",
        label: "Block IP",
        description: "Add an IP block from the security console.",
        method: "post",
        path: () => "/security/ip-blocks",
        fields: [
          { name: "ipAddress", label: "IP Address", required: true },
          { name: "expiresAt", label: "Expires At", type: "date" },
          { name: "reason", label: "Reason", type: "textarea", defaultValue: "Manual block" }
        ],
        payload: (values) => ({ ipAddress: values.ipAddress, expiresAt: values.expiresAt || undefined, reason: values.reason })
      },
      {
        id: "revoke",
        label: "Revoke Staff Session",
        description: "Force an active staff session to re-authenticate.",
        method: "post",
        path: (values) => `/security/sessions/${encodeURIComponent(values.sessionId)}/revoke`,
        fields: [
          { name: "sessionId", label: "Session ID", required: true },
          { name: "reason", label: "Reason", type: "textarea", defaultValue: "Session revoked" }
        ],
        payload: (values) => ({ reason: values.reason })
      }
    ];
  }

  if (endpoint.startsWith("/kyc")) {
    return [
      {
        id: "inquiry",
        label: "Create Persona Inquiry",
        description: "Start Persona verification for a tenant.",
        method: "post",
        path: () => "/kyc/inquiries",
        fields: [
          { name: "tenantId", label: "Tenant ID", required: true },
          { name: "reason", label: "Reason", type: "textarea", defaultValue: "KYC inquiry" }
        ],
        payload: (values) => ({ tenantId: values.tenantId, reason: values.reason })
      },
      {
        id: "decision",
        label: "KYC Decision",
        description: "Approve or reject a KYC review; PEP approvals require senior compliance approval.",
        method: "post",
        path: (values) => `/kyc/inquiries/${encodeURIComponent(values.reviewId)}/decision`,
        fields: [
          { name: "reviewId", label: "Review ID", required: true },
          { name: "decision", label: "Decision", type: "select", options: ["approve", "reject"], defaultValue: "approve" },
          { name: "reason", label: "Reason", type: "textarea" }
        ],
        payload: (values) => ({ decision: values.decision, reason: values.reason })
      },
      {
        id: "screen",
        label: "Run Sanctions Screen",
        description: "Run a ComplyAdvantage manual screen.",
        method: "post",
        path: () => "/kyc/screen",
        fields: [
          { name: "tenantId", label: "Tenant ID", required: true },
          { name: "searchTerm", label: "Search Term" },
          { name: "reason", label: "Reason", type: "textarea", defaultValue: "Manual sanctions screen" }
        ],
        payload: (values) => ({ tenantId: values.tenantId, searchTerm: values.searchTerm, reason: values.reason })
      }
    ];
  }

  if (endpoint.startsWith("/contracts")) {
    return [
      {
        id: "quote",
        label: "Create Quote",
        description: "Create a CPQ quote with discount approval routing.",
        method: "post",
        path: () => "/contracts/quotes",
        fields: [
          { name: "tenantId", label: "Tenant ID" },
          { name: "plan", label: "Plan", type: "select", options: ["PRO", "BUSINESS", "ENTERPRISE"], defaultValue: "ENTERPRISE" },
          { name: "termMonths", label: "Term Months", type: "number", defaultValue: "12" },
          { name: "discountPercent", label: "Discount Percent", type: "number", defaultValue: "0" },
          { name: "reason", label: "Reason", type: "textarea", defaultValue: "Create quote" }
        ],
        payload: (values) => ({ tenantId: values.tenantId || undefined, plan: values.plan, termMonths: numeric(values.termMonths), discountPercent: numeric(values.discountPercent), reason: values.reason })
      },
      {
        id: "approve",
        label: title.includes("Detail") ? "Approve Quote" : "Approve Quote",
        description: "Approve a quote subject to discount thresholds.",
        method: "post",
        path: (values) => `/contracts/quotes/${encodeURIComponent(values.quoteId)}/approve`,
        fields: [
          { name: "quoteId", label: "Quote ID", required: true },
          { name: "reason", label: "Reason", type: "textarea", defaultValue: "Quote approved" }
        ],
        payload: (values) => ({ reason: values.reason })
      },
      {
        id: "send",
        label: "Send to DocuSign",
        description: "Create a DocuSign envelope for an approved quote.",
        method: "post",
        path: (values) => `/contracts/quotes/${encodeURIComponent(values.quoteId)}/send`,
        fields: [
          { name: "quoteId", label: "Quote ID", required: true },
          { name: "reason", label: "Reason", type: "textarea", defaultValue: "Send to DocuSign" }
        ],
        payload: (values) => ({ reason: values.reason })
      }
    ];
  }

  if (endpoint.startsWith("/qbr")) {
    return [
      {
        id: "generate",
        label: "Generate Deck",
        description: "Queue a QBR deck generation for a tenant.",
        method: "post",
        path: (values) => `/qbr/${encodeURIComponent(values.tenantId)}/generate`,
        fields: [
          { name: "tenantId", label: "Tenant ID", required: true },
          { name: "periodStart", label: "Period Start", type: "date" },
          { name: "periodEnd", label: "Period End", type: "date" },
          { name: "reason", label: "Reason", type: "textarea", defaultValue: "Generate QBR deck" }
        ],
        payload: (values) => ({ periodStart: values.periodStart || undefined, periodEnd: values.periodEnd || undefined, reason: values.reason })
      }
    ];
  }

  if (endpoint.startsWith("/trials")) {
    return [
      {
        id: "approve",
        label: "Approve Extension",
        description: "Approve a trial extension using the configured threshold rules.",
        method: "post",
        path: (values) => `/trials/extensions/${encodeURIComponent(values.requestId)}/approve`,
        fields: [
          { name: "requestId", label: "Request ID", required: true },
          { name: "reason", label: "Reason", type: "textarea", defaultValue: "Trial extension approved" }
        ],
        payload: (values) => ({ reason: values.reason })
      }
    ];
  }

  if (endpoint.startsWith("/demos")) {
    return [
      {
        id: "create",
        label: "Create Demo Tenant",
        description: "Provision a DEMO tenant from a sales template.",
        method: "post",
        path: () => "/demos",
        fields: [
          { name: "template", label: "Template", type: "select", options: ["logistics-3pl", "retail", "manufacturing"], defaultValue: "logistics-3pl" },
          { name: "expiresAt", label: "Expires At", type: "date" },
          { name: "reason", label: "Reason", type: "textarea", defaultValue: "Create demo" }
        ],
        payload: (values) => ({ template: values.template, expiresAt: values.expiresAt || undefined, reason: values.reason })
      }
    ];
  }

  if (endpoint.startsWith("/commissions")) {
    return [
      {
        id: "approve",
        label: "Approve Payout",
        description: "Approve a payout. Amounts over GBP 5,000 require Finance plus CFO approval.",
        method: "post",
        path: (values) => `/commissions/payouts/${encodeURIComponent(values.payoutId)}/approve`,
        fields: [
          { name: "payoutId", label: "Payout ID", required: true },
          { name: "reason", label: "Reason", type: "textarea", defaultValue: "Payout approved" }
        ],
        payload: (values) => ({ reason: values.reason })
      }
    ];
  }

  return [];
}

function defaultValues(action: WorkflowAction) {
  return Object.fromEntries(action.fields.map((field) => [field.name, field.defaultValue ?? ""]));
}

function ActionPanel({ actions, resolvedEndpoint }: { actions: WorkflowAction[]; resolvedEndpoint: string }) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState(actions[0]?.id ?? "");
  const selected = actions.find((action) => action.id === selectedId) ?? actions[0];
  const [values, setValues] = useState<Record<string, string>>(selected ? defaultValues(selected) : {});
  const [result, setResult] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!selected) return null;
      const path = selected.path(values, resolvedEndpoint);
      const payload = selected.payload(values);
      const response = selected.method === "patch" ? await internalApi.patch(path, payload) : await internalApi.post(path, payload);
      return response.data as unknown;
    },
    onSuccess: (data) => {
      setResult(`Queued or saved: ${valueLabel(data)}`);
      void queryClient.invalidateQueries({ queryKey: ["workflow-ops", resolvedEndpoint] });
      void queryClient.invalidateQueries({ queryKey: ["internal-ops", resolvedEndpoint] });
    },
    onError: (error) => {
      const response = error && typeof error === "object" && "response" in error ? (error as { response?: { data?: { error?: string } } }).response : undefined;
      setResult(response?.data?.error ?? "Workflow action failed");
    }
  });

  if (!selected) return null;

  function switchAction(id: string) {
    const next = actions.find((action) => action.id === id);
    setSelectedId(id);
    setValues(next ? defaultValues(next) : {});
    setResult(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-[var(--fauward-navy)]" />
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Workflow Action</h2>
          </div>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">{selected.description}</p>
        </div>
        {actions.length > 1 ? (
          <select
            value={selected.id}
            onChange={(event) => switchAction(event.target.value)}
            className="rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-medium text-[var(--color-text-primary)]"
          >
            {actions.map((action) => (
              <option key={action.id} value={action.id}>{action.label}</option>
            ))}
          </select>
        ) : null}
      </div>

      <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={submit}>
        {selected.fields.map((field) => (
          <label key={field.name} className={field.type === "textarea" ? "md:col-span-2" : ""}>
            <span className="mb-1 block text-xs font-semibold text-[var(--color-text-muted)]">{field.label}</span>
            {field.type === "textarea" ? (
              <textarea
                required={field.required}
                value={values[field.name] ?? ""}
                onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
                placeholder={field.placeholder}
                rows={3}
                className="w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--fauward-navy)]"
              />
            ) : field.type === "select" ? (
              <select
                required={field.required}
                value={values[field.name] ?? ""}
                onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
                className="w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--fauward-navy)]"
              >
                {(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            ) : (
              <input
                required={field.required}
                type={field.type ?? "text"}
                value={values[field.name] ?? ""}
                onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
                placeholder={field.placeholder}
                className="w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--fauward-navy)]"
              />
            )}
          </label>
        ))}
        <div className="flex items-center gap-3 md:col-span-2">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="inline-flex items-center gap-2 rounded-md bg-[var(--fauward-navy)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            <Send size={14} />
            {mutation.isPending ? "Submitting..." : selected.label}
          </button>
          {result ? <p className="text-xs text-[var(--color-text-muted)]">{result}</p> : null}
        </div>
      </form>
    </section>
  );
}

export function WorkflowOpsPage({ title, description, endpoint, primaryAction, related = [] }: WorkflowOpsPageProps) {
  const params = useParams();
  const resolvedEndpoint = Object.entries(params).reduce((path, [key, value]) => path.replace(`:${key}`, value ?? ""), endpoint);
  const actions = useMemo(() => actionPresets(endpoint, title), [endpoint, title]);
  const query = useQuery({
    queryKey: ["workflow-ops", resolvedEndpoint],
    queryFn: async () => (await internalApi.get(resolvedEndpoint)).data
  });
  const rows = normalizeRows(query.data);
  const vendor = query.data && typeof query.data === "object" ? (query.data as Record<string, unknown>).vendor : null;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">{title}</h1>
          <p className="mt-1 max-w-3xl text-sm text-[var(--color-text-muted)]">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {related.map((item) => (
            <Link key={item.to} to={item.to} className="rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--fauward-navy)]">
              {item.label}
            </Link>
          ))}
          {primaryAction ? <span className="rounded-md bg-[var(--fauward-navy)] px-3 py-2 text-xs font-semibold text-white">{primaryAction}</span> : null}
        </div>
      </header>

      {actions.length > 0 ? <ActionPanel actions={actions} resolvedEndpoint={resolvedEndpoint} /> : null}

      {vendor ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Vendor integration is not configured in this environment. Read-only Fauward data is still shown.
        </div>
      ) : null}

      {query.isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Loading...</p> : null}
      {query.isError ? <EmptyState title="Unable to load" message="The service endpoint returned an error or is not configured for this environment." /> : null}
      {!query.isLoading && !query.isError && rows.length === 0 ? <EmptyState title="No records" message="No records matched this operational view yet." /> : null}

      {rows.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-white">
          <div className="divide-y divide-[var(--color-border)]">
            {rows.map((row, index) => {
              const status = rowStatus(row);
              return (
                <article key={typeof row === "object" && row && "id" in row ? String((row as { id: unknown }).id) : index} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{rowTitle(row)}</h2>
                    {status ? <HealthPill status={statusColor(status)} label={status} /> : null}
                  </div>
                  <dl className="mt-3 grid gap-2 text-xs md:grid-cols-3">
                    {compactFields(row).map(([key, value]) => (
                      <div key={key}>
                        <dt className="font-medium capitalize text-[var(--color-text-muted)]">{key.replace(/([A-Z])/g, " $1")}</dt>
                        <dd className="mt-0.5 truncate text-[var(--color-text-primary)]">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
