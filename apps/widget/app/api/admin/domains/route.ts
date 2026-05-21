import { NextRequest, NextResponse } from "next/server";

import { authorizeWidgetDomainAdmin } from "@/lib/adminAuth";
import { cnameRecordName, DomainValidationError, normalizeDomainInput } from "@/lib/domainValidation";
import { mapDomainToTenant, unmapDomain } from "@/lib/edgeConfigAdmin";
import { addDomainToProject, CNAME_TARGET, getDomainStatus, removeDomainFromProject } from "@/lib/vercelDomains";
import {
  assertWidgetDomainAvailable,
  createWidgetDomain,
  deleteWidgetDomain,
  getWidgetDomain,
  markWidgetDomainVerified,
  WidgetDomainConflictError,
} from "@/lib/widgetDomainsDb";

export const runtime = "nodejs";

type DomainBody = {
  domain?: unknown;
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function errorResponse(error: unknown) {
  if (error instanceof DomainValidationError) {
    return json({ error: "VALIDATION_ERROR", message: error.message }, 400);
  }
  if (error instanceof WidgetDomainConflictError) {
    return json({ error: "DOMAIN_CONFLICT", message: error.message }, 409);
  }
  if (error instanceof Error) {
    return json({ error: "DOMAIN_ADMIN_ERROR", message: error.message }, 502);
  }
  return json({ error: "DOMAIN_ADMIN_ERROR", message: "Unknown error" }, 502);
}

async function readDomainBody(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as DomainBody | null;
  if (!body || typeof body.domain !== "string") {
    throw new DomainValidationError("Missing domain");
  }
  return normalizeDomainInput(body.domain);
}

function readDomainQuery(req: NextRequest) {
  const domain = req.nextUrl.searchParams.get("domain");
  if (!domain) throw new DomainValidationError("Missing domain");
  return normalizeDomainInput(domain);
}

export async function POST(req: NextRequest) {
  const tenant = await authorizeWidgetDomainAdmin(req.headers.get("authorization"), "domains:write");
  if (!tenant) return json({ error: "Unauthorized" }, 401);

  try {
    const domain = await readDomainBody(req);
    await assertWidgetDomainAvailable(domain, tenant.id);
    await createWidgetDomain(tenant.id, domain);

    const projectDomain = await addDomainToProject(domain);

    return json({
      domain,
      tenantSlug: tenant.slug,
      cname: {
        type: "CNAME",
        name: cnameRecordName(domain),
        value: CNAME_TARGET,
      },
      status: {
        verified: projectDomain.verified,
        misconfigured: false,
        verification: projectDomain.verification ?? [],
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(req: NextRequest) {
  const tenant = await authorizeWidgetDomainAdmin(req.headers.get("authorization"), "domains:read");
  if (!tenant) return json({ error: "Unauthorized" }, 401);

  try {
    const domain = readDomainQuery(req);
    const row = await getWidgetDomain(domain);
    if (!row || row.tenantId !== tenant.id) return json({ error: "Domain not found" }, 404);

    const status = await getDomainStatus(domain);
    if (status.verified && !status.misconfigured) {
      await markWidgetDomainVerified(domain, tenant.id);
      await mapDomainToTenant(domain, tenant.slug);
    }

    return json({ domain, tenantSlug: tenant.slug, status });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(req: NextRequest) {
  const tenant = await authorizeWidgetDomainAdmin(req.headers.get("authorization"), "domains:write");
  if (!tenant) return json({ error: "Unauthorized" }, 401);

  try {
    const domain = readDomainQuery(req);
    const row = await getWidgetDomain(domain);
    if (!row || row.tenantId !== tenant.id) return json({ error: "Domain not found" }, 404);

    await removeDomainFromProject(domain);
    await unmapDomain(domain);
    await deleteWidgetDomain(domain, tenant.id);

    return json({ ok: true, domain });
  } catch (error) {
    return errorResponse(error);
  }
}
