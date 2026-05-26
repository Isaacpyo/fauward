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
  it("confirm step renders the warning + calls mutate(actionId) on Approve click", async () => {
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

    expect(screen.getByText("Approve this action?")).toBeInTheDocument();
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^Approve$/ }));
    expect(approveState.mutate).toHaveBeenCalledWith("act-1");
  });

  it("working step shows 'Applying…' while the mutation is pending", () => {
    const approveState = idleState();
    approveState.isPending = true;
    hookMocks.useApproveAgentAction.mockReturnValue(approveState);

    render(
      <ActionConfirmDialog action={makeAction()} kind="approve" open onClose={vi.fn()} />
    );

    expect(screen.getByText("Applying…")).toBeInTheDocument();
    expect(screen.getByText(/Executing the agent's action/i)).toBeInTheDocument();
    // Confirm-step buttons are gone during work.
    expect(screen.queryByRole("button", { name: /^Approve$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });

  it.each([
    ["assign_shipment", "Driver assigned"],
    ["reroute_shipment", "Shipment rerouted"],
    ["send_customer_notification", "Customer notified"],
    ["flag_sla_risk", "Risk flagged"],
    ["unknown_tool", "Action completed"]
  ])(
    "success step shows the per-type message (%s → %s) and Done closes the dialog",
    async (type, expected) => {
      const approveState = idleState();
      approveState.isSuccess = true;
      hookMocks.useApproveAgentAction.mockReturnValue(approveState);
      const onClose = vi.fn();

      render(
        <ActionConfirmDialog
          action={makeAction({ type })}
          kind="approve"
          open
          onClose={onClose}
        />
      );

      expect(screen.getByText(expected)).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Done" }));
      expect(onClose).toHaveBeenCalledTimes(1);
    }
  );

  it("failure step shows the honest error message and Try again retries the mutation", async () => {
    const approveState = idleState();
    approveState.isError = true;
    approveState.error = new Error("Action not found");
    hookMocks.useApproveAgentAction.mockReturnValue(approveState);

    render(
      <ActionConfirmDialog
        action={makeAction({ id: "act-fail" })}
        kind="approve"
        open
        onClose={vi.fn()}
      />
    );

    // Never claims success.
    expect(screen.queryByText("Driver assigned")).toBeNull();
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
    expect(screen.getByText(/Couldn't complete this action/i)).toBeInTheDocument();
    expect(screen.getByText("Action not found")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Try again/i }));
    expect(approveState.mutate).toHaveBeenCalledWith("act-fail");
  });
});

describe("ActionConfirmDialog — reject", () => {
  it("calls the reject mutation (not approve) on Reject click", async () => {
    const approveState = idleState();
    const rejectState = idleState();
    hookMocks.useApproveAgentAction.mockReturnValue(approveState);
    hookMocks.useRejectAgentAction.mockReturnValue(rejectState);

    render(
      <ActionConfirmDialog
        action={makeAction({ id: "act-r" })}
        kind="reject"
        open
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("Reject this suggestion?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^Reject$/ }));
    expect(rejectState.mutate).toHaveBeenCalledWith("act-r");
    expect(approveState.mutate).not.toHaveBeenCalled();
  });

  it("success message is 'Rejected' regardless of action type", () => {
    const rejectState = idleState();
    rejectState.isSuccess = true;
    hookMocks.useRejectAgentAction.mockReturnValue(rejectState);

    render(
      <ActionConfirmDialog
        action={makeAction({ type: "assign_shipment" })}
        kind="reject"
        open
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("Rejected")).toBeInTheDocument();
    expect(screen.queryByText("Driver assigned")).toBeNull();
  });
});
