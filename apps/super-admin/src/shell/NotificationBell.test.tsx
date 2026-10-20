import { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { consoleApi } from "@/lib/console-api";
import { NotificationBell } from "./NotificationBell";

const originalAdapter = consoleApi.defaults.adapter;

function adapterFrom(handler: (config: InternalAxiosRequestConfig) => { status: number; data: unknown }): AxiosAdapter {
  return async (config) => {
    const { status, data } = handler(config);
    const response: AxiosResponse = { status, statusText: String(status), data, headers: {}, config };
    if (status < 300) return response;
    throw new AxiosError("failed", AxiosError.ERR_BAD_RESPONSE, config, null, response);
  };
}

afterEach(() => {
  cleanup();
  consoleApi.defaults.adapter = originalAdapter;
});

function renderBell() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("NotificationBell", () => {
  it("ACC-FND-2 shows the caller's unread count and marks all read through the API", async () => {
    const calls: string[] = [];
    let unreadCount = 2;
    consoleApi.defaults.adapter = adapterFrom((config) => {
      calls.push(`${config.method?.toUpperCase()} ${config.url}`);
      if (config.url === "/notifications/staff/read-all") {
        unreadCount = 0;
        return { status: 200, data: { updated: 2 } };
      }
      return {
        status: 200,
        data: {
          unreadCount,
          nextCursor: null,
          data: [
            { id: "n1", event: "jit.requested", title: "JIT request from Ada", body: null, link: "/trust/jit/pending", severity: "ATTENTION", tenantId: null, readAt: unreadCount ? null : "2026-10-18T12:00:00Z", createdAt: "2026-10-18T11:00:00Z" }
          ]
        }
      };
    });

    renderBell();
    expect(await screen.findByTestId("notification-unread")).toHaveProperty("textContent", "2");
    fireEvent.click(screen.getByRole("button", { name: /Notifications, 2 unread/ }));
    expect(await screen.findByText("JIT request from Ada")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));
    await waitFor(() => expect(calls).toContain("POST /notifications/staff/read-all"));
    await waitFor(() => expect(screen.queryByTestId("notification-unread")).toBeNull());
  });

  it("shows the API error instead of an empty list", async () => {
    consoleApi.defaults.adapter = adapterFrom(() => ({ status: 500, data: { error: "INTERNAL", message: "Bell is down" } }));
    renderBell();
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(await screen.findByText(/Bell is down/)).toBeTruthy();
  });
});
