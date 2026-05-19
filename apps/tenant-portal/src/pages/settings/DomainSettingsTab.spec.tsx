import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hookMocks = vi.hoisted(() => ({
  useDomainStatus: vi.fn(),
  setDomainMutate: vi.fn(),
  removeDomainMutate: vi.fn()
}));

vi.mock("@/api/domain", () => ({
  useDomainStatus: hookMocks.useDomainStatus,
  useSetDomain: () => ({ mutate: hookMocks.setDomainMutate, isPending: false }),
  useRemoveDomain: () => ({ mutate: hookMocks.removeDomainMutate, isPending: false })
}));

import { DomainSettingsTab } from "./DomainSettingsTab";

function statusQuery(data: Record<string, unknown>) {
  return {
    data,
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn()
  };
}

describe("DomainSettingsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the empty add-domain state", async () => {
    hookMocks.useDomainStatus.mockReturnValue(statusQuery({
      status: "NONE",
      domain: null,
      instructions: null,
      error: null,
      verifiedAt: null,
      lastCheckAt: null
    }));

    render(<DomainSettingsTab />);

    expect(screen.getByText("Add a custom domain")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Custom domain"), "track.example.com");
    await userEvent.click(screen.getByRole("button", { name: /add domain/i }));
    expect(hookMocks.setDomainMutate).toHaveBeenCalledWith("track.example.com", expect.anything());
  });

  it("renders pending DNS instructions and status badge", () => {
    hookMocks.useDomainStatus.mockReturnValue(statusQuery({
      status: "PENDING_DNS",
      domain: "track.example.com",
      instructions: { type: "CNAME", name: "track", host: "track.example.com", value: "cname.vercel-dns-0.com", ttl: 3600 },
      records: [
        { type: "CNAME", name: "track", host: "track.example.com", value: "cname.vercel-dns-0.com", ttl: 3600 },
        {
          type: "TXT",
          name: "_vercel",
          host: "_vercel.example.com",
          value: "vc-domain-verify=track.example.com,abc123",
          ttl: 3600
        }
      ],
      error: null,
      verifiedAt: null,
      lastCheckAt: null
    }));

    render(<DomainSettingsTab />);

    expect(screen.getByText("CNAME")).toBeInTheDocument();
    expect(screen.getByText("TXT")).toBeInTheDocument();
    expect(screen.getByText("_vercel")).toBeInTheDocument();
    expect(screen.getByText("cname.vercel-dns-0.com")).toBeInTheDocument();
    expect(screen.getByText("vc-domain-verify=track.example.com,abc123")).toBeInTheDocument();
    expect(screen.getByTestId("domain-status-badge")).toHaveTextContent("Pending DNS");
  });

  it("opens a confirmation dialog before removing an active domain", async () => {
    hookMocks.useDomainStatus.mockReturnValue(statusQuery({
      status: "ACTIVE",
      domain: "track.example.com",
      instructions: { type: "CNAME", name: "track", host: "track.example.com", value: "cname.vercel-dns-0.com", ttl: 3600 },
      error: null,
      verifiedAt: "2026-05-18T10:00:00.000Z",
      lastCheckAt: "2026-05-18T10:00:00.000Z"
    }));

    render(<DomainSettingsTab />);

    await userEvent.click(screen.getByRole("button", { name: /remove domain/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    const confirmButton = screen.getByRole("button", { name: /remove domain/i });
    expect(confirmButton).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/type track\.example\.com to confirm/i), "track.example.com");
    expect(confirmButton).toBeEnabled();
    await userEvent.click(confirmButton);
    expect(hookMocks.removeDomainMutate).toHaveBeenCalledWith(undefined, expect.anything());
  });

  it("renders failed status with retry", async () => {
    const refetch = vi.fn();
    hookMocks.useDomainStatus.mockReturnValue({
      ...statusQuery({
        status: "FAILED",
        domain: "track.example.com",
        instructions: null,
        error: "Unable to verify the domain with Vercel right now.",
        verifiedAt: null,
        lastCheckAt: null
      }),
      refetch
    });

    render(<DomainSettingsTab />);

    expect(screen.getByText(/Unable to verify/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalled();
  });
});
