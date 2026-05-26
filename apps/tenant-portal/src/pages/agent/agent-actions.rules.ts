// Classification + per-action verb table for agent actions.
//
// EDIT HERE to add new action types or notification templates. The rules are
// intentionally rule-based (not LLM judgment) and unmapped types default to
// ACTIONABLE — we'd rather over-ask the operator than silently drop work.

import type { AgentAction } from "@/api/agent-actions";

export type ActionClassification = "actionable" | "informational";

// send_customer_notification templates the operator needs to decide on.
const ACTIONABLE_NOTIFICATION_TEMPLATES = new Set<string>([
  "failed_delivery",
  "delayed",
  "sla_risk_update"
]);

// send_customer_notification templates that are pure FYIs (no human decision).
const INFORMATIONAL_NOTIFICATION_TEMPLATES = new Set<string>([
  "out_for_delivery",
  "reattempt_scheduled"
]);

// Per-type classification. send_customer_notification is handled in the
// function (templateKey-dependent). Unmapped → "actionable" by default.
const TYPE_CLASSIFICATION: Record<string, ActionClassification> = {
  flag_finding: "informational",
  assign_shipment: "actionable",
  reroute_shipment: "actionable",
  flag_sla_risk: "actionable"
};

export type ActionVerbSet = {
  label: string;
  heading: string;
  workingLabel: string;
  successLabel: string;
};

export type ActionVerbs = {
  approve: ActionVerbSet;
  reject: ActionVerbSet;
};

const FALLBACK_VERBS: ActionVerbs = {
  approve: {
    label: "Approve",
    heading: "Approve this action?",
    workingLabel: "Applying…",
    successLabel: "Action completed"
  },
  reject: {
    label: "Reject",
    heading: "Reject this suggestion?",
    workingLabel: "Rejecting…",
    successLabel: "Suggestion rejected"
  }
};

const VERBS_BY_TYPE: Record<string, ActionVerbs> = {
  send_customer_notification: {
    approve: {
      label: "Send now",
      heading: "Send this notification?",
      workingLabel: "Sending…",
      successLabel: "Notification sent"
    },
    reject: {
      label: "Dismiss",
      heading: "Dismiss this notification?",
      workingLabel: "Dismissing…",
      successLabel: "Dismissed"
    }
  },
  assign_shipment: {
    approve: {
      label: "Assign",
      heading: "Assign this driver?",
      workingLabel: "Assigning…",
      successLabel: "Driver assigned"
    },
    reject: {
      label: "Skip",
      heading: "Skip this assignment?",
      workingLabel: "Skipping…",
      successLabel: "Skipped"
    }
  },
  reroute_shipment: {
    approve: {
      label: "Reroute",
      heading: "Reroute this shipment?",
      workingLabel: "Rerouting…",
      successLabel: "Shipment rerouted"
    },
    reject: {
      label: "Skip",
      heading: "Skip this reroute?",
      workingLabel: "Skipping…",
      successLabel: "Skipped"
    }
  }
};

export function classifyAction(action: AgentAction): ActionClassification {
  if (action.type === "send_customer_notification") {
    const tk = (action.payload as { templateKey?: string } | null)?.templateKey;
    if (tk && INFORMATIONAL_NOTIFICATION_TEMPLATES.has(tk)) return "informational";
    if (tk && ACTIONABLE_NOTIFICATION_TEMPLATES.has(tk)) return "actionable";
    // Unknown templateKey → safe default. Better to surface for a human decision
    // than to silently drop a customer-facing message.
    return "actionable";
  }
  return TYPE_CLASSIFICATION[action.type] ?? "actionable";
}

export function verbsForAction(action: AgentAction): ActionVerbs {
  return VERBS_BY_TYPE[action.type] ?? FALLBACK_VERBS;
}
