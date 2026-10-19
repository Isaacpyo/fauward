import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const get = vi.fn();
const post = vi.fn();
vi.mock("@/lib/api", () => ({ api: { get: (...args: unknown[]) => get(...args), post: (...args: unknown[]) => post(...args) } }));

import { OnboardingPage } from "./OnboardingPage";

describe("onboarding checklist (L7, WP-2.17)", () => {
  it("ACC-L7-1 shows the server checklist with links to the real actions; nothing on the page marks a step", async () => {
    get.mockResolvedValue({
      data: {
        completedAt: null,
        signedUpAt: "2026-10-01T00:00:00.000Z",
        nextStep: "GATEWAY_VERIFIED",
        steps: [
          { step: "BRANDING_SET", label: "Brand your workspace", required: true, doneAt: "2026-10-02T09:00:00.000Z", actionPath: "/settings?tab=branding" },
          { step: "GATEWAY_VERIFIED", label: "Connect and verify a payment method", required: true, doneAt: null, actionPath: "/settings?tab=integrations" },
          { step: "FIRST_SHIPMENT", label: "Create your first shipment", required: true, doneAt: null, actionPath: "/shipments/create" },
          { step: "TEAMMATE_JOINED", label: "A teammate accepts an invite and signs in", required: true, doneAt: null, actionPath: "/team" },
          { step: "DOMAIN_VERIFIED", label: "Verify a custom domain", required: false, doneAt: null, actionPath: "/settings?tab=domain" },
          { step: "FIRST_PAID_INVOICE", label: "Get your first invoice paid", required: false, doneAt: null, actionPath: "/finance?tab=invoices" }
        ]
      }
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <OnboardingPage />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(await screen.findByTestId("onboarding-progress")).toHaveTextContent("1 of 4 required steps done.");
    const steps = screen.getAllByTestId("onboarding-step");
    expect(within(steps[0]).queryByRole("link")).toBeNull();
    expect(within(steps[2]).getByRole("link", { name: "Do this now" })).toHaveAttribute("href", "/shipments/create");
    expect(screen.queryByRole("button", { name: /continue|next|complete/i })).toBeNull();
    expect(get).toHaveBeenCalledWith("/v1/onboarding/checklist");
    expect(post).not.toHaveBeenCalled();
  });
});
