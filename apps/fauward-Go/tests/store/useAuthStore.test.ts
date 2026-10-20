import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { FieldUser } from "@/types/field";

// C61: the email-link sign-in token only arrives in the email (`/login?token=…&email=…`). The request call returns
// nothing token-like and the store keeps only the email it was sent to.

vi.mock("@/lib/api/fieldApi", () => ({
  fieldApi: {
    requestEmailLink: vi.fn(async () => undefined),
    consumeEmailLink: vi.fn(),
    login: vi.fn(),
    getMe: vi.fn(),
    logout: vi.fn(async () => undefined),
  },
}));

const memory = new Map<string, string>();
// What an older build left behind: the token the API used to return.
memory.set("fauward-go-auth-v2", JSON.stringify({ state: { emailLinkTarget: "old@example.com", emailLinkToken: "stale-token" }, version: 0 }));
vi.stubGlobal("localStorage", {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => void memory.set(key, value),
  removeItem: (key: string) => void memory.delete(key),
});

const user: FieldUser = {
  id: "user-1",
  tenantId: "tenant-1",
  name: "Ada Driver",
  email: "ada@example.com",
  role: "Driver",
  tenantLabel: "Northline",
  vehicleLabel: "Van 4",
  shiftLabel: "Morning",
  permissions: [],
};

let useAuthStore: typeof import("@/store/useAuthStore").useAuthStore;
let fieldApi: typeof import("@/lib/api/fieldApi").fieldApi;

beforeAll(async () => {
  ({ useAuthStore } = await import("@/store/useAuthStore"));
  ({ fieldApi } = await import("@/lib/api/fieldApi"));
});

describe("useAuthStore email-link sign-in", () => {
  afterEach(() => {
    useAuthStore.getState().signOut();
    vi.mocked(fieldApi.requestEmailLink).mockClear();
    vi.mocked(fieldApi.consumeEmailLink).mockReset();
  });

  it("requesting a link keeps only the email it was sent to, and drops a token an older build stored", async () => {
    const result = await useAuthStore.getState().requestEmailSignInLink(" Ada@Example.com ");

    expect(result).toEqual({ ok: true });
    expect(fieldApi.requestEmailLink).toHaveBeenCalledWith("ada@example.com");
    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: false, emailLinkTarget: "ada@example.com" });
    expect(useAuthStore.getState()).not.toHaveProperty("emailLinkToken");
    expect(memory.get("fauward-go-auth-v2")).toContain("ada@example.com");
    expect(memory.get("fauward-go-auth-v2")).not.toContain("stale-token");
  });

  it("signs in with the token and email from the link, without a request on this device", async () => {
    vi.mocked(fieldApi.consumeEmailLink).mockResolvedValueOnce({ accessToken: "access-1", tenantSlug: "northline", user });

    const result = await useAuthStore.getState().signInWithEmailLink("link-token", "Ada@Example.com");

    expect(result).toEqual({ ok: true });
    expect(fieldApi.consumeEmailLink).toHaveBeenCalledWith("ada@example.com", "link-token");
    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: true, accessToken: "access-1", tenantSlug: "northline", emailLinkTarget: undefined });
  });

  it("falls back to the email the link was requested for when the link has none", async () => {
    vi.mocked(fieldApi.consumeEmailLink).mockResolvedValueOnce({ accessToken: "access-2", tenantSlug: "northline", user });
    await useAuthStore.getState().requestEmailSignInLink("ada@example.com");

    const result = await useAuthStore.getState().signInWithEmailLink("link-token", "");

    expect(result).toEqual({ ok: true });
    expect(fieldApi.consumeEmailLink).toHaveBeenCalledWith("ada@example.com", "link-token");
  });

  it("does not call the API without a token from the link", async () => {
    await useAuthStore.getState().requestEmailSignInLink("ada@example.com");

    const result = await useAuthStore.getState().signInWithEmailLink(undefined);

    expect(result).toEqual({ ok: false, message: "Open the sign-in link from your email." });
    expect(fieldApi.consumeEmailLink).not.toHaveBeenCalled();
  });
});
