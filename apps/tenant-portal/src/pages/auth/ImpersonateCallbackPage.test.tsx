import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.fn();
vi.mock("@/lib/api", () => ({ api: { post: (...args: unknown[]) => post(...args) } }));

import { getAccessToken, getTenantSlug, isImpersonationSession } from "@/lib/auth";
import { ImpersonateCallbackPage, readImpersonationCode } from "./ImpersonateCallbackPage";

function renderAt() {
  return render(
    <MemoryRouter initialEntries={["/auth/impersonate"]}>
      <Routes>
        <Route path="/auth/impersonate" element={<ImpersonateCallbackPage />} />
        <Route path="/" element={<p>TENANT HOME</p>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  post.mockReset();
});

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("ImpersonateCallbackPage (D8, S18)", () => {
  it("ACC-IMP-3 exchanges the fragment code once, stores the token in sessionStorage only and drops the hash", async () => {
    localStorage.setItem("fw_access_token", "tenant-users-own-token");
    window.history.replaceState(null, "", "/auth/impersonate#code=one-time-code");
    post.mockResolvedValue({ data: { token: "impersonation.jwt.token", expiresAt: "2026-10-18T12:15:00.000Z", scopes: ["read"], tenant: { id: "t1", slug: "northwind", name: "Northwind" } } });

    renderAt();

    expect(await screen.findByText("TENANT HOME")).toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith("/v1/auth/impersonation/exchange", { code: "one-time-code" });
    expect(window.location.hash).toBe("");
    expect(sessionStorage.getItem("fw_impersonation_token")).toBe("impersonation.jwt.token");
    expect(localStorage.getItem("fw_access_token")).toBe("tenant-users-own-token");
    expect(getAccessToken()).toBe("impersonation.jwt.token");
    expect(getTenantSlug()).toBe("northwind");
    expect(isImpersonationSession()).toBe(true);
  });

  it("shows an error for an expired or reused code and stores nothing", async () => {
    window.history.replaceState(null, "", "/auth/impersonate#code=used-code");
    post.mockRejectedValue(new Error("401"));
    renderAt();
    expect(await screen.findByRole("alert")).toHaveTextContent("expired or was already used");
    await waitFor(() => expect(sessionStorage.getItem("fw_impersonation_token")).toBeNull());
  });

  it("ignores a legacy ?token= link", async () => {
    window.history.replaceState(null, "", "/auth/impersonate?token=eyJhbGciOi.legacy.token");
    renderAt();
    expect(await screen.findByRole("alert")).toHaveTextContent("missing its code");
    expect(post).not.toHaveBeenCalled();
    expect(getAccessToken()).toBeNull();
  });

  it("reads the code from the fragment", () => {
    expect(readImpersonationCode("#code=abc")).toBe("abc");
    expect(readImpersonationCode("")).toBeNull();
  });
});
