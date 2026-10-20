import { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SuperAdminGuard } from "@/auth/SuperAdminGuard";
import { consoleApi, consoleClientHooks, loginUrlFor, platformApi, refreshClient } from "./console-api";
import { ConsoleApiError } from "./console-api-error";
import { registerStepUpHandler } from "./mfa-step-up";

type Handler = (config: InternalAxiosRequestConfig) => { status: number; data: unknown } | Promise<{ status: number; data: unknown }>;

function adapterFrom(handler: Handler): AxiosAdapter {
  return async (config) => {
    const { status, data } = await handler(config);
    const response: AxiosResponse = { status, statusText: String(status), data, headers: {}, config };
    if (status >= 200 && status < 300) return response;
    throw new AxiosError(`Request failed with status code ${status}`, AxiosError.ERR_BAD_RESPONSE, config, null, response);
  };
}

const originalAdapters = { console: consoleApi.defaults.adapter, platform: platformApi.defaults.adapter, refresh: refreshClient.defaults.adapter };
let redirects: string[] = [];

beforeEach(() => {
  redirects = [];
  vi.spyOn(consoleClientHooks, "redirectToLogin").mockImplementation((next: string) => {
    redirects.push(next);
  });
  vi.spyOn(consoleClientHooks, "currentPath").mockReturnValue("/revenue/dunning?page=2");
  document.cookie = "fw_platform_csrf=test-csrf; path=/";
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  consoleApi.defaults.adapter = originalAdapters.console;
  platformApi.defaults.adapter = originalAdapters.platform;
  refreshClient.defaults.adapter = originalAdapters.refresh;
});

const meBody = (pending: boolean) => ({
  user: { id: "u", email: "e@fauward.com", name: null, role: null, permissions: ["platform.tenants.read"], mfaEnabled: !pending, mfaVerifiedAt: pending ? null : "2026-10-18T10:00:00.000Z" },
  mfa: { enabled: !pending, verifiedAt: pending ? null : "2026-10-18T10:00:00.000Z", pending },
  roles: [],
  permissions: ["platform.tenants.read"],
  jit: []
});

