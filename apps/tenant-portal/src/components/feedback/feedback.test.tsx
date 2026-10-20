import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
const post = vi.fn();
vi.mock("@/lib/api", () => ({ api: { get: (...args: unknown[]) => get(...args), post: (...args: unknown[]) => post(...args) } }));
vi.mock("@/hooks/useEntitlements", () => ({ useFeatureAccess: () => ({ hasFeature: () => false, hasPlan: () => false }) }));

import { PlanGate } from "@/components/shared/PlanGate";
import { MyFeedbackPage } from "@/pages/help/MyFeedbackPage";
import { NpsPrompt } from "./NpsPrompt";

function renderWithClient(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
});

describe("feedback touchpoints (WP-2.8)", () => {
  it("ACC-FB-1 a locked PlanGate files a FEATURE_REQUEST with the feature key", async () => {
    post.mockResolvedValue({ data: { item: { id: "fb_1" } } });
    renderWithClient(
      <PlanGate minimumPlan="pro" feature="apiAccess">
        <p>API keys</p>
      </PlanGate>
    );
    expect(screen.getByTestId("plan-gate-locked")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Request this feature" }));
    expect(screen.getByLabelText("Title")).toHaveValue("Access to api access");
    fireEvent.change(screen.getByLabelText("Details"), { target: { value: "One read-only integration with our ERP." } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/v1/tenants/me/feedback", { type: "FEATURE_REQUEST", source: "PLAN_GATE", title: "Access to api access", body: "One read-only integration with our ERP.", featureKey: "apiAccess" })
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Fauward has your request");
  });

  it("ACC-FB-3 an eligible user sees the survey, reports it shown and sends a score", async () => {
    get.mockResolvedValue({ data: { eligible: true } });
    post.mockResolvedValue({ data: { item: { id: "fb_2" } } });
    renderWithClient(<NpsPrompt enabled />);
    expect(await screen.findByText("How likely are you to recommend Fauward to a colleague?")).toBeInTheDocument();
    await waitFor(() => expect(post).toHaveBeenCalledWith("/v1/tenants/me/nps-prompt", { event: "SHOWN" }));
    fireEvent.click(screen.getByRole("radio", { name: "9" }));
    fireEvent.change(screen.getByLabelText("What is the main reason for your score?"), { target: { value: "The tracking page" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/v1/tenants/me/feedback", { type: "NPS", source: "IN_APP_SURVEY", score: 9, body: "The tracking page" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Thanks for the feedback");
  });

  it("ACC-FB-4 'Not now' dismisses the survey; an ineligible user never sees it", async () => {
    get.mockResolvedValueOnce({ data: { eligible: true } }).mockResolvedValue({ data: { eligible: false } });
    post.mockResolvedValue({ data: {} });
    const first = renderWithClient(<NpsPrompt enabled />);
    fireEvent.click(await screen.findByRole("button", { name: "Not now" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/v1/tenants/me/nps-prompt", { event: "DISMISSED" }));
    await waitFor(() => expect(screen.queryByText("How likely are you to recommend Fauward to a colleague?")).toBeNull());
    first.unmount();
    renderWithClient(<NpsPrompt enabled />);
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  it("ACC-L12-2 My feedback shows each request's status and Fauward's visible replies", async () => {
    get.mockResolvedValue({
      data: { items: [{ id: "fb_1", type: "FEATURE_REQUEST", title: "API access on Starter", body: null, featureKey: "apiAccess", source: "PLAN_GATE", status: "PLANNED", createdAt: "2026-10-19T09:00:00.000Z", comments: [{ id: "c1", authorType: "STAFF", body: "Scheduled for the November release.", createdAt: "2026-10-19T10:00:00.000Z" }] }] }
    });
    renderWithClient(<MyFeedbackPage />);
    const row = await screen.findByTestId("my-feedback");
    expect(row).toHaveTextContent("planned");
    expect(row).toHaveTextContent("Scheduled for the November release.");
  });
});
