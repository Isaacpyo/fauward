import { describe, expect, it } from "vitest";

import type { AgentAction } from "@/api/agent-actions";
import { classifyAction, verbsForAction } from "./agent-actions.rules";

function makeAction(overrides: Partial<AgentAction> = {}): AgentAction {
  return {
    id: "act-1",
    tenantId: "t-1",
    runId: null,
    type: "assign_shipment",
    payload: {},
    risk: "requires_approval",
    status: "PENDING_APPROVAL",
    result: null,
    error: null,
    approvedBy: null,
    appliedAt: null,
    createdAt: "2026-05-26T10:00:00Z",
    ...overrides
  } as AgentAction;
}

describe("classifyAction", () => {
  it("flag_finding is informational regardless of payload kind", () => {
    expect(
      classifyAction(makeAction({ type: "flag_finding", payload: { kind: "stuck" } }))
    ).toBe("informational");
    expect(
      classifyAction(makeAction({ type: "flag_finding", payload: { kind: "overloaded_driver" } }))
    ).toBe("informational");
  });

  it.each(["failed_delivery", "delayed", "sla_risk_update"])(
    "send_customer_notification with actionable template '%s' is actionable",
    (templateKey) => {
      expect(
        classifyAction(
          makeAction({ type: "send_customer_notification", payload: { templateKey } })
        )
      ).toBe("actionable");
    }
  );

  it.each(["out_for_delivery", "reattempt_scheduled"])(
    "send_customer_notification with FYI template '%s' is informational",
    (templateKey) => {
      expect(
        classifyAction(
          makeAction({ type: "send_customer_notification", payload: { templateKey } })
        )
      ).toBe("informational");
    }
  );

  it("send_customer_notification with an unknown templateKey defaults to actionable", () => {
    expect(
      classifyAction(
        makeAction({
          type: "send_customer_notification",
          payload: { templateKey: "future_template_we_have_not_seen_yet" }
        })
      )
    ).toBe("actionable");
  });

  it("send_customer_notification with no templateKey defaults to actionable", () => {
    expect(
      classifyAction(makeAction({ type: "send_customer_notification", payload: {} }))
    ).toBe("actionable");
  });

  it.each(["assign_shipment", "reroute_shipment", "flag_sla_risk"])(
    "'%s' is actionable",
    (type) => {
      expect(classifyAction(makeAction({ type }))).toBe("actionable");
    }
  );

  it("unknown action type defaults to actionable (never silently drops)", () => {
    expect(classifyAction(makeAction({ type: "future_unknown_tool" }))).toBe("actionable");
  });
});

describe("verbsForAction", () => {
  it("send_customer_notification returns Send now / Dismiss verbs", () => {
    const v = verbsForAction(makeAction({ type: "send_customer_notification" }));
    expect(v.approve).toEqual({
      label: "Send now",
      heading: "Send this notification?",
      workingLabel: "Sending…",
      successLabel: "Notification sent"
    });
    expect(v.reject).toEqual({
      label: "Dismiss",
      heading: "Dismiss this notification?",
      workingLabel: "Dismissing…",
      successLabel: "Dismissed"
    });
  });

  it("assign_shipment returns Assign / Skip verbs", () => {
    const v = verbsForAction(makeAction({ type: "assign_shipment" }));
    expect(v.approve.label).toBe("Assign");
    expect(v.approve.heading).toBe("Assign this driver?");
    expect(v.approve.workingLabel).toBe("Assigning…");
    expect(v.approve.successLabel).toBe("Driver assigned");
    expect(v.reject.label).toBe("Skip");
    expect(v.reject.heading).toBe("Skip this assignment?");
  });

  it("reroute_shipment returns Reroute / Skip verbs", () => {
    const v = verbsForAction(makeAction({ type: "reroute_shipment" }));
    expect(v.approve.label).toBe("Reroute");
    expect(v.approve.heading).toBe("Reroute this shipment?");
    expect(v.approve.workingLabel).toBe("Rerouting…");
    expect(v.approve.successLabel).toBe("Shipment rerouted");
    expect(v.reject.label).toBe("Skip");
    expect(v.reject.heading).toBe("Skip this reroute?");
  });

  it("unknown action type falls back to generic Approve/Reject verbs", () => {
    const v = verbsForAction(makeAction({ type: "future_unknown_tool" }));
    expect(v.approve.label).toBe("Approve");
    expect(v.approve.heading).toBe("Approve this action?");
    expect(v.approve.workingLabel).toBe("Applying…");
    expect(v.approve.successLabel).toBe("Action completed");
    expect(v.reject.label).toBe("Reject");
    expect(v.reject.heading).toBe("Reject this suggestion?");
    expect(v.reject.successLabel).toBe("Suggestion rejected");
  });

  it("flag_sla_risk (no verb entry) uses fallback verbs", () => {
    const v = verbsForAction(makeAction({ type: "flag_sla_risk" }));
    expect(v.approve.label).toBe("Approve");
    expect(v.reject.label).toBe("Reject");
  });
});
