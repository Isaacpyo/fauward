import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { getTenantBySlugOrHistory } from "@fauward/tenant-db";
import { notFound, permanentRedirect } from "next/navigation";

import CreateShipmentForm from "@/components/shipments/CreateShipmentForm";
import { buildTenantConfig } from "@/lib/shipmentTenantConfig";
import { signWidgetToken } from "@/lib/widgetToken";

export const dynamic = "force-dynamic";

type PageProps = {
  params: {
    tenant: string;
  };
};

type BrandStyle = CSSProperties &
  Record<"--brand-primary" | "--brand-accent" | "--brand-radius", string>;

const FALLBACK_PRIMARY = "#0D1F3C";
const FALLBACK_ACCENT = "#D97706";
const FALLBACK_RADIUS = "8px";

async function resolveHostedTenant(slug: string) {
  return getTenantBySlugOrHistory(slug);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const result = await resolveHostedTenant(params.tenant);
  const displayName = result?.tenant.displayName ?? "Ship a Package";

  return {
    title: `${displayName} Shipping`,
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default async function HostedShipmentPage({ params }: PageProps) {
  const result = await resolveHostedTenant(params.tenant);
  if (!result) notFound();

  if ("redirectToSlug" in result) {
    permanentRedirect(`/ship/${result.redirectToSlug}`);
  }

  const { tenant } = result;
  const token = await signWidgetToken({
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    allowedOrigin: "*",
  });

  const branding = tenant.branding;
  const tenantConfig = buildTenantConfig(tenant);
  const style: BrandStyle = {
    "--brand-primary": branding.primary ?? FALLBACK_PRIMARY,
    "--brand-accent": branding.accent ?? FALLBACK_ACCENT,
    "--brand-radius": branding.radius ?? FALLBACK_RADIUS,
  };

  return (
    <div className="min-h-screen bg-white" style={style}>
      <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 flex items-center gap-3 border-b border-gray-100 pb-4">
          {branding.logoUrl ? (
            // External tenant logo domains are not known at build time.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branding.logoUrl}
              alt={`${tenant.displayName} logo`}
              className="h-10 w-10 rounded object-contain"
            />
          ) : null}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Shipment booking</p>
            <h1 className="text-xl font-semibold text-gray-950">{tenant.displayName}</h1>
          </div>
        </header>

        <CreateShipmentForm embedded={false} tenantSlug={tenant.slug} widgetToken={token} tenantConfig={tenantConfig} />
      </main>
    </div>
  );
}
