import { describe, expect, it, vi } from "vitest";

const mockGet = vi.fn();
const mockPost = vi.fn();

vi.mock("@/lib/api", () => {
  return {
    api: {
      get: (...args: any[]) => mockGet(...args),
      post: (...args: any[]) => mockPost(...args)
    }
  };
});

import {
  fetchAgentActions,
  approveAgentAction,
  rejectAgentAction
} from "./agent-actions";

describe("agent-actions API", () => {
  it("fetchAgentActions fetches pending actions with correct params", async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        items: [
          { id: "act-1", type: "reroute_shipment", status: "PENDING_APPROVAL", payload: { shipmentId: "ship-1" }, createdAt: "2026-05-25T10:00:00Z" }
        ],
        page: 1,
        limit: 20,
        total: 1,
        pages: 1
      }
    });

    const result = await fetchAgentActions("PENDING_APPROVAL", 1, 20);

    expect(mockGet).toHaveBeenCalledWith("/v1/agent/actions", {
      params: { status: "PENDING_APPROVAL", page: 1, limit: 20 }
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].type).toBe("reroute_shipment");
  });

  it("approveAgentAction calls the approve endpoint", async () => {
    mockPost.mockResolvedValueOnce({ data: { success: true } });

    const result = await approveAgentAction("act-1");

    expect(mockPost).toHaveBeenCalledWith("/v1/agent/actions/act-1/approve");
    expect(result.success).toBe(true);
  });

  it("rejectAgentAction calls the reject endpoint", async () => {
    mockPost.mockResolvedValueOnce({ data: { success: true } });

    const result = await rejectAgentAction("act-1");

    expect(mockPost).toHaveBeenCalledWith("/v1/agent/actions/act-1/reject");
    expect(result.success).toBe(true);
  });
});
