import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// L1 tenant touchpoints (WP-2.3): Help → Contact Fauward and "Escalate to Fauward" on a customer ticket.

const get = vi.fn();
const post = vi.fn();
vi.mock("@/lib/api", () => ({ api: { get: (...args: unknown[]) => get(...args), post: (...args: unknown[]) => post(...args), patch: vi.fn() } }));

import { HelpTicketsPage } from "./HelpTicketsPage";
import { HelpTicketDetailPage } from "./HelpTicketDetailPage";
import { TicketDetailPage } from "@/pages/support/TicketDetailPage";
import { useAppStore } from "@/stores/useAppStore";

function renderAt(node: ReactNode, path: string, routePath: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={routePath} element={node} />
          <Route path="/help/tickets/:id" element={<p>ticket page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const ticket = { id: "tkt_1", ticketNumber: "NORTHWIND-FWD-202610-0001", subject: "Labels print blank", category: "OTHER", priority: "NORMAL", status: "OPEN", lastMessageAt: "2026-10-18T09:00:00.000Z", lastMessageAuthorType: "STAFF", awaitingYou: true, linkedTicketId: null, createdAt: "2026-10-18T08:00:00.000Z", updatedAt: "2026-10-18T09:00:00.000Z", resolvedAt: null };

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  useAppStore.setState({ user: { id: "u_admin", full_name: "Ada Admin", email: "admin@northwind.test", role: "TENANT_ADMIN", plan: "pro" } });
});

describe("Contact Fauward (L1)", () => {
  it("ACC-L1-1 lists requests and flags the ones Fauward answered", async () => {
    get.mockResolvedValue({ data: { tickets: [ticket] } });
    renderAt(<HelpTicketsPage />, "/help/tickets", "/help/tickets");
    const row = await screen.findByTestId("fauward-ticket-row");
    expect(row).toHaveTextContent("Labels print blank");
    expect(row).toHaveTextContent("Fauward replied");
    expect(get).toHaveBeenCalledWith("/v1/tenants/me/fauward-tickets");
  });

  it("ACC-SUP-1 a new request posts subject, topic, priority and details, then opens the ticket", async () => {
    get.mockResolvedValue({ data: { tickets: [] } });
    post.mockResolvedValue({ data: { ticket: { ...ticket, id: "tkt_new" } } });
    renderAt(<HelpTicketsPage />, "/help/tickets", "/help/tickets");
    fireEvent.click((await screen.findAllByRole("button", { name: "New request" }))[0]);
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Invoice shows the wrong plan" } });
    fireEvent.change(screen.getByLabelText("Details"), { target: { value: "Our October invoice charges PRO but we are on STARTER." } });
    fireEvent.click(screen.getByRole("button", { name: "Send to Fauward" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/v1/tenants/me/fauward-tickets", { subject: "Invoice shows the wrong plan", category: "OTHER", priority: "NORMAL", body: "Our October invoice charges PRO but we are on STARTER." }));
    expect(await screen.findByText("ticket page")).toBeInTheDocument();
  });

  it("ACC-SUP-2 the thread shows Fauward replies as Fauward Support and a reply is posted", async () => {
    get.mockResolvedValue({
      data: {
        ticket: { ...ticket, linkedTicket: null },
        messages: [
          { id: "m1", authorType: "TENANT_USER", authorLabel: "Ada Admin", visibility: "PUBLIC", body: "Every label prints blank.", createdAt: "2026-10-18T08:00:00.000Z" },
          { id: "m2", authorType: "STAFF", authorLabel: "Fauward Support", visibility: "PUBLIC", body: "We are deploying a fix.", createdAt: "2026-10-18T09:00:00.000Z" }
        ]
      }
    });
    post.mockResolvedValue({ data: { id: "m3" } });
    renderAt(<HelpTicketDetailPage />, "/help/tickets/tkt_1", "/help/tickets/:id");
    const messages = await screen.findAllByTestId("fauward-ticket-message");
    expect(messages[1]).toHaveTextContent("Fauward Support");
    fireEvent.change(screen.getByLabelText("Reply to Fauward Support"), { target: { value: "Thanks, still blank here." } });
    fireEvent.click(screen.getByRole("button", { name: "Send reply" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/v1/tenants/me/fauward-tickets/tkt_1/messages", { body: "Thanks, still blank here." }));
  });

  it("ACC-SUP-5 an admin escalates a customer ticket to Fauward with a reason", async () => {
    get.mockResolvedValue({
      data: { id: "c_1", ticketNumber: "NORTHWIND-TKT-202610-0007", subject: "Charged twice", status: "OPEN", priority: "HIGH", category: "PAYMENT_ISSUE", linkedTicket: null, messages: [{ id: "x", body: "Two charges.", visibility: "PUBLIC", authorType: "END_CUSTOMER", authorLabel: "Bea Buyer", createdAt: "2026-10-18T08:00:00.000Z" }] }
    });
    post.mockResolvedValue({ data: { ticket: { id: "tkt_9", ticketNumber: "NORTHWIND-FWD-202610-0002" } } });
    renderAt(<TicketDetailPage />, "/support/c_1", "/support/:id");
    fireEvent.click(await screen.findByRole("button", { name: "Escalate to Fauward" }));
    fireEvent.change(screen.getByLabelText("Why does Fauward need to step in?"), { target: { value: "The gateway captured the payment twice." } });
    fireEvent.click(screen.getByRole("button", { name: "Escalate" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/v1/support/tickets/c_1/escalate-to-fauward", { reason: "The gateway captured the payment twice." }));
  });

  it("an escalated ticket links to the Fauward request instead of offering escalation again", async () => {
    get.mockResolvedValue({
      data: { id: "c_1", ticketNumber: "NORTHWIND-TKT-202610-0007", subject: "Charged twice", status: "OPEN", priority: "HIGH", category: "PAYMENT_ISSUE", linkedTicket: { id: "tkt_9", ticketNumber: "NORTHWIND-FWD-202610-0002", status: "OPEN" }, messages: [] }
    });
    renderAt(<TicketDetailPage />, "/support/c_1", "/support/:id");
    expect(await screen.findByRole("link", { name: "NORTHWIND-FWD-202610-0002" })).toHaveAttribute("href", "/help/tickets/tkt_9");
    expect(screen.queryByRole("button", { name: "Escalate to Fauward" })).not.toBeInTheDocument();
  });
});
