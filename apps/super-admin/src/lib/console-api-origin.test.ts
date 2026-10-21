import { describe, expect, it } from "vitest";

import { consoleApiOrigin, consoleApiUrl } from "./console-api-origin";

describe("console API origin (WP-5.4 follow-up)", () => {
  it("production console calls the API host directly, so Cloudflare sees the staff member's address", () => {
    expect(consoleApiOrigin("admin.fauward.com")).toBe("https://api.fauward.com");
  });

  it("previews and local dev keep the same-origin /api/internal proxy", () => {
    expect(consoleApiOrigin("fauward-super-admin-git-x-vitalos.vercel.app")).toBe("");
    expect(consoleApiOrigin("localhost")).toBe("");
    expect(consoleApiOrigin(undefined)).toBe("");
  });

  it("VITE_CONSOLE_API_ORIGIN overrides both", () => {
    expect(consoleApiOrigin("localhost", "https://api.example.test/")).toBe("https://api.example.test");
  });

  it("builds endpoint URLs under /api/internal", () => {
    expect(consoleApiUrl("/activity/stream")).toBe("/api/internal/activity/stream");
    expect(consoleApiUrl("qbr/decks/1/download")).toBe("/api/internal/qbr/decks/1/download");
  });
});
