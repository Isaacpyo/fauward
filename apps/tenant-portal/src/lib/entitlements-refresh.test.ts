import { AxiosError, type AxiosAdapter, type AxiosResponse } from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, ENTITLEMENTS_STALE_EVENT } from "./api";

// ACC-L12-1 (UI side): when the backend refuses a plan feature the tenant config reloads at once, so PlanGate agrees
// with requireFeature without waiting for the next poll. The backend side (< 5 s across instances) is ACC-ENT-1.

const original = api.defaults.adapter;
afterEach(() => {
  api.defaults.adapter = original;
});

function respond(status: number, data: unknown): AxiosAdapter {
  return async (config) => {
    const response: AxiosResponse = { status, statusText: String(status), data, headers: {}, config };
    if (status < 400) return response;
    throw new AxiosError(`status ${status}`, AxiosError.ERR_BAD_REQUEST, config, null, response);
  };
}

describe("entitlement refresh (ACC-L12-1)", () => {
  it("a 403 FEATURE_NOT_AVAILABLE fires the stale-entitlements event; other 403s do not", async () => {
    const listener = vi.fn();
    window.addEventListener(ENTITLEMENTS_STALE_EVENT, listener);
    api.defaults.adapter = respond(403, { code: "FEATURE_NOT_AVAILABLE", error: "Upgrade required" });
    await expect(api.get("/v1/tenant/api-keys")).rejects.toBeInstanceOf(AxiosError);
    expect(listener).toHaveBeenCalledTimes(1);
    api.defaults.adapter = respond(403, { error: "Forbidden" });
    await expect(api.get("/v1/users")).rejects.toBeInstanceOf(AxiosError);
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(ENTITLEMENTS_STALE_EVENT, listener);
  });
});
