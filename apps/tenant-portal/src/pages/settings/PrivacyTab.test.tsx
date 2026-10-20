import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
const post = vi.fn();
vi.mock("@/lib/api", () => ({ api: { get: (...args: unknown[]) => get(...args), post: (...args: unknown[]) => post(...args) } }));

import { PrivacyTab } from "./PrivacyTab";

function renderTab(path = "/settings?tab=privacy") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <PrivacyTab />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const ready = {
  id: "dsar_1",
  requestType: "ACCESS",
  subjectEmail: "alice@example.com",
  status: "DELIVERED",
  statusLabel: "Ready to download",
  dueAt: "2026-11-17T09:00:00.000Z",
  createdAt: "2026-10-18T09:00:00.000Z",
  erasureCompletedAt: null,
  download: { available: true, expiresAt: "2026-10-25T09:00:00.000Z", downloadedAt: null }
};

beforeEach(() => {
  get.mockReset();
  post.mockReset();
});

describe("PrivacyTab (trust.compliance tenant touchpoint)", () => {
  it("ACC-DSAR-1 files an ERASURE request for a data subject", async () => {
    get.mockResolvedValue({ data: { requests: [] } });
    post.mockResolvedValue({ data: {} });
    renderTab();
    expect(await screen.findByText("No privacy requests yet.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Request type"), { target: { value: "ERASURE" } });
    fireEvent.change(screen.getByLabelText("Data subject email"), { target: { value: "alice@example.com" } });
    fireEvent.change(screen.getByLabelText("Request details"), { target: { value: "Alice asked us by email to delete her account." } });
    fireEvent.click(screen.getByRole("button", { name: "Submit request" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/v1/tenants/me/dsar", expect.objectContaining({ requestType: "ERASURE", subjectEmail: "alice@example.com" })));
  });

  it("ACC-DSAR-3 downloads only with the token from Fauward's link, through the authenticated API", async () => {
    get.mockImplementation(async (url: string) => (url.endsWith("/download") ? { data: new Blob(["{}"], { type: "application/json" }) } : { data: { requests: [ready] } }));
    const createObjectURL = vi.fn(() => "blob:dsar");
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    renderTab("/settings?tab=privacy&dsar=dsar_1&token=tok_abcdefghijklmnopqrstuvwxyz");
    fireEvent.click(await screen.findByRole("button", { name: "Download" }));
    await waitFor(() => expect(get).toHaveBeenCalledWith("/v1/tenants/me/dsar/dsar_1/download", { params: { token: "tok_abcdefghijklmnopqrstuvwxyz" }, responseType: "blob" }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    click.mockRestore();
  });

  it("without the link the row says where the download comes from; a refused download shows the API error", async () => {
    get.mockResolvedValue({ data: { requests: [ready] } });
    const first = renderTab();
    expect(await screen.findByText("Open the download link Fauward sent you")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download" })).toBeNull();
    first.unmount();

    get.mockImplementation(async (url: string) => {
      if (url.endsWith("/download")) throw Object.assign(new Error("Request failed"), { isAxiosError: true, response: { status: 403, data: { error: "TOKEN_INVALID", message: "This download link is not valid or was already used." } } });
      return { data: { requests: [ready] } };
    });
    renderTab("/settings?tab=privacy&dsar=dsar_1&token=tok_used_aaaaaaaaaaaaaaaaaaaaa");
    fireEvent.click(await screen.findByRole("button", { name: "Download" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This download link is not valid or was already used.");
  });
});
