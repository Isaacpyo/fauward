import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getTenantBySlugOrHistory } from "@fauward/tenant-db";
import { notFound, permanentRedirect } from "next/navigation";

import HostedShipmentPage, { generateMetadata } from "../app/ship/[tenant]/page";
import { signWidgetToken } from "../lib/widgetToken";

const formType = vi.hoisted(() => "mock-create-shipment-form");

vi.mock("@fauward/tenant-db", () => ({
  getTenantBySlugOrHistory: vi.fn(),
}));

vi.mock("@/lib/widgetToken", () => ({
  signWidgetToken: vi.fn(),
}));

const headerStore = { host: "www.fauward.com" };

vi.mock("next/headers", () => ({
  headers: vi.fn(() => ({
    get: (name: string) => (name.toLowerCase() === "host" ? headerStore.host : null),
  })),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  permanentRedirect: vi.fn((url: string) => {
    const error = new Error("NEXT_REDIRECT") as Error & { digest: string };
    error.digest = `NEXT_REDIRECT;replace;${url};308;`;
    throw error;
  }),
}));

vi.mock("@/components/shipments/CreateShipmentForm", () => ({
  default: formType,
}));

type ElementProps = Record<string, unknown> & {
  children?: React.ReactNode;
};

const activeTenant = {
  id: "tenant-a",
  slug: "acme",
  name: "Acme Logistics",
  displayName: "Acme Logistics",
  brandName: "Acme Logistics",
  trackingHeadline: "Track your shipment",
  plan: "PRO",
  status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00.000Z",
  created_at: "2026-01-01T00:00:00.000Z",
  primaryColor: "#111111",
  accentColor: "#222222",
  logoUrl: "https://cdn.example/logo.png",
  region: "uk_europe",
  defaultCurrency: "GBP",
  defaultLanguage: "en-GB",
  timezone: "Europe/London",
  isRtl: false,
  smsEnabled: true,
  branding: {
    primary: "#111111",
    accent: "#222222",
    radius: "10px",
    logoUrl: "https://cdn.example/logo.png",
  },
  settings: {
    paymentGateway: "STRIPE",
    paymentGatewayKey: null,
    timezone: "Europe/London",
    currency: "GBP",
    serviceTierConfig: null,
    insuranceConfig: null,
    taxConfig: null,
    dimensionalDivisor: 5000,
    quoteValidityMinutes: 30,
    showPriceBreakdownToCustomer: true,
  },
};

function elementProps(element: React.ReactElement): ElementProps {
  return element.props as ElementProps;
}

function findElementByType(node: React.ReactNode, type: string): React.ReactElement<ElementProps> | null {
  if (!React.isValidElement(node)) return null;
  if (node.type === type) return node as React.ReactElement<ElementProps>;

  const children = elementProps(node).children;
  const childArray = React.Children.toArray(children);
  for (const child of childArray) {
    const found = findElementByType(child, type);
    if (found) return found;
  }
  return null;
}

describe("hosted shipment page", () => {
  beforeEach(() => {
    vi.mocked(getTenantBySlugOrHistory).mockReset();
    vi.mocked(signWidgetToken).mockReset();
    vi.mocked(notFound).mockClear();
    vi.mocked(permanentRedirect).mockClear();
    headerStore.host = "www.fauward.com";
  });

  it("renders an active tenant with first-party widget props and branding", async () => {
    vi.mocked(getTenantBySlugOrHistory).mockResolvedValue({ tenant: activeTenant });
    vi.mocked(signWidgetToken).mockResolvedValue("signed-token");

    const element = await HostedShipmentPage({ params: { tenant: "acme" } });
    const props = elementProps(element);
    const form = findElementByType(element, formType);

    expect(signWidgetToken).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      tenantSlug: "acme",
      allowedOrigin: "*",
    });
    expect(props.style).toMatchObject({
      "--brand-primary": "#111111",
      "--brand-accent": "#222222",
      "--brand-radius": "10px",
    });
    expect(form?.props).toMatchObject({
      embedded: false,
      tenantSlug: "acme",
      widgetToken: "signed-token",
      tenantConfig: expect.objectContaining({
        regionKey: "uk_europe",
        currency: "GBP",
        locale: "en-GB",
      }),
    });
  });

  it("permanently redirects old slugs to /ship/<currentSlug> on non-ship hosts", async () => {
    vi.mocked(getTenantBySlugOrHistory).mockResolvedValue({
      tenant: activeTenant,
      redirectToSlug: "acme",
    });

    await expect(HostedShipmentPage({ params: { tenant: "old-acme" } })).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;replace;/ship/acme;308;",
    });
    expect(permanentRedirect).toHaveBeenCalledWith("/ship/acme");
  });

  it("permanently redirects old slugs to bare /<currentSlug> under ship.fauward.com", async () => {
    headerStore.host = "ship.fauward.com";
    vi.mocked(getTenantBySlugOrHistory).mockResolvedValue({
      tenant: activeTenant,
      redirectToSlug: "acme",
    });

    await expect(HostedShipmentPage({ params: { tenant: "old-acme" } })).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;replace;/acme;308;",
    });
    expect(permanentRedirect).toHaveBeenCalledWith("/acme");
  });

  it("calls notFound for missing or reserved slugs", async () => {
    vi.mocked(getTenantBySlugOrHistory).mockResolvedValue(null);

    await expect(HostedShipmentPage({ params: { tenant: "admin" } })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("returns indexable metadata with displayName", async () => {
    vi.mocked(getTenantBySlugOrHistory).mockResolvedValue({ tenant: activeTenant });

    await expect(generateMetadata({ params: { tenant: "acme" } })).resolves.toMatchObject({
      title: "Acme Logistics Shipping",
      robots: { index: true, follow: true },
    });
  });
});