describe("console API client (architecture §5)", () => {
  it("ACC-CLIENT-1 five concurrent 401s trigger exactly one refresh and each request retries once", async () => {
    let sessionValid = false;
    const calls = new Map<string, number>();
    let refreshCalls = 0;
    consoleApi.defaults.adapter = adapterFrom((config) => {
      calls.set(config.url!, (calls.get(config.url!) ?? 0) + 1);
      return sessionValid ? { status: 200, data: { url: config.url } } : { status: 401, data: { error: "Unauthorized" } };
    });
    refreshClient.defaults.adapter = adapterFrom(async (config) => {
      expect(config.url).toBe("/auth/refresh");
      refreshCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      sessionValid = true;
      return { status: 200, data: { success: true } };
    });

    const urls = ["/a", "/b", "/c", "/d", "/e"];
    const results = await Promise.all(urls.map((url) => consoleApi.get(url)));

    expect(refreshCalls).toBe(1);
    expect(results.map((result) => result.data)).toEqual(urls.map((url) => ({ url })));
    for (const url of urls) expect(calls.get(url)).toBe(2);
    expect(redirects).toEqual([]);
  });

  it("ACC-CLIENT-2 a failed refresh redirects to /login?next=<path>", async () => {
    consoleApi.defaults.adapter = adapterFrom(() => ({ status: 401, data: { error: "Unauthorized" } }));
    refreshClient.defaults.adapter = adapterFrom(() => ({ status: 401, data: { error: "Unauthorized" } }));

    await expect(consoleApi.get("/dunning/failed-payments")).rejects.toMatchObject({ status: 401 });
    expect(redirects).toEqual(["/revenue/dunning?page=2"]);
    expect(loginUrlFor("/revenue/dunning?page=2")).toBe("/login?next=%2Frevenue%2Fdunning%3Fpage%3D2");
  });

  it("ACC-CLIENT-3 403 MFA_REQUIRED opens the step-up and replays once with the same Idempotency-Key", async () => {
    const keys: Array<string | undefined> = [];
    let verified = false;
    consoleApi.defaults.adapter = adapterFrom((config) => {
      keys.push(config.headers.get("Idempotency-Key")?.toString());
      return verified ? { status: 200, data: { ok: true } } : { status: 403, data: { error: "MFA_REQUIRED", stepUp: true } };
    });
    let stepUps = 0;
    const unregister = registerStepUpHandler((request) => {
      stepUps += 1;
      verified = true;
      request.resolve();
    });

    const response = await consoleApi.post("/iam/users/u1/mfa/reset", { reason: "lost device" }, { idempotent: true });
    unregister();

    expect(response.data).toEqual({ ok: true });
    expect(stepUps).toBe(1);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toMatch(/.+/);
    expect(keys[1]).toBe(keys[0]);
  });

  it("ACC-CLIENT-3 cancelling the step-up rejects with MFA_REQUIRED and does not replay", async () => {
    let calls = 0;
    consoleApi.defaults.adapter = adapterFrom(() => {
      calls += 1;
      return { status: 403, data: { error: "MFA_REQUIRED", stepUp: true } };
    });
    const unregister = registerStepUpHandler((request) => request.reject(new Error("cancelled")));
    await expect(consoleApi.post("/x", {})).rejects.toMatchObject({ code: "MFA_REQUIRED", status: 403 });
    unregister();
    expect(calls).toBe(1);
  });

  it("401 MFA_PENDING routes to the login MFA step without a refresh", async () => {
    let refreshCalls = 0;
    consoleApi.defaults.adapter = adapterFrom(() => ({ status: 401, data: { error: "MFA_PENDING", mfa: "ENROLL" } }));
    refreshClient.defaults.adapter = adapterFrom(() => {
      refreshCalls += 1;
      return { status: 200, data: {} };
    });
    await expect(consoleApi.get("/tenants")).rejects.toMatchObject({ code: "MFA_PENDING" });
    expect(refreshCalls).toBe(0);
    expect(redirects).toEqual(["/revenue/dunning?page=2"]);
  });

  it("normalises errors to ConsoleApiError with status, code and permission", async () => {
    consoleApi.defaults.adapter = adapterFrom(() => ({ status: 403, data: { error: "Forbidden", permission: "revenue.dunning.read" } }));
    const error = await consoleApi.get("/dunning/failed-payments").catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ConsoleApiError);
    expect(error).toMatchObject({ status: 403, code: "HTTP_403", permission: "revenue.dunning.read" });
  });
});

describe("SuperAdminGuard (architecture §2.5)", () => {
  function renderGuard() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/platform/tenants"]}>
          <Routes>
            <Route path="/login" element={<p>LOGIN PAGE</p>} />
            <Route element={<SuperAdminGuard />}>
              <Route path="/platform/tenants" element={<p>TENANTS PAGE</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  it("ACC-CLIENT-4 /auth/me returning 500 shows the error screen, not the login page", async () => {
    consoleApi.defaults.adapter = adapterFrom(() => ({ status: 500, data: { error: "INTERNAL", message: "database unavailable" } }));
    renderGuard();
    expect(await screen.findByText("The console could not load your session")).toBeTruthy();
    expect(screen.queryByText("LOGIN PAGE")).toBeNull();
    expect(screen.getByTestId("console-error-status").textContent).toBe("500");
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("ACC-CLIENT-4 a 401 from /auth/me (refresh failed) goes to the login page", async () => {
    consoleApi.defaults.adapter = adapterFrom(() => ({ status: 401, data: { error: "Unauthorized" } }));
    refreshClient.defaults.adapter = adapterFrom(() => ({ status: 401, data: { error: "Unauthorized" } }));
    renderGuard();
    expect(await screen.findByText("LOGIN PAGE")).toBeTruthy();
    expect(redirects).toEqual([]);
  });

  it("an MFA-pending session is sent to the login MFA step", async () => {
    consoleApi.defaults.adapter = adapterFrom(() => ({ status: 200, data: meBody(true) }));
    renderGuard();
    await waitFor(() => expect(screen.getByText("LOGIN PAGE")).toBeTruthy());
  });

  it("a verified session renders the page", async () => {
    consoleApi.defaults.adapter = adapterFrom(() => ({ status: 200, data: meBody(false) }));
    renderGuard();
    expect(await screen.findByText("TENANTS PAGE")).toBeTruthy();
  });
});
