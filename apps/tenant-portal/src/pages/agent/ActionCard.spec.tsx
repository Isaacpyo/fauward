import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AgentAction } from "@/api/agent-actions";
import { ActionCard } from "./AgentTasksPage";

function makeAction(overrides: Partial<AgentAction> = {}): AgentAction {
  return {
    id: "act-1",
    tenantId: "t-1",
    runId: null,
    type: "send_customer_notification",
    payload: { templateKey: "failed_delivery", shipmentId: "ship-1" },
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

describe("ActionCard — informational rows have no buttons", () => {
  it("flag_finding row shows FYI pill and renders no action buttons", () => {
    render(
      <ActionCard
        action={makeAction({
          type: "flag_finding",
          payload: { kind: "stuck", shipmentId: "ship-1" },
          status: "AUTO_APPLIED",
          risk: "auto_approved"
        })}
        showActions
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );

    expect(screen.getByText("FYI")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("FYI notification template (out_for_delivery) hides buttons even when showActions is true", () => {
    render(
      <ActionCard
        action={makeAction({
          type: "send_customer_notification",
          payload: { templateKey: "out_for_delivery" }
        })}
        showActions
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );

    expect(screen.getByText("FYI")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Send now$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Dismiss$/ })).toBeNull();
  });
});

describe("ActionCard — actionable rows show per-action verbs", () => {
  it("send_customer_notification (failed_delivery) shows 'Send now' and 'Dismiss'", async () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    render(
      <ActionCard
        action={makeAction({
          type: "send_customer_notification",
          payload: { templateKey: "failed_delivery" }
        })}
        showActions
        onApprove={onApprove}
        onReject={onReject}
      />
    );

    const send = screen.getByRole("button", { name: /^Send now$/ });
    const dismiss = screen.getByRole("button", { name: /^Dismiss$/ });
    expect(screen.queryByText("FYI")).toBeNull();

    await userEvent.click(send);
    expect(onApprove).toHaveBeenCalledTimes(1);

    await userEvent.click(dismiss);
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it("assign_shipment shows 'Assign' and 'Skip'", () => {
    render(
      <ActionCard
        action={makeAction({ type: "assign_shipment", payload: { shipmentId: "ship-1" } })}
        showActions
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /^Assign$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Skip$/ })).toBeInTheDocument();
  });

  it("unknown action type falls back to 'Approve' and 'Reject'", () => {
    render(
      <ActionCard
        action={makeAction({ type: "future_unknown_tool", payload: {} })}
        showActions
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /^Approve$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Reject$/ })).toBeInTheDocument();
  });
});

describe("ActionCard — archival rows never show buttons", () => {
  it("APPLIED action shows no buttons regardless of classification", () => {
    render(
      <ActionCard
        action={makeAction({ type: "assign_shipment", status: "APPLIED" })}
        showActions={false}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("showActions=true but status=APPLIED still hides buttons (status gate)", () => {
    render(
      <ActionCard
        action={makeAction({ type: "assign_shipment", status: "APPLIED" })}
        showActions
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    expect(screen.queryByRole("button")).toBeNull();
  });
});
