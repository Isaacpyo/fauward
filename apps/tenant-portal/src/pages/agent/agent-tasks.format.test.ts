import { describe, expect, it } from "vitest";

import type { AgentAction } from "@/api/agent-actions";
import { actionSummary, actionTitle } from "./agent-tasks.format";

function makeAction(overrides: Partial<AgentAction> = {}): AgentAction {
  return {
    id: "act-1",
    tenantId: "t-1",
    runId: null,
    type: "flag_finding",
    payload: {},
    risk: "auto_approved",
    status: "AUTO_APPLIED",
    result: null,
    error: null,
    approvedBy: null,
    appliedAt: null,
    createdAt: "2026-05-25T10:00:00Z",
    ...overrides
  };
}

describe("actionTitle", () => {
  it("returns kind-specific titles for flag_finding rows", () => {
    expect(actionTitle(makeAction({ payload: { kind: "unassigned" } }))).toBe("Unassigned shipment");
    expect(actionTitle(makeAction({ payload: { kind: "overloaded_driver" } }))).toBe("Driver overloaded");
    expect(actionTitle(makeAction({ payload: { kind: "past_deadline" } }))).toBe("Past deadline");
    expect(actionTitle(makeAction({ payload: { kind: "failed_unhandled" } }))).toBe("Failed delivery");
    expect(actionTitle(makeAction({ payload: { kind: "stuck" } }))).toBe("Stuck shipment");
  });

  it("falls back to a humanised type for known tool calls", () => {
    expect(actionTitle(makeAction({ type: "reroute_shipment" }))).toBe("Reroute shipment");
    expect(actionTitle(makeAction({ type: "assign_shipment" }))).toBe("Assign shipment");
  });
});

describe("actionSummary — flag_finding rows carry the identifier", () => {
  it("unassigned: includes the FULL tracking number (no truncation) and is not 'Flag finding'", () => {
    const summary = actionSummary(
      makeAction({
        payload: { kind: "unassigned", trackingNumber: "TR-12345", shipmentId: "ship-abc", status: "PENDING" }
      })
    );
    expect(summary).toContain("#TR-12345");
    // Truncation marker should not appear — TR codes render in full.
    expect(summary).not.toContain("…");
    expect(summary.toLowerCase()).toContain("no driver");
    expect(summary).not.toBe("Flag finding");
  });

  it("unassigned: falls back to last-6 of shipmentId when no tracking number is present", () => {
    const summary = actionSummary(
      makeAction({
        payload: { kind: "unassigned", shipmentId: "c1000abc123456ghi789", status: "PENDING" }
      })
    );
    // Last 6 of the cuid — distinguishes far better than the first 8 (cuids share a prefix).
    expect(summary).toContain("#ghi789");
    expect(summary.toLowerCase()).toContain("no driver");
  });

  it("overloaded_driver: names the driver and job count", () => {
    const summary = actionSummary(
      makeAction({
        payload: { kind: "overloaded_driver", driverName: "Ade Onifade", activeJobCount: 12 }
      })
    );
    expect(summary).toContain("Ade Onifade");
    expect(summary).toContain("12");
  });

  it("failed_unhandled: includes the tracking number", () => {
    const summary = actionSummary(
      makeAction({
        payload: {
          kind: "failed_unhandled",
          trackingNumber: "TR-XYZ",
          shipmentId: "s1",
          failedAt: "2026-05-20T12:00:00Z"
        }
      })
    );
    expect(summary).toContain("TR-XYZ");
    expect(summary.toLowerCase()).toContain("failed");
  });

  it("past_deadline: mentions the shipment ref and 'past'", () => {
    const summary = actionSummary(
      makeAction({
        payload: {
          kind: "past_deadline",
          trackingNumber: "TR-LATE",
          shipmentId: "s1",
          estimatedDelivery: "2026-05-01T00:00:00Z"
        }
      })
    );
    expect(summary).toContain("TR-LATE");
    expect(summary.toLowerCase()).toContain("past");
  });

  it("stuck: mentions the shipment ref and 'stalled'", () => {
    const summary = actionSummary(
      makeAction({
        payload: { kind: "stuck", trackingNumber: "TR-STK", shipmentId: "s1", exceptionCaseId: "ec-1" }
      })
    );
    expect(summary).toContain("TR-STK");
    expect(summary.toLowerCase()).toContain("stall");
  });
});

describe("actionSummary — tool-call rows describe the proposed action", () => {
  it("assign_shipment carries the reason from the payload", () => {
    const summary = actionSummary(
      makeAction({
        type: "assign_shipment",
        payload: { shipmentId: "ship-abc123def", driverId: "drv-xyz789ghi", reason: "Lightest active load" }
      })
    );
    expect(summary).toContain("Assign shipment");
    expect(summary).toContain("Lightest active load");
  });

  it("send_customer_notification mentions the template key", () => {
    const summary = actionSummary(
      makeAction({
        type: "send_customer_notification",
        payload: { shipmentId: "ship-abc123", channel: "email", templateKey: "failed_delivery" }
      })
    );
    expect(summary).toContain("email notification");
    expect(summary).toContain("failed delivery");
  });
});
