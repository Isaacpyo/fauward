import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
const patch = vi.fn();
vi.mock("@/lib/api", () => ({ api: { get: (...args: unknown[]) => get(...args), patch: (...args: unknown[]) => patch(...args) } }));

import { useAppStore } from "@/stores/useAppStore";
import type { User } from "@/types/domain";
import { StaffAccessActiveBanner, StaffAccessEmailSetting } from "./StaffAccess";

function renderAs(role: User["role"], node: React.ReactNode, extra: Partial<User> = {}) {
  useAppStore.setState({ user: { id: "u_1", full_name: "Ada Owner", email: "owner@northwind.test", role, plan: "pro", ...extra } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>
  );
}

const active = { id: "imp_2", staffName: "Sam Support", reason: "Investigating a failed label print", scopes: ["read"], expiresAt: "2026-10-19T10:30:00.000Z" };

beforeEach(() => {
  get.mockReset();
  patch.mockReset();
});

describe("staff access visibility (WP-2.9, D8)", () => {
  it("ACC-L18-1 a tenant admin sees a banner while Fauward staff are in the workspace", async () => {
    get.mockResolvedValue({ data: { data: [active] } });
    renderAs("TENANT_ADMIN", <StaffAccessActiveBanner />);
    const banner = await screen.findByTestId("staff-access-active");
    expect(banner).toHaveTextContent("Sam Support from Fauward is in your workspace (read-only)");
    expect(banner).toHaveTextContent("Investigating a failed label print");
    expect(get).toHaveBeenCalledWith("/v1/tenants/me/staff-access/active");
  });

  it("other roles and the impersonating session itself do not poll for it", () => {
    renderAs("TENANT_STAFF", <StaffAccessActiveBanner />);
    renderAs("TENANT_ADMIN", <StaffAccessActiveBanner />, { mode: "IMPERSONATION" } as Partial<User>);
    expect(get).not.toHaveBeenCalled();
    expect(screen.queryByTestId("staff-access-active")).toBeNull();
  });

  it("the email setting is locked on outside Enterprise and can be turned off on Enterprise", async () => {
    get.mockResolvedValueOnce({ data: { notifyOnStaffAccess: true, canDisableEmail: false } });
    const first = renderAs("TENANT_ADMIN", <StaffAccessEmailSetting />);
    expect(await screen.findByRole("checkbox")).toBeDisabled();
    expect(screen.getByText(/Enterprise workspaces can turn the email off/)).toBeInTheDocument();
    first.unmount();

    get.mockResolvedValueOnce({ data: { notifyOnStaffAccess: true, canDisableEmail: true } });
    patch.mockResolvedValue({ data: { notifyOnStaffAccess: false, canDisableEmail: true } });
    renderAs("TENANT_ADMIN", <StaffAccessEmailSetting />);
    fireEvent.click(await screen.findByRole("checkbox"));
    await waitFor(() => expect(patch).toHaveBeenCalledWith("/v1/tenants/me/staff-access/settings", { notifyOnStaffAccess: false }));
    await waitFor(() => expect(screen.getByRole("checkbox")).not.toBeChecked());
  });
});
