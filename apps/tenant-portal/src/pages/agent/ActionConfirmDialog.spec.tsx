import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentAction } from "@/api/agent-actions";

const hookMocks = vi.hoisted(() => ({
  useApproveAgentAction: vi.fn(),
  useRejectAgentAction: vi.fn()
}));

vi.mock("@/api/agent-actions", () => ({
  useApproveAgentAction: hookMocks.useApproveAgentAction,
  useRejectAgentAction: hookMocks.useRejectAgentAction
}));

import { ActionConfirmDialog } from "./ActionConfirmDialog";

type MutationState = {
  mutate: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn>;
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  error: Error | null;
};

function idleState(): MutationState {
  return {
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
    error: null
  };
}

function makeAction(overrides: Partial<AgentAction> = {}): AgentAction {
  return {
    id: "act-1",
    tenantId: "t-1",
    runId: null,
    type: "assign_shipment",
    payload: { shipmentId: "ship-1" },
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

beforeEach(() => {
  vi.clearAllMocks();
  hookMocks.useApproveAgentAction.mockReturnValue(idleState());
  hookMocks.useRejectAgentAction.mockReturnValue(idleState());
});

describe("ActionConfirmDialog — approve", () => {
  it("confirm step renders the warning + calls mutate(actionId) on primary click", async () => {
    const approveState = idleState();
    hookMocks.useApproveAgentAction.mockReturnValue(approveState);

    render(
      <ActionConfirmDialog
        action={makeAction({ id: "act-1", type: "assign_shipment" })}
        kind="approve"
        open
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("Assign this driver?")).toBeInTheDocument();
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^Assign$/ }));
    expect(approveState.mutate).toHaveBeenCalledWith("act-1");
  });

  it("working step shows the per-type working label while the mutation is pending", () => {
    const approveState = idleState();
    approveState.isPending = true;
    hookMocks.useApproveAgentAction.mockReturnValue(approveState);

    render(
      <ActionConfirmDialog action={makeAction()} kind="approve" open onClose={vi.fn()} />
    );

    expect(screen.getByText("Assigning…")).toBeInTheDocument();
    // Confirm-step buttons are gone during work.
    expect(screen.queryByRole("button", { name: /^Assign$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });

  it.each([
    [
      "assign_shipment",
      undefined,
      "Assign this driver?",
      "Assign",
      "Assigning…",
      "Driver assigned"
    ],
    [
      "reroute_shipment",
      undefined,
      "Reroute this shipment?",
      "Reroute",
      "Rerouting…",
      "Shipment rerouted"
    ],
    [
      "send_customer_notification",
      "failed_delivery",
      "Send this notification?",
      "Send now",
      "Sending…",
      "Notification sent"
    ],
    [
      "unknown_tool",
      undefined,
      "Approve this action?",
      "Approve",
      "Applying…",
      "Action completed"
    ]
  ])(
    "approve verbs: %s — heading=%s primary=%s working=%s success=%s",
    async (type, templateKey, heading, primary, working, success) => {
      const payload: Record<string, unknown> = { shipmentId: "ship-1" };
      if (templateKey) payload.templateKey = templateKey;

      // Confirm step — heading + primary button label.
      hookMocks.useApproveAgentAction.mockReturnValue(idleState());
      const { unmount: u1 } = render(
        <ActionConfirmDialog
          action={makeAction({ type, payload })}
          kind="approve"
          open
          onClose={vi.fn()}
        />
      );
      expect(screen.getByText(heading)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: new RegExp(`^${primary}$`) })).toBeInTheDocument();
      u1();

      // Working step.
      const pending = idleState();
      pending.isPending = true;
      hookMocks.useApproveAgentAction.mockReturnValue(pending);
      const { unmount: u2 } = render(
        <ActionConfirmDialog
          action={makeAction({ type, payload })}
          kind="approve"
          open
          onClose={vi.fn()}
        />
      );
      expect(screen.getByText(working)).toBeInTheDocument();
      u2();

      // Success step.
      const ok = idleState();
      ok.isSuccess = true;
      hookMocks.useApproveAgentAction.mockReturnValue(ok);
      render(
        <ActionConfirmDialog
          action={makeAction({ type, payload })}
          kind="approve"
          open
          onClose={vi.fn()}
        />
      );
      expect(screen.getByText(success)).toBeInTheDocument();
    }
  );

  it("Done closes the dialog after a success", async () => {
    const ok = idleState();
    ok.isSuccess = true;
    hookMocks.useApproveAgentAction.mockReturnValue(ok);
    const onClose = vi.fn();
    render(
      <ActionConfirmDialog
        action={makeAction({ type: "assign_shipment" })}
        kind="approve"
        open
        onClose={onClose}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("failure step shows the honest error message and Try again retries the mutation", async () => {
    const approveState = idleState();
    approveState.isError = true;
    approveState.error = new Error("Action not found");
    hookMocks.useApproveAgentAction.mockReturnValue(approveState);

    render(
      <ActionConfirmDialog
        action={makeAction({ id: "act-fail", type: "assign_shipment" })}
        kind="approve"
        open
        onClose={vi.fn()}
      />
    );

    // Never claims success.
    expect(screen.queryByText("Driver assigned")).toBeNull();
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
    expect(screen.getByText(/Couldn't complete — please try again/i)).toBeInTheDocument();
    expect(screen.getByText("Action not found")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Try again/i }));
    expect(approveState.mutate).toHaveBeenCalledWith("act-fail");
  });
});

describe("ActionConfirmDialog — reject", () => {
  it("calls the reject mutation (not approve) on the per-type secondary click", async () => {
    const approveState = idleState();
    const rejectState = idleState();
    hookMocks.useApproveAgentAction.mockReturnValue(approveState);
    hookMocks.useRejectAgentAction.mockReturnValue(rejectState);

    render(
      <ActionConfirmDialog
        action={makeAction({ id: "act-r", type: "assign_shipment" })}
        kind="reject"
        open
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("Skip this assignment?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^Skip$/ }));
    expect(rejectState.mutate).toHaveBeenCalledWith("act-r");
    expect(approveState.mutate).not.toHaveBeenCalled();
  });

  it.each([
    [
      "send_customer_notification",
      "failed_delivery",
      "Dismiss this notification?",
      "Dismiss",
      "Dismissing…",
      "Dismissed"
    ],
    [
      "reroute_shipment",
      undefined,
      "Skip this reroute?",
      "Skip",
      "Skipping…",
      "Skipped"
    ],
    [
      "unknown_tool",
      undefined,
      "Reject this suggestion?",
      "Reject",
      "Rejecting…",
      "Suggestion rejected"
    ]
  ])(
    "reject verbs: %s — heading=%s primary=%s working=%s success=%s",
    (type, templateKey, heading, primary, working, success) => {
      const payload: Record<string, unknown> = { shipmentId: "ship-1" };
      if (templateKey) payload.templateKey = templateKey;

      hookMocks.useRejectAgentAction.mockReturnValue(idleState());
      const { unmount: u1 } = render(
        <ActionConfirmDialog
          action={makeAction({ type, payload })}
          kind="reject"
          open
          onClose={vi.fn()}
        />
      );
      expect(screen.getByText(heading)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: new RegExp(`^${primary}$`) })).toBeInTheDocument();
      u1();

      const pending = idleState();
      pending.isPending = true;
      hookMocks.useRejectAgentAction.mockReturnValue(pending);
      const { unmount: u2 } = render(
        <ActionConfirmDialog
          action={makeAction({ type, payload })}
          kind="reject"
          open
          onClose={vi.fn()}
        />
      );
      expect(screen.getByText(working)).toBeInTheDocument();
      u2();

      const ok = idleState();
      ok.isSuccess = true;
      hookMocks.useRejectAgentAction.mockReturnValue(ok);
      render(
        <ActionConfirmDialog
          action={makeAction({ type, payload })}
          kind="reject"
          open
          onClose={vi.fn()}
        />
      );
      expect(screen.getByText(success)).toBeInTheDocument();
    }
  );
});
