import fs from "node:fs";
import path from "node:path";
import type { AxiosAdapter, AxiosResponse } from "axios";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { consoleApi } from "@/lib/console-api";
import { PILLARS, SERVICES } from "@/pillars/_manifests";
import { ServiceRow } from "./ServiceRow";

// WP-3.4: badges come from GET /badges only; a service renders a badge only for a key the response holds.

const originalAdapter = consoleApi.defaults.adapter;
afterEach(() => {
  cleanup();
  consoleApi.defaults.adapter = originalAdapter;
});

/** The keys the backend computes, read from the service source like the reconcile test reads route-index.ts. */
function backendBadgeKeys() {
  const file = path.resolve(__dirname, "../../../backend/src/services/console-badges.service.ts");
  const block = fs.readFileSync(file, "utf8").match(/export const BADGE_KEYS = \[([\s\S]*?)\] as const;/);
  return [...(block?.[1] ?? "").matchAll(/'([a-z0-9-]+)'/g)].map((match) => match[1]);
}

function renderRows(response: Record<string, unknown>) {
  const adapter: AxiosAdapter = async (config) => ({ status: 200, statusText: "OK", data: response, headers: {}, config }) as AxiosResponse;
  consoleApi.defaults.adapter = adapter;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const platform = PILLARS.find((pillar) => pillar.id === "platform")!;
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        {platform.services.map((service) => (
          <ServiceRow key={service.id} pillar={platform} service={service} />
        ))}
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("service badges (WP-3.4)", () => {
  it("ACC-BADGE-1 every manifest badgeKey is a key the badges endpoint computes", () => {
    const backend = backendBadgeKeys();
    expect(backend.length).toBeGreaterThanOrEqual(13);
    const used = SERVICES.flatMap((service) => (service.badgeKey ? [service.badgeKey] : []));
    expect(used.length).toBeGreaterThan(5);
    for (const key of used) expect(backend, key).toContain(key);
    // One key per service at most, and no key is shared by two services.
    expect(new Set(used).size).toBe(used.length);
  });

  it("ACC-BADGE-2 no service renders a badge without a key in the response, and values are formatted, never placeholders", async () => {
    renderRows({
      "tenant-count": { value: 46, tone: "neutral", asOf: "2026-10-20T10:00:00.000Z" },
      "dlq-depth": { value: 7, tone: "red", asOf: "2026-10-20T10:00:00.000Z" },
      "p95-latency": { value: null, tone: "neutral", unit: "ms", asOf: "2026-10-20T10:00:00.000Z", reason: "No API requests recorded in the last 15 minutes" }
      // failed-jobs-24h and open-escalations are absent: the caller cannot read them.
    });
    expect((await screen.findByTestId("badge-tenant-count")).textContent).toBe("46");
    expect((screen.getByTestId("badge-dlq-depth")).textContent).toBe("7");
    expect((screen.getByTestId("badge-p95-latency")).textContent).toBe("no data");
    expect(screen.getByTestId("badge-p95-latency").getAttribute("title")).toBe("No API requests recorded in the last 15 minutes");
    expect(screen.queryByTestId("badge-failed-jobs-24h")).toBeNull();
    expect(screen.queryByTestId("badge-open-escalations")).toBeNull();
    // Services without a badge key (impersonation, flags, database) render no badge element at all.
    expect(document.querySelectorAll('[data-testid^="badge-"]')).toHaveLength(3);
    expect(document.body.textContent).not.toMatch(/(^|\s)-(\s|$)|\.\.\./);
  });
});
